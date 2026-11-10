import { describe, it, expect } from 'vitest';
import {
  createInitialState, getLegalMoves, applyMove, activeType, sideOf, checkWin, isInCheck,
} from './dark-xiangqi.js';

function countPieces(board) {
  let n = 0; let covered = 0; let generals = 0;
  for (const row of board) for (const cell of row) {
    if (!cell) continue;
    n += 1;
    if (cell.covered) covered += 1;
    if (cell.hidden === 'K') generals += 1;
  }
  return { n, covered, generals };
}

describe('dark xiangqi setup', () => {
  it('places 32 pieces, both generals revealed and centred', () => {
    const s = createInitialState('correct');
    const { n, covered, generals } = countPieces(s.board);
    expect(n).toBe(32);
    expect(generals).toBe(2);
    expect(covered).toBe(30); // 32 - 2 generals
    // Generals revealed in palace centre.
    expect(s.board[9][4]).toMatchObject({ s: 'r', hidden: 'K', covered: false });
    expect(s.board[0][4]).toMatchObject({ s: 'b', hidden: 'K', covered: false });
    expect(s.turn).toBe('red');
  });

  it('correct mode: a covered piece\'s nominal equals its square\'s standard type', () => {
    const s = createInitialState('correct');
    // Red chariot corner square (9,0) standard type R.
    expect(s.board[9][0].nominal).toBe('R');
    expect(s.board[9][0].covered).toBe(true);
    // Red cannon square (7,1) standard type C.
    expect(s.board[7][1].nominal).toBe('C');
  });

  it('hidden identities form the correct multiset per side', () => {
    const s = createInitialState('correct');
    const redHidden = [];
    for (const row of s.board) for (const cell of row) {
      if (cell && cell.s === 'r') redHidden.push(cell.hidden);
    }
    const counts = redHidden.reduce((m, t) => { m[t] = (m[t] || 0) + 1; return m; }, {});
    expect(counts).toEqual({ K: 1, R: 2, H: 2, E: 2, A: 2, C: 2, P: 5 });
  });
});

describe('dark xiangqi covered movement & reveal', () => {
  it('a covered piece ALWAYS moves by its square\'s position type, not its hidden type', () => {
    // Every occupied square's covered piece moves by the standard type of that
    // square (nominal), regardless of what it hides — in BOTH modes.
    for (const mode of ['correct', 'shuffle']) {
      const s = createInitialState(mode);
      for (let r = 0; r <= 9; r += 1) {
        for (let c = 0; c <= 8; c += 1) {
          const cell = s.board[r][c];
          if (!cell || !cell.covered) continue;
          // activeType of a covered piece is its nominal (position) type.
          expect(activeType(cell)).toBe(cell.nominal);
        }
      }
    }
  });

  it('shuffle mode scrambles hidden identities but keeps position-based movement', () => {
    // The nominal (movement) of each covered square still matches the standard
    // formation type of that square even in shuffle mode.
    const standardAt = { // a few known standard red squares
      '9-0': 'R', '9-1': 'H', '9-2': 'E', '7-1': 'C', '6-0': 'P',
    };
    const s = createInitialState('shuffle');
    for (const [key, t] of Object.entries(standardAt)) {
      const [r, c] = key.split('-').map(Number);
      if (s.board[r][c] && s.board[r][c].covered) {
        expect(s.board[r][c].nominal).toBe(t);
      }
    }
  });

  it('a covered piece reveals on first move and then moves by its true hidden type', () => {
    const s = createInitialState('correct');
    const moves = getLegalMoves(s.board, 'red');
    expect(moves.length).toBeGreaterThan(0);
    const mv = moves[0];
    const nb = applyMove(s.board, mv.from, mv.to);
    const moved = nb[mv.to.row][mv.to.col];
    expect(moved.covered).toBe(false); // revealed
    expect(activeType(moved)).toBe(moved.hidden); // now moves by true type
  });
});

describe('dark xiangqi rules', () => {
  it('generals cannot face each other on an open file (flying general = check)', () => {
    const s = createInitialState('correct');
    const board = s.board.map((row) => row.map((c) => (c ? { ...c } : null)));
    // Clear column 4 between the generals.
    for (let r = 1; r <= 8; r += 1) board[r][4] = null;
    expect(isInCheck(board, 'red')).toBe(true);
  });

  it('reports a winner when a general is gone', () => {
    const s = createInitialState('correct');
    const board = s.board.map((row) => row.map((c) => (c ? { ...c } : null)));
    board[0][4] = null; // remove black general
    expect(checkWin(board)).toBe('red');
  });

  it('legal moves never leave own general in check', () => {
    const s = createInitialState('correct');
    for (const mv of getLegalMoves(s.board, 'red')) {
      const nb = applyMove(s.board, mv.from, mv.to);
      expect(isInCheck(nb, 'red')).toBe(false);
    }
  });
});
