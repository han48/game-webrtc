// Gomoku Web Worker — receives {type:'move',board,difficulty}, posts {type:'bestMove',move:{row,col}}
import { createBoard, applyMove, checkWin, isDraw, getCandidates, evaluateBoard } from './gomoku.js';

const HUMAN = 1;
const BOT = 2;

function getBestMove(board, difficulty) {
  // Empty board → center
  const allEmpty = board.every((row) => row.every((cell) => cell === 0));
  if (allEmpty) return { row: 7, col: 7 };

  const candidates = getCandidates(board);
  if (candidates.length === 0) return null;

  const report = (candidate, best, score, index) => {
    self.postMessage({
      type: 'thinking',
      candidate: candidate ? { row: candidate.row, col: candidate.col } : null,
      best: best ? { row: best.row, col: best.col } : null,
      score: Number.isFinite(score) ? Math.round(score) : null,
      index,
      total: candidates.length,
    });
  };

  if (difficulty === 'Dễ') {
    // Score each candidate, pick random from top 5
    const scored = [];
    let best = null;
    let bestScore = -Infinity;
    candidates.forEach((move, i) => {
      const next = applyMove(board, move.row, move.col, BOT);
      const score = evaluateBoard(next, BOT);
      scored.push({ move, score });
      if (score > bestScore) { bestScore = score; best = move; }
      report(move, best, score, i);
    });
    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, 5);
    return top[Math.floor(Math.random() * top.length)].move;
  }

  const depth = difficulty === 'Khó' ? 3 : 2;
  let bestMove = null;
  let bestScore = -Infinity;
  let alpha = -Infinity;
  const beta = Infinity;

  candidates.forEach((move, i) => {
    const next = applyMove(board, move.row, move.col, BOT);
    const score = minimax(next, depth - 1, alpha, beta, false);
    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
    if (score > alpha) alpha = score;
    report(move, bestMove, score, i);
  });
  return bestMove;
}

function minimax(board, depth, alpha, beta, isMaximising) {
  if (checkWin(board, BOT)) return 1e6;
  if (checkWin(board, HUMAN)) return -1e6;
  if (isDraw(board) || depth === 0) return evaluateBoard(board, BOT);

  const candidates = getCandidates(board);
  if (candidates.length === 0) return evaluateBoard(board, BOT);

  if (isMaximising) {
    let best = -Infinity;
    for (const move of candidates) {
      const next = applyMove(board, move.row, move.col, BOT);
      const score = minimax(next, depth - 1, alpha, beta, false);
      if (score > best) best = score;
      if (score > alpha) alpha = score;
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const move of candidates) {
      const next = applyMove(board, move.row, move.col, HUMAN);
      const score = minimax(next, depth - 1, alpha, beta, true);
      if (score < best) best = score;
      if (score < beta) beta = score;
      if (beta <= alpha) break;
    }
    return best;
  }
}

self.onmessage = function (e) {
  const { type, board, difficulty } = e.data;
  if (type !== 'move') return;
  const move = getBestMove(board, difficulty);
  self.postMessage({ type: 'bestMove', move });
};
