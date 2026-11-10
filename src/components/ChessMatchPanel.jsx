// PvP match panel — renders the shared ChessMatchSession snapshot in 3D and lets
// the player whose turn it is send moves (leader-authoritative, synced over P2P).
// Viewers see a read-only board.
import { useMemo, useState, useEffect } from 'react';
import './ChessGamePanel.css';
import ChessScene3D from './ChessScene3D.jsx';
import { getLegalMoves as chessLegal } from '../game/chess.js';
import { getLegalMoves as xiangqiLegal } from '../game/xiangqi.js';
import { getLegalMoves as dongtayLegal } from '../game/dongtay.js';

const CHESS_SOLID = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟', k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
const DONGTAY_EAST = { V: '將', S: '士', T: '象', M: '馬', X: '車', P: '炮', C: '卒' };

// Normalise a match snapshot → { pieces, cols, rows, boardStyle, legal(side) }.
function describe(match) {
  const { game, engineState, layout } = match;
  if (game === 'caro') {
    const board = engineState.board;
    const pieces = [];
    for (let r = 0; r < board.length; r += 1) for (let c = 0; c < board[r].length; c += 1) {
      if (board[r][c] === 0) continue;
      pieces.push({ id: `${r}-${c}`, row: r, col: c, model: 'stone', color: board[r][c] === 1 ? '#1a1a1a' : '#f4f4f0' });
    }
    return { pieces, cols: board[0].length, rows: board.length, boardStyle: 'grid', legal: () => [] };
  }
  if (game === 'chess') {
    const board = engineState.board;
    const pieces = [];
    for (let r = 0; r < 8; r += 1) for (let c = 0; c < 8; c += 1) {
      const p = board[r][c]; if (!p) continue;
      const white = p === p.toUpperCase();
      pieces.push({ id: `${r}-${c}`, row: r, col: c, kind: p.toLowerCase(), color: white ? '#f2ead8' : '#2b2b2b', royal: p.toLowerCase() === 'k' });
    }
    return { pieces, cols: 8, rows: 8, boardStyle: 'cells', legal: (s) => chessLegal(engineState, s) };
  }
  if (game === 'xiangqi') {
    const board = engineState.board;
    const pieces = [];
    for (let r = 0; r < 10; r += 1) for (let c = 0; c < 9; c += 1) {
      const p = board[r][c]; if (!p) continue;
      const red = p[0] === 'r';
      pieces.push({ id: `${r}-${c}`, row: r, col: c, model: 'disc', color: red ? '#c0392b' : '#2c3e50', top: red ? '#ffeedd' : '#e6eef5', royal: p[1] === 'K' });
    }
    return { pieces, cols: 9, rows: 10, boardStyle: 'river', legal: (s) => xiangqiLegal(board, s) };
  }
  // dongtay
  const board = engineState.board;
  const pieces = [];
  for (let r = 0; r < 10; r += 1) for (let c = 0; c < 9; c += 1) {
    const p = board[r][c]; if (!p) continue;
    const east = 'VSTMXPC'.includes(p);
    if (east) pieces.push({ id: `${r}-${c}`, row: r, col: c, model: 'disc', color: '#1a5c2a', top: '#fff4d6', label: DONGTAY_EAST[p] || '', labelColor: '#124a1f', royal: p === 'V' });
    else pieces.push({ id: `${r}-${c}`, row: r, col: c, kind: p.toLowerCase(), color: '#f2ead8', royal: p === 'k' });
  }
  return { pieces, cols: 9, rows: 10, boardStyle: layout === 'B' ? 'river' : 'cells', legal: (s) => dongtayLegal(engineState, s) };
}

export default function ChessMatchPanel({ match, localPeerId, onMove, onLeave }) {
  const [selected, setSelected] = useState(null);
  const [legalDests, setLegalDests] = useState([]);

  useEffect(() => { setSelected(null); setLegalDests([]); }, [match && match.version]);

  const info = useMemo(() => (match ? describe(match) : null), [match]);
  if (!match || !info) return null;

  const seat = match.seats.host.peerId === localPeerId ? 'host'
    : match.seats.challenger.peerId === localPeerId ? 'challenger' : null;
  const mySide = seat ? match.seats[seat].side : null;
  const isMyTurn = seat && match.phase === 'playing' && match.turnSide === mySide;
  const label = getMatchGameLabel(match.game);

  // Orient so the local player's side is at the bottom when possible.
  const flip = (() => {
    if (match.game === 'chess') return mySide === 'white';
    if (match.game === 'xiangqi') return mySide === 'red';
    if (match.game === 'dongtay') return mySide === 'east';
    return false;
  })();

  function handleSquareClick(row, col) {
    if (!isMyTurn) return;
    const board = match.engineState.board;
    if (selected) {
      const mv = legalDests.find((d) => d.row === row && d.col === col);
      if (mv) {
        onMove({ from: selected, to: { row, col }, promo: mv.promo });
        setSelected(null); setLegalDests([]);
        return;
      }
    }
    // Select own piece.
    const all = info.legal(mySide).filter((m) => m.from.row === row && m.from.col === col);
    if (all.length) { setSelected({ row, col }); setLegalDests(all.map((m) => ({ ...m.to, promo: m.promo }))); }
    else if (match.game === 'caro' && isMyTurn && !board[row][col]) {
      onMove({ row, col }); // caro: place a stone
    } else { setSelected(null); setLegalDests([]); }
  }

  const statusText = match.phase === 'waiting' ? 'Đang chờ đối thủ…'
    : match.phase === 'finished'
      ? (match.result === seat ? '🏆 Bạn thắng!' : match.result === 'draw' ? 'Hòa!' : 'Bạn thua!')
      : (isMyTurn ? 'Lượt của bạn' : `Lượt của ${match.turnSide}`);

  return (
    <div className="chess-panel-overlay chess-panel-overlay--full" role="dialog" aria-modal="true" aria-label={`${label} — PvP`}>
      <div className="chess-scene3d">
        <ChessScene3D
          pieces={info.pieces}
          cols={info.cols}
          rows={info.rows}
          flip={flip}
          boardStyle={info.boardStyle}
          selected={selected}
          legalDests={legalDests}
          onSquareClick={handleSquareClick}
        />
      </div>
      <section className="chess-panel chess-panel--hud is-collapsed">
        <header className="chess-panel__header">
          <h2>{label} · PvP {seat ? '' : '(xem)'}</h2>
          <div className="chess-panel__header-actions">
            <button className="chess-panel__close" type="button" aria-label="Rời ván" onClick={onLeave}>✕</button>
          </div>
        </header>
        <p className="chess-panel__status" aria-live="polite">{statusText}</p>
        <p className="chess-panel__hint">
          {match.seats.host.name || 'Chủ'} ({match.seats.host.side}) vs {match.seats.challenger.name || '…'} ({match.seats.challenger.side})
        </p>
      </section>
    </div>
  );
}

function getMatchGameLabel(game) {
  return { caro: 'Cờ Ca Rô', chess: 'Cờ Vua', xiangqi: 'Cờ Tướng', dongtay: 'Cờ Đông Tây' }[game] || 'Cờ';
}
