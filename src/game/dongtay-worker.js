// Cờ Đông Tây Web Worker — receives {type:'move', state, difficulty, botSide}, posts {type:'bestMove', move}
// evaluateBoard is positive for West (maximiser) and negative for East (minimiser).
// The bot can play either side; it maximises when playing West and minimises when playing East.
import { getLegalMoves, applyMove, checkResult, evaluateBoard } from './dongtay.js';

function getBestMove(state, difficulty, botSide) {
  const moves = getLegalMoves(state, botSide);
  if (moves.length === 0) return null;

  const botMaximises = botSide === 'west';
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
    // Weak but not silly: 1-reply lookahead so it won't hang a piece to an
    // immediate recapture; randomise among moves near the best.
    const scored = [];
    let best = null;
    let bestScore = botMaximises ? -Infinity : Infinity;
    moves.forEach((mv, i) => {
      const next = applyMove(state, mv.from, mv.to, mv.promo);
      const score = minimax(next, 1, -Infinity, Infinity, !botMaximises);
      scored.push({ mv, score });
      if (botMaximises ? score > bestScore : score < bestScore) { bestScore = score; best = mv; }
      report(mv, best, score, i);
    });
    // West wants the highest score, East wants the lowest.
    scored.sort((a, b) => (botMaximises ? b.score - a.score : a.score - b.score));
    const margin = 30;
    const pool = scored.filter((s) => Math.abs(s.score - scored[0].score) <= margin);
    const top = (pool.length ? pool : scored).slice(0, 8);
    const pick = top[Math.floor(Math.random() * top.length)];
    return { from: pick.mv.from, to: pick.mv.to, promo: pick.mv.promo };
  }

  const depth = difficulty === 'Khó' ? 3 : 2;
  let bestMove = null;
  let bestScore = botMaximises ? -Infinity : Infinity;
  let alpha = -Infinity;
  let beta = Infinity;

  moves.forEach((mv, i) => {
    const next = applyMove(state, mv.from, mv.to, mv.promo);
    // After the bot moves, it's the opponent's turn.
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

  return bestMove ? { from: bestMove.from, to: bestMove.to, promo: bestMove.promo } : null;
}

function quiesce(state, alpha, beta, isMaximising, depth) {
  const result = checkResult(state);
  if (result === 'east') return -Infinity;
  if (result === 'west') return Infinity;
  if (result === 'draw') return 0;
  const standPat = evaluateBoard(state);
  if (depth === 0) return standPat;

  const s = isMaximising ? 'west' : 'east';
  const captures = getLegalMoves(state, s).filter((m) => state.board[m.to.row][m.to.col]);

  if (isMaximising) {
    if (standPat >= beta) return beta;
    if (standPat > alpha) alpha = standPat;
    for (const mv of captures) {
      const score = quiesce(applyMove(state, mv.from, mv.to, mv.promo), alpha, beta, false, depth - 1);
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }
    return alpha;
  }
  if (standPat <= alpha) return alpha;
  if (standPat < beta) beta = standPat;
  for (const mv of captures) {
    const score = quiesce(applyMove(state, mv.from, mv.to, mv.promo), alpha, beta, true, depth - 1);
    if (score <= alpha) return alpha;
    if (score < beta) beta = score;
  }
  return beta;
}

function minimax(state, depth, alpha, beta, isMaximising) {
  const result = checkResult(state);
  if (result === 'east') return -Infinity;  // East wins → lowest score
  if (result === 'west') return Infinity;   // West wins → highest score
  if (result === 'draw') return 0;
  if (depth === 0) return quiesce(state, alpha, beta, isMaximising, 4);

  const s = isMaximising ? 'west' : 'east';
  const moves = getLegalMoves(state, s);
  if (moves.length === 0) return evaluateBoard(state);

  if (isMaximising) {
    let best = -Infinity;
    for (const mv of moves) {
      const next = applyMove(state, mv.from, mv.to, mv.promo);
      const score = minimax(next, depth - 1, alpha, beta, false);
      if (score > best) best = score;
      if (score > alpha) alpha = score;
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const mv of moves) {
      const next = applyMove(state, mv.from, mv.to, mv.promo);
      const score = minimax(next, depth - 1, alpha, beta, true);
      if (score < best) best = score;
      if (score < beta) beta = score;
      if (beta <= alpha) break;
    }
    return best;
  }
}

self.onmessage = function (e) {
  const { type, state, difficulty, botSide } = e.data;
  if (type !== 'move') return;
  const move = getBestMove(state, difficulty, botSide || 'east');
  self.postMessage({ type: 'bestMove', move });
};
