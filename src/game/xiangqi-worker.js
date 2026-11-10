// Xiangqi Web Worker — receives {type:'move',board,difficulty,botSide}, posts
//   {type:'thinking', candidate, best, score, index, total} during search
//   {type:'bestMove', move:{from,to}} final
import { getLegalMoves, applyMove, checkWin, evaluateBoard } from './xiangqi.js';

// evaluateBoard is positive for red (maximiser) and negative for black (minimiser).
// The bot can play either colour: it maximises as red, minimises as black.
function getBestMove(board, difficulty, botSide) {
  const moves = getLegalMoves(board, botSide);
  if (moves.length === 0) return null;

  const botMaximises = botSide === 'red';
  const report = (candidate, best, score, index) => {
    self.postMessage({
      type: 'thinking',
      candidate: candidate ? { from: candidate.from, to: candidate.to } : null,
      best: best ? { from: best.from, to: best.to } : null,
      score: Number.isFinite(score) ? Math.round(score) : null,
      index,
      total: moves.length,
    });
  };

  if (difficulty === 'Dễ') {
    // Weak but not silly: look one reply ahead (depth-2) so it won't hang a piece
    // to an immediate recapture, then pick randomly among moves near the best.
    const scored = [];
    let best = null;
    let bestScore = botMaximises ? -Infinity : Infinity;
    moves.forEach((mv, i) => {
      const next = applyMove(board, mv.from, mv.to);
      const score = minimax(next, 1, -Infinity, Infinity, botMaximises ? false : true);
      scored.push({ mv, score });
      if (botMaximises ? score > bestScore : score < bestScore) { bestScore = score; best = mv; }
      report(mv, best, score, i);
    });
    scored.sort((a, b) => (botMaximises ? b.score - a.score : a.score - b.score));
    // Keep moves within a small margin of the best, so play stays varied but it
    // doesn't volunteer losing trades.
    const margin = 30;
    const pool = scored.filter((s) => Math.abs(s.score - scored[0].score) <= margin);
    const top = (pool.length ? pool : scored).slice(0, 8);
    return top[Math.floor(Math.random() * top.length)].mv;
  }

  const depth = difficulty === 'Khó' ? 4 : 3;
  let bestMove = null;
  let bestScore = botMaximises ? -Infinity : Infinity;
  let alpha = -Infinity;
  let beta = Infinity;

  moves.forEach((mv, i) => {
    const next = applyMove(board, mv.from, mv.to);
    const score = minimax(next, depth - 1, alpha, beta, !botMaximises);
    if (botMaximises) {
      if (score > bestScore) { bestScore = score; bestMove = mv; }
      if (score > alpha) alpha = score;
    } else {
      if (score < bestScore) { bestScore = score; bestMove = mv; }
      if (score < beta) beta = score;
    }
    report(mv, bestMove, score, i);
  });
  return bestMove;
}

// Quiescence search: at the depth limit, keep resolving captures so the static
// evaluation isn't taken in the middle of a trade (fixes "grab a defended piece
// then get recaptured"). `stand pat` lets the side decline to capture.
function quiesce(board, alpha, beta, isMaximising, depth) {
  const winner = checkWin(board);
  if (winner === 'red') return Infinity;
  if (winner === 'black') return -Infinity;
  const standPat = evaluateBoard(board);
  if (depth === 0) return standPat;

  const s = isMaximising ? 'red' : 'black';
  const captures = getLegalMoves(board, s).filter((m) => board[m.to.row][m.to.col]);

  if (isMaximising) {
    if (standPat >= beta) return beta;
    if (standPat > alpha) alpha = standPat;
    for (const mv of captures) {
      const score = quiesce(applyMove(board, mv.from, mv.to), alpha, beta, false, depth - 1);
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }
    return alpha;
  }
  if (standPat <= alpha) return alpha;
  if (standPat < beta) beta = standPat;
  for (const mv of captures) {
    const score = quiesce(applyMove(board, mv.from, mv.to), alpha, beta, true, depth - 1);
    if (score <= alpha) return alpha;
    if (score < beta) beta = score;
  }
  return beta;
}

function minimax(board, depth, alpha, beta, isMaximising) {
  const winner = checkWin(board);
  if (winner === 'red') return Infinity;
  if (winner === 'black') return -Infinity;
  if (depth === 0) return quiesce(board, alpha, beta, isMaximising, 4);

  const s = isMaximising ? 'red' : 'black';
  const moves = getLegalMoves(board, s);
  if (moves.length === 0) return evaluateBoard(board);

  if (isMaximising) {
    let best = -Infinity;
    for (const mv of moves) {
      const next = applyMove(board, mv.from, mv.to);
      const score = minimax(next, depth - 1, alpha, beta, false);
      if (score > best) best = score;
      if (score > alpha) alpha = score;
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const mv of moves) {
      const next = applyMove(board, mv.from, mv.to);
      const score = minimax(next, depth - 1, alpha, beta, true);
      if (score < best) best = score;
      if (score < beta) beta = score;
      if (beta <= alpha) break;
    }
    return best;
  }
}

self.onmessage = function (e) {
  const { type, board, difficulty, botSide } = e.data;
  if (type !== 'move') return;
  const move = getBestMove(board, difficulty, botSide || 'black');
  self.postMessage({ type: 'bestMove', move });
};
