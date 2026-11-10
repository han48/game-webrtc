import { describe, it, expect } from 'vitest';
import { createInitialState, getLegalMoves, applyMove, sideOf } from './dongtay.js';

// Rows are 0-indexed; row index 8 = board "row 9", row index 9 = board "row 10".
// West pieces advance toward increasing row index. These tests pin down the
// reported concern: West (chess) pieces MUST be able to reach rows 9 and 10.

function emptyBoard() {
  return Array.from({ length: 10 }, () => new Array(9).fill(null));
}

describe('dongtay opening formation', () => {
  it('gives West one bishop and one queen beside the king', () => {
    const { board } = createInitialState();
    expect(board[0]).toEqual(['r', null, 'n', 'q', 'k', 'b', 'n', null, 'r']);
    expect(board[0].filter((piece) => piece === 'b')).toHaveLength(1);
    expect(board[0].filter((piece) => piece === 'q')).toHaveLength(1);
  });
});

describe('dongtay — West pieces can reach rows 9 and 10 (indices 8 and 9)', () => {
  it('rook on an open file reaches row index 8 and 9', () => {
    const board = emptyBoard();
    board[0][0] = 'r'; // west rook
    board[0][4] = 'k'; // west king (so sides exist)
    board[9][8] = 'V'; // east general off-file
    const state = { board, turn: 'west', halfmove: 0, positionHistory: [], layout: 'A' };
    const targets = getLegalMoves(state, 'west')
      .filter((m) => m.from.row === 0 && m.from.col === 0)
      .map((m) => m.to.row);
    expect(targets).toContain(8);
    expect(targets).toContain(9);
  });

  it('queen reaches the far rows diagonally and orthogonally', () => {
    const board = emptyBoard();
    board[0][4] = 'q';
    board[0][0] = 'k';
    board[9][0] = 'V';
    const state = { board, turn: 'west', halfmove: 0, positionHistory: [], layout: 'A' };
    const rows = new Set(getLegalMoves(state, 'west')
      .filter((m) => m.from.row === 0 && m.from.col === 4)
      .map((m) => m.to.row));
    expect(rows.has(8)).toBe(true);
    expect(rows.has(9)).toBe(true);
  });

  it('knight can jump to row index 9', () => {
    const board = emptyBoard();
    board[7][4] = 'n'; // knight one L-move from row 9
    board[0][0] = 'k';
    board[9][8] = 'V';
    const state = { board, turn: 'west', halfmove: 0, positionHistory: [], layout: 'A' };
    const targets = getLegalMoves(state, 'west')
      .filter((m) => m.from.row === 7 && m.from.col === 4)
      .map((m) => `${m.to.row}-${m.to.col}`);
    expect(targets).toContain('9-5');
    expect(targets).toContain('9-3');
  });

  it('pawn promotes when it reaches row index 9', () => {
    const board = emptyBoard();
    board[8][4] = 'p'; // west pawn one step from the last row
    board[0][0] = 'k';
    board[9][8] = 'V';
    const state = { board, turn: 'west', halfmove: 0, positionHistory: [], layout: 'A' };
    const promo = getLegalMoves(state, 'west')
      .find((m) => m.from.row === 8 && m.from.col === 4 && m.to.row === 9 && m.to.col === 4);
    expect(promo).toBeTruthy();
    expect(promo.promo).toBe('q');
    const next = applyMove(state, promo.from, promo.to, promo.promo);
    expect(next.board[9][4]).toBe('q'); // promoted to a West queen
    expect(sideOf(next.board[9][4])).toBe('west');
  });

  it('king can step onto row index 8 and 9', () => {
    const board = emptyBoard();
    board[8][0] = 'k'; // king near the far edge
    board[0][8] = 'V'; // east general far away, different column
    const state = { board, turn: 'west', halfmove: 0, positionHistory: [], layout: 'A' };
    const targets = getLegalMoves(state, 'west')
      .filter((m) => m.from.row === 8 && m.from.col === 0)
      .map((m) => m.to.row);
    expect(targets).toContain(9); // can advance to the last row
  });
});
