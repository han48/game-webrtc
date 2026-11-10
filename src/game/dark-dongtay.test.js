import { describe, it, expect } from 'vitest';
import { createInitialState, sideOf } from './dark-dongtay.js';

// Collect every covered square's standard (nominal) type for one side, keyed by
// "row-col". Royals are revealed, so include them too for position checks.
function squaresOf(board, code) {
  const map = new Map();
  for (let r = 0; r <= 9; r += 1) {
    for (let c = 0; c <= 8; c += 1) {
      const cell = board[r][c];
      if (cell && cell.s === code) map.set(`${r}-${c}`, cell);
    }
  }
  return map;
}

describe('dark dongtay (Cờ Đông Tây Úp) setup', () => {
  it('East (phe Tướng) uses the xiangqi formation', () => {
    const { board } = createInitialState('correct');
    const east = squaresOf(board, 'r');
    // 16 pieces: 9 back rank + 2 cannons + 5 chốt.
    expect(east.size).toBe(16);
    // Back rank on row 9, nominal types X M T S V S T M X.
    const back = ['X', 'M', 'T', 'S', 'V', 'S', 'T', 'M', 'X'];
    for (let c = 0; c <= 8; c += 1) {
      expect(east.get(`9-${c}`).nominal).toBe(back[c]);
    }
    // General V revealed at (9,4).
    expect(board[9][4]).toMatchObject({ s: 'r', hidden: 'V', covered: false });
    // Cannons at row 7 cols 1 and 7.
    expect(east.get('7-1').nominal).toBe('P');
    expect(east.get('7-7').nominal).toBe('P');
    // Chốt on row 6 at cols 0,2,4,6,8.
    for (const c of [0, 2, 4, 6, 8]) expect(east.get(`6-${c}`).nominal).toBe('C');
    // No East piece on the chess ranks (rows 0–1).
    for (let c = 0; c <= 8; c += 1) {
      expect(east.has(`0-${c}`)).toBe(false);
      expect(east.has(`1-${c}`)).toBe(false);
    }
  });

  it('West (phe Vua) uses the chess formation', () => {
    const { board } = createInitialState('correct');
    const west = squaresOf(board, 'b');
    // 16 pieces: 9 tốt + 7-piece back rank (cols 1 & 7 empty).
    expect(west.size).toBe(16);
    // King k revealed at (0,4).
    expect(board[0][4]).toMatchObject({ s: 'b', hidden: 'k', covered: false });
    // Back rank row 0: r . n q k b n . r
    const back = ['r', null, 'n', 'q', 'k', 'b', 'n', null, 'r'];
    for (let c = 0; c <= 8; c += 1) {
      if (back[c]) expect(west.get(`0-${c}`).nominal).toBe(back[c]);
      else expect(west.has(`0-${c}`)).toBe(false);
    }
    // 9 tốt on row 1.
    for (let c = 0; c <= 8; c += 1) expect(west.get(`1-${c}`).nominal).toBe('p');
    // No West piece on the xiangqi ranks (rows 6,7,9).
    for (let c = 0; c <= 8; c += 1) {
      expect(west.has(`6-${c}`)).toBe(false);
      expect(west.has(`9-${c}`)).toBe(false);
    }
  });

  it('both armies have 15 covered pieces (balanced) and sideOf is correct', () => {
    const { board } = createInitialState('correct');
    let eastCovered = 0;
    let westCovered = 0;
    for (const row of board) {
      for (const cell of row) {
        if (!cell || !cell.covered) continue;
        if (cell.s === 'r') eastCovered += 1;
        if (cell.s === 'b') westCovered += 1;
      }
    }
    expect(eastCovered).toBe(15); // 16 - revealed V
    expect(westCovered).toBe(15); // 16 - revealed k
    expect(sideOf(board[9][4])).toBe('red');
    expect(sideOf(board[0][4])).toBe('black');
  });
});
