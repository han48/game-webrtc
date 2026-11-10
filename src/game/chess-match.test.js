import { describe, it, expect } from 'vitest';
import { ChessMatchSession, getMatchGameMeta, CHESS_MATCH_GAMES } from './chess-match.js';

describe('ChessMatchSession — seats & roles', () => {
  it('seats the host on the first-moving side by default', () => {
    const m = new ChessMatchSession('chess', 'host1');
    expect(m.seats.host.peerId).toBe('host1');
    expect(m.seats.host.side).toBe('white'); // white moves first in chess
    expect(m.seats.challenger.side).toBe('black');
    expect(m.phase).toBe('waiting');
  });

  it('honours an explicit hostSide', () => {
    const m = new ChessMatchSession('chess', 'host1', { hostSide: 'black' });
    expect(m.seats.host.side).toBe('black');
    expect(m.seats.challenger.side).toBe('white');
  });

  it('seats a challenger and starts play', () => {
    const m = new ChessMatchSession('chess', 'host1');
    expect(m.sitChallenger('p2', 'Bob')).toBe(true);
    expect(m.seats.challenger.peerId).toBe('p2');
    expect(m.phase).toBe('playing');
  });

  it('rejects the host sitting as challenger', () => {
    const m = new ChessMatchSession('chess', 'host1');
    expect(m.sitChallenger('host1')).toBe(false);
  });

  it('tracks viewers separately from players', () => {
    const m = new ChessMatchSession('chess', 'host1');
    m.sitChallenger('p2');
    expect(m.addViewer('v1', 'Viewer')).toBe(true);
    expect(m.addViewer('host1')).toBe(false);  // seated players aren't viewers
    expect(m.addViewer('p2')).toBe(false);
    expect(m.snapshot().viewers).toEqual([{ peerId: 'v1', name: 'Viewer' }]);
  });
});

describe('ChessMatchSession — turn ownership', () => {
  it('only lets the side-to-move act', () => {
    const m = new ChessMatchSession('chess', 'host1'); // host = white, moves first
    m.sitChallenger('p2');
    expect(m.isPeersTurn('host1')).toBe(true);
    expect(m.isPeersTurn('p2')).toBe(false);
    expect(m.isPeersTurn('nobody')).toBe(false);
  });

  it('alternates turns after a legal move', () => {
    const m = new ChessMatchSession('chess', 'host1');
    m.sitChallenger('p2');
    // White pawn e2->e4 : board row 6 col 4 -> row 4 col 4
    const ok = m.applyMove('host1', { from: { row: 6, col: 4 }, to: { row: 4, col: 4 } });
    expect(ok).toBe(true);
    expect(m.turnSide).toBe('black');
    expect(m.isPeersTurn('p2')).toBe(true);
    expect(m.isPeersTurn('host1')).toBe(false);
  });

  it('rejects a move from the wrong peer', () => {
    const m = new ChessMatchSession('chess', 'host1');
    m.sitChallenger('p2');
    // p2 is black, it is white's turn → illegal
    const ok = m.applyMove('p2', { from: { row: 1, col: 4 }, to: { row: 3, col: 4 } });
    expect(ok).toBe(false);
  });

  it('rejects an illegal engine move', () => {
    const m = new ChessMatchSession('chess', 'host1');
    m.sitChallenger('p2');
    const ok = m.applyMove('host1', { from: { row: 6, col: 4 }, to: { row: 1, col: 4 } });
    expect(ok).toBe(false);
  });
});

describe('ChessMatchSession — caro moves & result', () => {
  it('applies alternating caro stones and detects a horizontal win', () => {
    const m = new ChessMatchSession('caro', 'host1'); // host = black (player 1)
    m.sitChallenger('p2'); // p2 = white (player 2)
    // Black builds a row of 5 at row 7, cols 0..4; white plays far away between moves.
    const blackCols = [0, 1, 2, 3, 4];
    const whiteCols = [0, 1, 2, 3]; // only 4 white moves needed before black's 5th
    for (let i = 0; i < 5; i++) {
      expect(m.applyMove('host1', { row: 7, col: blackCols[i] })).toBe(true);
      if (i < 4) {
        expect(m.applyMove('p2', { row: 0, col: whiteCols[i] })).toBe(true);
      }
    }
    expect(m.phase).toBe('finished');
    expect(m.result).toBe('host'); // black = host won
  });

  it('rejects playing on an occupied caro cell', () => {
    const m = new ChessMatchSession('caro', 'host1');
    m.sitChallenger('p2');
    expect(m.applyMove('host1', { row: 7, col: 7 })).toBe(true);
    expect(m.applyMove('p2', { row: 7, col: 7 })).toBe(false); // occupied
  });
});

describe('ChessMatchSession — hand over seat (nhường chỗ)', () => {
  it('lets a seated player hand their seat to a viewer', () => {
    const m = new ChessMatchSession('chess', 'host1');
    m.sitChallenger('p2', 'Bob');
    m.addViewer('v1', 'Carol');
    const ok = m.handOverSeat('p2', 'v1', 'Carol');
    expect(ok).toBe(true);
    expect(m.seats.challenger.peerId).toBe('v1');
    expect(m.seatOf('v1')).toBe('challenger');
    // The former player becomes a viewer.
    expect(m.snapshot().viewers.some((v) => v.peerId === 'p2')).toBe(true);
  });

  it('refuses to hand a seat to someone already seated', () => {
    const m = new ChessMatchSession('chess', 'host1');
    m.sitChallenger('p2');
    expect(m.handOverSeat('host1', 'p2')).toBe(false);
  });

  it('refuses hand over from a non-seated peer', () => {
    const m = new ChessMatchSession('chess', 'host1');
    m.sitChallenger('p2');
    m.addViewer('v1');
    expect(m.handOverSeat('v1', 'host1')).toBe(false);
  });

  it('lets a viewer take the empty challenger seat', () => {
    const m = new ChessMatchSession('chess', 'host1');
    m.addViewer('v1', 'Carol');
    expect(m.takeEmptySeat('v1')).toBe(true);
    expect(m.seatOf('v1')).toBe('challenger');
  });
});

describe('ChessMatchSession — leaving', () => {
  it('ends the match when the host leaves', () => {
    const m = new ChessMatchSession('chess', 'host1');
    m.sitChallenger('p2');
    m.removePeer('host1');
    expect(m.phase).toBe('finished');
    expect(m.result).toBe('challenger');
  });

  it('reverts to waiting when the challenger leaves mid-game', () => {
    const m = new ChessMatchSession('chess', 'host1');
    m.sitChallenger('p2');
    m.removePeer('p2');
    expect(m.phase).toBe('waiting');
    expect(m.seats.challenger.peerId).toBe(null);
  });
});

describe('ChessMatchSession — snapshot & meta', () => {
  it('produces a JSON-serialisable snapshot', () => {
    const m = new ChessMatchSession('xiangqi', 'host1');
    m.sitChallenger('p2');
    const snap = m.snapshot();
    expect(() => JSON.parse(JSON.stringify(snap))).not.toThrow();
    expect(snap.game).toBe('xiangqi');
    expect(snap.turnSide).toBe('red');
    expect(snap.seats.host.side).toBe('red');
  });

  it('exposes meta for every supported game', () => {
    for (const g of CHESS_MATCH_GAMES) {
      const meta = getMatchGameMeta(g);
      expect(meta).toBeTruthy();
      expect(meta.sides).toHaveLength(2);
      expect(meta.sides).toContain(meta.first);
    }
  });

  it('increments version on every state change', () => {
    const m = new ChessMatchSession('chess', 'host1');
    const v0 = m.version;
    m.sitChallenger('p2');
    expect(m.version).toBeGreaterThan(v0);
    const v1 = m.version;
    m.applyMove('host1', { from: { row: 6, col: 4 }, to: { row: 4, col: 4 } });
    expect(m.version).toBeGreaterThan(v1);
  });
});
