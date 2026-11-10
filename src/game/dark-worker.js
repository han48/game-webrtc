// Shared Web Worker for the dark ("Úp") variants: cờ tướng úp, cờ vua úp,
// cờ đông tây úp. Message: {type:'move', board, difficulty, botSide, variant}.
// Posts {type:'thinking', ...} during search and {type:'bestMove', move}.
import * as darkXiangqi from './dark-xiangqi.js';
import * as darkChess from './dark-chess.js';
import * as darkDongtay from './dark-dongtay.js';

const ENGINES = { 'xiangqi-up': darkXiangqi, 'chess-up': darkChess, 'dongtay-up': darkDongtay };

function search(engine, board, difficulty, botSide) {
  const { getLegalMoves, applyMove, checkWin, evaluateBoard } = engine;
  const moves = getLegalMoves(board, botSide);
  if (moves.length === 0) return null;
  const botMax = botSide === 'red';

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

  function quiesce(b, alpha, beta, isMax, d) {
    const w = checkWin(b);
    if (w === 'red') return Infinity;
    if (w === 'black') return -Infinity;
    const sp = evaluateBoard(b);
    if (d === 0) return sp;
    const s = isMax ? 'red' : 'black';
    const caps = getLegalMoves(b, s).filter((m) => b[m.to.row][m.to.col]);
    if (isMax) {
      if (sp >= beta) return beta;
      if (sp > alpha) alpha = sp;
      for (const mv of caps) {
        const sc = quiesce(applyMove(b, mv.from, mv.to, mv.promo), alpha, beta, false, d - 1);
        if (sc >= beta) return beta;
        if (sc > alpha) alpha = sc;
      }
      return alpha;
    }
    if (sp <= alpha) return alpha;
    if (sp < beta) beta = sp;
    for (const mv of caps) {
      const sc = quiesce(applyMove(b, mv.from, mv.to, mv.promo), alpha, beta, true, d - 1);
      if (sc <= alpha) return alpha;
      if (sc < beta) beta = sc;
    }
    return beta;
  }

  function minimax(b, depth, alpha, beta, isMax) {
    const w = checkWin(b);
    if (w === 'red') return Infinity;
    if (w === 'black') return -Infinity;
    if (depth === 0) return quiesce(b, alpha, beta, isMax, 4);
    const s = isMax ? 'red' : 'black';
    const ms = getLegalMoves(b, s);
    if (!ms.length) return evaluateBoard(b);
    if (isMax) {
      let best = -Infinity;
      for (const mv of ms) {
        const sc = minimax(applyMove(b, mv.from, mv.to, mv.promo), depth - 1, alpha, beta, false);
        if (sc > best) best = sc;
        if (sc > alpha) alpha = sc;
        if (beta <= alpha) break;
      }
      return best;
    }
    let best = Infinity;
    for (const mv of ms) {
      const sc = minimax(applyMove(b, mv.from, mv.to, mv.promo), depth - 1, alpha, beta, true);
      if (sc < best) best = sc;
      if (sc < beta) beta = sc;
      if (beta <= alpha) break;
    }
    return best;
  }

  if (difficulty === 'Dễ') {
    const scored = [];
    let best = null;
    let bestScore = botMax ? -Infinity : Infinity;
    moves.forEach((mv, i) => {
      const score = minimax(applyMove(board, mv.from, mv.to, mv.promo), 1, -Infinity, Infinity, !botMax);
      scored.push({ mv, score });
      if (botMax ? score > bestScore : score < bestScore) { bestScore = score; best = mv; }
      report(mv, best, score, i);
    });
    scored.sort((a, b) => (botMax ? b.score - a.score : a.score - b.score));
    const margin = 40;
    const pool = scored.filter((x) => Math.abs(x.score - scored[0].score) <= margin);
    const top = (pool.length ? pool : scored).slice(0, 8);
    return top[Math.floor(Math.random() * top.length)].mv;
  }

  const depth = difficulty === 'Khó' ? 3 : 2;
  let bestMove = null;
  let bestScore = botMax ? -Infinity : Infinity;
  let alpha = -Infinity;
  let beta = Infinity;
  moves.forEach((mv, i) => {
    const score = minimax(applyMove(board, mv.from, mv.to, mv.promo), depth - 1, alpha, beta, !botMax);
    if (botMax) { if (score > bestScore) { bestScore = score; bestMove = mv; } if (score > alpha) alpha = score; }
    else { if (score < bestScore) { bestScore = score; bestMove = mv; } if (score < beta) beta = score; }
    report(mv, bestMove, score, i);
  });
  return bestMove;
}

self.onmessage = function (e) {
  const { type, board, difficulty, botSide, variant } = e.data;
  if (type !== 'move') return;
  const engine = ENGINES[variant] || darkXiangqi;
  const move = search(engine, board, difficulty, botSide || 'black');
  self.postMessage({ type: 'bestMove', move });
};
