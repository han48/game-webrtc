import { describe, it, expect } from 'vitest';
import {
  createInitialState, getLegalMoves, applyMove, activeType, checkWin, isInCheck,
} from './dark-chess.js';

function count(board) {
  let n = 0; let covered = 0; let kings = 0;
  for (const row of board) for (const cell of row) {
    if (!cell) continue; n += 1;
    if (cell.covered) covered += 1;
    if (cell.hidden === 'K') kings += 1;
  }
  return { n, covered, kings };
}

describe('dark chess setup', () => {
  it('places 32 pieces, both kings revealed, 30 covered', () => {
    const s = createInitialState('correct');
    const { n, covered, kings } = count(s.board);
    expect(n).toBe(32);
    expect(kings).toBe(2);
    expect(covered).toBe(30);
    // White king on e1 (row7,col4), Black king on e8 (row0,col4), revealed.
    expect(s.board[7][4]).toMatchObject({ s: 'r', hidden: 'K', covered: false });
    expect(s.board[0][4]).toMatchObject({ s: 'b', hidden: 'K', covered: false });
  });

  it('hidden multiset per side matches a chess army minus the king', () => {
    const s = createInitialState('correct');
    const white = [];
    for (const row of s.board) for (const cell of row) if (cell && cell.s === 'r') white.push(cell.hidden);
    const counts = white.reduce((m, t) => { m[t] = (m[t] || 0) + 1; return m; }, {});
    expect(counts).toEqual({ K: 1, Q: 1, R: 2, B: 2, N: 2, P: 8 });
  });
});

describe('dark chess movement & reveal', () => {
  it('a covered piece reveals on first move and then moves by its true type', () => {
    const s = createInitialState('correct');
    const moves = getLegalMoves(s.board, 'red');
    expect(moves.length).toBeGreaterThan(0);
    const mv = moves[0];
    const nb = applyMove(s.board, mv.from, mv.to, mv.promo);
    const moved = nb[mv.to.row][mv.to.col];
    expect(moved.covered).toBe(false);
    expect(activeType(moved)).toBe(moved.hidden);
  });

  it('legal moves never leave own king in check', () => {
    const s = createInitialState('correct');
    for (const mv of getLegalMoves(s.board, 'red')) {
      const nb = applyMove(s.board, mv.from, mv.to, mv.promo);
      expect(isInCheck(nb, 'red')).toBe(false);
    }
  });

  it('reports a winner when a king is captured off the board', () => {
    const s = createInitialState('correct');
    const board = s.board.map((row) => row.map((c) => (c ? { ...c } : null)));
    board[0][4] = null; // remove black king
    expect(checkWin(board)).toBe('red');
  });
});
