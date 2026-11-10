import { describe, it, expect } from 'vitest';
import { createInitialState as createChess, getCheckers as chessCheckers } from './chess.js';
import { createInitialBoard as createXiangqi, getCheckers as xqCheckers } from './xiangqi.js';

describe('chess getCheckers', () => {
  it('returns null when not in check (initial position)', () => {
    expect(chessCheckers(createChess(), 'white')).toBeNull();
  });

  it('identifies the checking rook and the king', () => {
    const board = Array.from({ length: 8 }, () => new Array(8).fill(null));
    board[7][4] = 'K'; // white king on e1
    board[0][4] = 'r'; // black rook on e8 — open e-file → check
    board[0][0] = 'k'; // black king present so the position is well-formed
    const state = {
      board,
      turn: 'white',
      castling: { wK: false, wQ: false, bK: false, bQ: false },
      enPassant: null,
      halfmove: 0,
      fullmove: 1,
    };
    const res = chessCheckers(state, 'white');
    expect(res).toBeTruthy();
    expect(res.king).toEqual({ row: 7, col: 4 });
    expect(res.attackers).toContainEqual({ row: 0, col: 4 });
  });
});

describe('xiangqi getCheckers', () => {
  it('returns null at the start', () => {
    expect(xqCheckers(createXiangqi(), 'red')).toBeNull();
  });

  it('detects a chariot checking the general', () => {
    const board = Array.from({ length: 10 }, () => new Array(9).fill(null));
    board[9][4] = 'rK'; // red general
    board[0][4] = 'bK'; // black general (needed so engine is well-formed)
    board[8][4] = 'bR'; // black chariot directly in front of red general on the same file
    const res = xqCheckers(board, 'red');
    expect(res).toBeTruthy();
    expect(res.king).toEqual({ row: 9, col: 4 });
    expect(res.attackers.some((a) => a.row === 8 && a.col === 4)).toBe(true);
  });
});
