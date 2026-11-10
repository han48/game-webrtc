// Shared PvP match session for the four board games (caro, chess, xiangqi, dongtay).
//
// This module is engine-agnostic: it delegates rules to the per-game engines and
// manages the *multiplayer* concerns that the single-player bot panel never had:
//   • two seats (host + challenger), each bound to a peerId and a colour/side
//   • whose turn it is, and whether a given peer may move
//   • viewers (read-only spectators)
//   • a serialisable snapshot for syncing over the data channel
//
// The match is leader/host-authoritative: one client owns the ChessMatchSession
// instance, applies validated moves, and broadcasts snapshots. Other clients
// (challenger + viewers) render snapshots and send move *commands* back.
//
// Pure JS, no DOM, JSON-serialisable state → safe to unit test and to send over
// a WebRTC data channel.

import * as gomoku from './gomoku.js';
import * as chess from './chess.js';
import * as xiangqi from './xiangqi.js';
import * as dongtay from './dongtay.js';

export const CHESS_MATCH_GAMES = ['caro', 'chess', 'xiangqi', 'dongtay'];

// Per-game descriptor: the two side identifiers and who moves first.
// `first` is the side that makes the opening move by the rules of that game.
const GAME_META = {
  caro:    { sides: ['black', 'white'], first: 'black', label: 'Cờ Ca Rô' },
  chess:   { sides: ['white', 'black'], first: 'white', label: 'Cờ Vua' },
  xiangqi: { sides: ['red', 'black'],   first: 'red',   label: 'Cờ Tướng' },
  dongtay: { sides: ['west', 'east'],   first: 'west',  label: 'Cờ Đông Tây' },
};

export function getMatchGameMeta(game) {
  return GAME_META[game] || null;
}

// ── Engine adapters ──────────────────────────────────────────────────────────
// Normalise the four engines behind one interface the session can use.

function makeInitialEngineState(game, layout) {
  switch (game) {
    case 'caro': return { board: gomoku.createBoard() };
    case 'chess': return chess.createInitialState();
    case 'xiangqi': return { board: xiangqi.createInitialBoard() };
    case 'dongtay': return dongtay.createInitialState(layout || 'A');
    default: throw new Error(`Unknown match game: ${game}`);
  }
}

// Caro uses numeric players (1 = black/first, 2 = white/second).
function caroPlayerForSide(side) {
  return side === 'black' ? 1 : 2;
}

// Apply a move for `side`; returns new engine state or null if the move is illegal.
function applyEngineMove(game, engineState, side, move) {
  switch (game) {
    case 'caro': {
      const { row, col } = move;
      const board = engineState.board;
      if (!board[row] || board[row][col] !== 0) return null;
      return { board: gomoku.applyMove(board, row, col, caroPlayerForSide(side)) };
    }
    case 'chess': {
      const legal = chess.getLegalMoves(engineState, side);
      const ok = legal.some((m) => sameMove(m, move));
      if (!ok) return null;
      return chess.applyMove(engineState, move.from, move.to, move.promo || 'q');
    }
    case 'xiangqi': {
      const legal = xiangqi.getLegalMoves(engineState.board, side);
      const ok = legal.some((m) => sameMove(m, move));
      if (!ok) return null;
      return { board: xiangqi.applyMove(engineState.board, move.from, move.to) };
    }
    case 'dongtay': {
      const legal = dongtay.getLegalMoves(engineState, side);
      const ok = legal.some((m) => sameMove(m, move));
      if (!ok) return null;
      return dongtay.applyMove(engineState, move.from, move.to, move.promo || 'q');
    }
    default: return null;
  }
}

function sameMove(a, b) {
  if (!a || !b || !a.from || !a.to || !b.from || !b.to) return false;
  return a.from.row === b.from.row && a.from.col === b.from.col
    && a.to.row === b.to.row && a.to.col === b.to.col;
}

// Return 'host' | 'challenger' | 'draw' | null given the engine result and the
// side-to-result mapping. Each engine reports a winning *side* (or 'draw'/null).
function engineResult(game, engineState) {
  switch (game) {
    case 'caro': {
      if (gomoku.checkWin(engineState.board, 1)) return 'black';
      if (gomoku.checkWin(engineState.board, 2)) return 'white';
      if (gomoku.isDraw(engineState.board)) return 'draw';
      return null;
    }
    case 'chess': return chess.checkResult(engineState);         // 'white'|'black'|'draw'|null
    case 'xiangqi': return xiangqi.checkWin(engineState.board);  // 'red'|'black'|null
    case 'dongtay': return dongtay.checkResult(engineState);     // 'east'|'west'|'draw'|null
    default: return null;
  }
}

// ── Session ────────────────────────────────────────────────────────────────

export class ChessMatchSession {
  // game: one of CHESS_MATCH_GAMES
  // hostPeerId: the peer that opened/owns the table
  // options: { layout?, hostSide? }  hostSide defaults to the first-moving side.
  constructor(game, hostPeerId, options = {}) {
    if (!GAME_META[game]) throw new Error(`Unknown match game: ${game}`);
    this.game = game;
    this.layout = options.layout || (game === 'dongtay' ? 'A' : null);
    const meta = GAME_META[game];

    // Seats: host chooses a side; challenger gets the other.
    const hostSide = options.hostSide && meta.sides.includes(options.hostSide)
      ? options.hostSide
      : meta.first;
    const challengerSide = meta.sides.find((s) => s !== hostSide);

    this.seats = {
      host: { peerId: hostPeerId, name: options.hostName || '', side: hostSide },
      challenger: { peerId: null, name: '', side: challengerSide },
    };
    this.viewers = new Map(); // peerId -> name

    this.engineState = makeInitialEngineState(game, this.layout);
    this.turnSide = meta.first; // side to move now
    this.phase = 'waiting';     // 'waiting' | 'playing' | 'finished'
    this.result = null;         // 'host' | 'challenger' | 'draw' | null
    this.version = 0;           // increments on every state change (for ordering)
    this.lastMove = null;       // {from,to} or {row,col} of the most recent move
  }

  // Seat the challenger (first non-host peer to sit). Returns true if seated.
  sitChallenger(peerId, name = '') {
    if (!peerId || peerId === this.seats.host.peerId) return false;
    if (this.seats.challenger.peerId && this.seats.challenger.peerId !== peerId) return false;
    this.seats.challenger.peerId = peerId;
    this.seats.challenger.name = name;
    this.viewers.delete(peerId);
    if (this.phase === 'waiting') this.phase = 'playing';
    this.version += 1;
    return true;
  }

  // Add/refresh a viewer (anyone who is not a seated player).
  addViewer(peerId, name = '') {
    if (!peerId) return false;
    if (peerId === this.seats.host.peerId || peerId === this.seats.challenger.peerId) return false;
    this.viewers.set(peerId, name);
    this.version += 1;
    return true;
  }

  // Remove a peer from any role. If a seated player leaves, the match ends.
  removePeer(peerId) {
    if (this.viewers.delete(peerId)) { this.version += 1; return true; }
    if (peerId === this.seats.challenger.peerId) {
      this.seats.challenger.peerId = null;
      this.seats.challenger.name = '';
      if (this.phase === 'playing') { this.phase = 'waiting'; }
      this.version += 1;
      return true;
    }
    if (peerId === this.seats.host.peerId) {
      // Host left — the match is over; the table should be torn down by the owner.
      this.phase = 'finished';
      this.result = this.result || 'challenger';
      this.version += 1;
      return true;
    }
    return false;
  }

  seatOf(peerId) {
    if (peerId && peerId === this.seats.host.peerId) return 'host';
    if (peerId && peerId === this.seats.challenger.peerId) return 'challenger';
    return null;
  }

  // Hand a seated player's seat over to a viewer so they can play in their place.
  // `fromPeerId` must currently occupy a seat; `toPeerId` must be a viewer.
  // The leaving player becomes a viewer. Returns true on success.
  handOverSeat(fromPeerId, toPeerId, toName = '') {
    const seat = this.seatOf(fromPeerId);
    if (!seat) return false;
    if (!toPeerId || toPeerId === fromPeerId) return false;
    // The target must not already be seated (can't swap into the opponent seat).
    if (this.seatOf(toPeerId)) return false;

    const name = toName || this.viewers.get(toPeerId) || '';
    this.seats[seat].peerId = toPeerId;
    this.seats[seat].name = name;
    this.viewers.delete(toPeerId);
    // The player who gave up the seat becomes a viewer (if the game is ongoing).
    if (this.phase !== 'finished') this.viewers.set(fromPeerId, this._nameOfFormerSeat(seat, fromPeerId));
    this.version += 1;
    return true;
  }

  // A viewer takes an empty seat (currently only the challenger seat can be empty).
  takeEmptySeat(peerId, name = '') {
    if (!peerId || this.seatOf(peerId)) return false;
    if (!this.seats.challenger.peerId) {
      return this.sitChallenger(peerId, name || this.viewers.get(peerId) || '');
    }
    return false;
  }

  _nameOfFormerSeat() {
    // The former occupant's display name is not tracked separately; viewers keep
    // whatever name the network layer last supplied. Return '' and let the owner
    // refresh it from the peer list on the next viewer registration.
    return '';
  }

  sideOfSeat(seat) {
    return seat === 'host' ? this.seats.host.side : this.seats.challenger.side;
  }

  isPeersTurn(peerId) {
    const seat = this.seatOf(peerId);
    if (!seat || this.phase !== 'playing') return false;
    return this.sideOfSeat(seat) === this.turnSide;
  }

  // Apply a move requested by `peerId`. Returns true if the move was legal and
  // applied. Host-authoritative: callers should only invoke this on the owner.
  applyMove(peerId, move) {
    if (this.phase !== 'playing') return false;
    const seat = this.seatOf(peerId);
    if (!seat) return false;
    const side = this.sideOfSeat(seat);
    if (side !== this.turnSide) return false;

    const next = applyEngineMove(this.game, this.engineState, side, move);
    if (!next) return false;

    this.engineState = next;
    this.lastMove = move.from ? { from: move.from, to: move.to } : { row: move.row, col: move.col };

    const res = engineResult(this.game, this.engineState);
    if (res === 'draw') {
      this.phase = 'finished';
      this.result = 'draw';
    } else if (res) {
      this.phase = 'finished';
      this.result = this.sideToSeat(res);
    } else {
      this.turnSide = this.otherSide(this.turnSide);
    }
    this.version += 1;
    return true;
  }

  otherSide(side) {
    const sides = GAME_META[this.game].sides;
    return sides.find((s) => s !== side);
  }

  // Map a winning side back to 'host' | 'challenger'.
  sideToSeat(side) {
    if (this.seats.host.side === side) return 'host';
    if (this.seats.challenger.side === side) return 'challenger';
    return null;
  }

  // Serialisable snapshot sent to every participant. Contains everything a
  // client needs to render the board and know its own role.
  snapshot() {
    return {
      game: this.game,
      layout: this.layout,
      engineState: this.engineState,
      turnSide: this.turnSide,
      phase: this.phase,
      result: this.result,
      version: this.version,
      lastMove: this.lastMove,
      seats: {
        host: { ...this.seats.host },
        challenger: { ...this.seats.challenger },
      },
      viewers: Array.from(this.viewers.entries()).map(([peerId, name]) => ({ peerId, name })),
    };
  }
}
