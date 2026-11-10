import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import './ChessGamePanel.css';
import ChessScene3D from './ChessScene3D.jsx';
import {
  createBoard as createGomokuBoard,
  applyMove as applyGomokuMove,
  checkWin as checkGomokuWin,
  isDraw as isGomokuDraw,
} from '../game/gomoku.js';
import {
  createInitialBoard as createXiangqiBoard,
  getLegalMoves as getXiangqiLegalMoves,
  applyMove as applyXiangqiMove,
  checkWin as checkXiangqiWin,
  isInCheck as isXiangqiInCheck,
  getCheckers as getXiangqiCheckers,
} from '../game/xiangqi.js';
import {
  createInitialState as createChessState,
  getLegalMoves as getChessLegalMoves,
  applyMove as applyChessMove,
  checkResult as checkChessResult,
  isInCheck as isChessInCheck,
  getCheckers as getChessCheckers,
} from '../game/chess.js';
import {
  createInitialState as createDongtayState,
  getLegalMoves as getDongtayLegalMoves,
  applyMove as applyDongtayMove,
  checkResult as checkDongtayResult,
  isVGeneralFacing,
} from '../game/dongtay.js';
import {
  createInitialState as createCoupState,
  getLegalMoves as getCoupLegalMoves,
  applyMove as applyCoupMove,
  checkWin as checkCoupWin,
  isInCheck as isCoupInCheck,
  getCheckers as getCoupCheckers,
  activeType as coupActiveType,
} from '../game/dark-xiangqi.js';
import * as darkChessEngine from '../game/dark-chess.js';
import * as darkDongtayEngine from '../game/dark-dongtay.js';

// ── Piece display helpers ────────────────────────────────────────────────────

const XIANGQI_CHARS = {
  rK: '帥', rA: '仕', rE: '相', rH: '馬', rR: '車', rC: '炮', rP: '兵',
  bK: '將', bA: '士', bE: '象', bH: '馬', bR: '車', bC: '炮', bP: '卒',
};

const CHESS_UNICODE = {
  K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙',
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟',
};

// Solid (filled) glyph for every piece type — color is applied via CSS so that
// both sides are clearly visible as black vs white pieces.
const CHESS_SOLID = {
  K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟',
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟',
};

const DONGTAY_EAST_CHARS = {
  V: '將', S: '士', T: '象', M: '馬', X: '車', P: '炮', C: '卒',
};

// ── Dark ("Úp") variants — engines + per-type display glyphs ──────────────────
// Each variant shares the same board model (cells: {s,nominal,hidden,covered}).
const XIANGQI_TYPE_CHARS = { K: '將', A: '士', E: '象', H: '馬', R: '車', C: '砲', P: '卒' };

const DARK_VARIANTS = {
  'xiangqi-up': {
    engine: {
      createInitialState: createCoupState,
      getLegalMoves: getCoupLegalMoves,
      applyMove: applyCoupMove,
      checkWin: checkCoupWin,
      isInCheck: isCoupInCheck,
      getCheckers: getCoupCheckers,
      activeType: coupActiveType,
    },
    rows: 10,
    cols: 9,
    boardStyle: 'river',
    // East ('r') and both armies are xiangqi types.
    glyph: (cell) => XIANGQI_TYPE_CHARS[cell.hidden] || '?',
    royalType: () => 'K',
    label: 'Cờ Tướng Úp',
  },
  'chess-up': {
    engine: darkChessEngine,
    rows: 8,
    cols: 8,
    boardStyle: 'cells',
    glyph: (cell) => CHESS_SOLID[cell.hidden] || '?',
    royalType: () => 'K',
    label: 'Cờ Vua Úp',
  },
  'dongtay-up': {
    engine: darkDongtayEngine,
    rows: 10,
    cols: 9,
    boardStyle: 'cells',
    glyph: (cell) => (cell.s === 'r' ? (DONGTAY_EAST_CHARS[cell.hidden] || '?') : (CHESS_SOLID[cell.hidden] || '?')),
    royalType: (s) => (s === 'r' ? 'V' : 'k'),
    label: 'Cờ Đông Tây Úp',
  },
};

function isDarkVariant(t) { return Object.prototype.hasOwnProperty.call(DARK_VARIANTS, t); }

// Format a seconds count as mm:ss for the total-time bank display.
function formatClock(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

// Format a move (either {from,to} or {row,col}) into a short readable label for
// the AI-thinking readout. Columns → A.. , rows → 1-based number.
function formatThinkingMove(mv) {
  if (!mv) return '';
  const cell = (p) => `${String.fromCharCode(65 + p.col)}${p.row + 1}`;
  if (mv.from && mv.to) return `${cell(mv.from)}→${cell(mv.to)}`;
  if (typeof mv.row === 'number' && typeof mv.col === 'number') return cell(mv);
  return '';
}

// ── Board → 3D model normalisation ────────────────────────────────────────────
// Convert each engine's board into a uniform list of pieces the 3D scene renders,
// plus grid metadata. `id` is the piece's current square so the scene can key it
// and animate the mover on each turn.

function gomokuPieces(board) {
  const pieces = [];
  for (let r = 0; r < board.length; r += 1) {
    for (let c = 0; c < board[r].length; c += 1) {
      const v = board[r][c];
      if (v === 0) continue;
      pieces.push({
        id: `${r}-${c}`, row: r, col: c, model: 'stone',
        color: v === 1 ? '#1a1a1a' : '#f4f4f0',
      });
    }
  }
  return { pieces, cols: board[0].length, rows: board.length, boardStyle: 'grid' };
}

function xiangqiPieces(board) {
  const pieces = [];
  for (let r = 0; r < 10; r += 1) {
    for (let c = 0; c < 9; c += 1) {
      const p = board[r][c];
      if (!p) continue;
      const isRed = p[0] === 'r';
      pieces.push({
        id: `${r}-${c}`, row: r, col: c, model: 'disc',
        color: isRed ? '#c0392b' : '#2c3e50',
        top: isRed ? '#ffeedd' : '#e6eef5',
        label: XIANGQI_CHARS[p] || '',
        labelColor: isRed ? '#b01810' : '#1a2733',
        royal: p[1] === 'K',
      });
    }
  }
  return { pieces, cols: 9, rows: 10, boardStyle: 'river' };
}

function chessPieces(board) {
  const pieces = [];
  for (let r = 0; r < 8; r += 1) {
    for (let c = 0; c < 8; c += 1) {
      const p = board[r][c];
      if (!p) continue;
      const isWhite = p === p.toUpperCase();
      pieces.push({
        id: `${r}-${c}`, row: r, col: c, kind: p.toLowerCase(),
        color: isWhite ? '#f2ead8' : '#2b2b2b',
        royal: p.toLowerCase() === 'k',
      });
    }
  }
  return { pieces, cols: 8, rows: 8, boardStyle: 'cells' };
}

function dongtayPieces(board, layout) {
  const pieces = [];
  for (let r = 0; r < 10; r += 1) {
    for (let c = 0; c < 9; c += 1) {
      const p = board[r][c];
      if (!p) continue;
      const isEast = 'VSTMXPC'.includes(p);
      if (isEast) {
        pieces.push({
          id: `${r}-${c}`, row: r, col: c, model: 'disc', color: '#1a5c2a', top: '#fff4d6',
          label: DONGTAY_EAST_CHARS[p] || '', labelColor: '#124a1f',
          royal: p === 'V',
        });
      } else {
        pieces.push({ id: `${r}-${c}`, row: r, col: c, kind: p.toLowerCase(), color: '#f2ead8', royal: p === 'k' });
      }
    }
  }
  return { pieces, cols: 9, rows: 10, boardStyle: layout === 'B' ? 'river' : 'cells' };
}

// Normalise a dark-variant board (object cells) to 3D pieces. Covered pieces
// show a blank "?" back; revealed pieces show their glyph. `boardLayout` only
// matters for dongtay-up: 'A' → cells (Cờ Vua), 'B' → river (Cờ Tướng).
function darkPieces(board, variant, boardLayout = 'A') {
  const cfg = DARK_VARIANTS[variant];
  const pieces = [];
  for (let r = 0; r < cfg.rows; r += 1) {
    for (let c = 0; c < cfg.cols; c += 1) {
      const cell = board[r][c];
      if (!cell) continue;
      const isRed = cell.s === 'r';
      const royalType = cfg.royalType(cell.s);
      if (cell.covered) {
        pieces.push({
          id: `${r}-${c}`, row: r, col: c, model: 'disc',
          color: isRed ? '#9a7b3a' : '#4a4a52', top: '#2a241a',
          label: '', // face down — no identity shown
          covered: true,
        });
      } else {
        // For chess-up (all pieces) and dongtay-up West ('b') side: use 3D chess model.
        const useChessModel =
          variant === 'chess-up' ||
          (variant === 'dongtay-up' && cell.s === 'b');
        if (useChessModel) {
          pieces.push({
            id: `${r}-${c}`, row: r, col: c,
            // No `model` property → ChessScene3D falls through to ChessPiece3D
            kind: cell.hidden.toLowerCase(), // 'K'→'k', 'Q'→'q', etc.
            color: isRed ? '#f2ead8' : '#2b2b2b',
            royal: cell.hidden === royalType,
          });
        } else {
          pieces.push({
            id: `${r}-${c}`, row: r, col: c, model: 'disc',
            color: isRed ? '#c0392b' : '#2c3e50',
            top: isRed ? '#ffeedd' : '#e6eef5',
            label: cfg.glyph(cell),
            labelColor: isRed ? '#b01810' : '#1a2733',
            royal: cell.hidden === royalType,
          });
        }
      }
    }
  }
  const boardStyle = variant === 'dongtay-up'
    ? (boardLayout === 'B' ? 'river' : 'cells')
    : cfg.boardStyle;
  return { pieces, cols: cfg.cols, rows: cfg.rows, boardStyle };
}

// ── ChessGamePanel component ─────────────────────────────────────────────────

export default function ChessGamePanel({ tableType, tableLabel, onClose, initialDifficulty, initialTimeLimit, initialTotalTime }) {
  // Shared state
  const [difficulty, setDifficulty] = useState(
    ['Dễ', 'Trung bình', 'Khó'].includes(initialDifficulty) ? initialDifficulty : 'Khó',
  );
  const [gamePhase, setGamePhase] = useState('playing');
  const [status, setStatus] = useState('');
  const [botThinking, setBotThinking] = useState(false);

  // Think-time controls — BOTH run in parallel:
  //   • per-move: each turn the side-to-move gets `timeLimit` seconds (0 = off).
  //   • total:    each side owns a cumulative bank (`totalTime` seconds) that
  //               counts down only on that side's turn (0 = off).
  // A side loses the instant EITHER its per-move clock or its total bank hits 0.
  const resolvedTimeLimit = [15, 30, 60, 120, 0].includes(initialTimeLimit) ? initialTimeLimit : 30;
  // Default total bank = 15 minutes per side. 0 = off (no total limit).
  const resolvedTotalTime = Number.isFinite(initialTotalTime) && initialTotalTime >= 0
    ? Math.round(initialTotalTime) : 900;
  const totalTimeRef = useRef(resolvedTotalTime); // starting bank per side (seconds)
  const [timeLimit, setTimeLimit] = useState(resolvedTimeLimit); // seconds per move; 0 = off
  const [timeLeft, setTimeLeft] = useState(resolvedTimeLimit || 30);    // remaining seconds for the side to move
  const timeLimitRef = useRef(resolvedTimeLimit);
  const timeLeftRef = useRef(resolvedTimeLimit || 30);
  // Per-side remaining total bank (seconds).
  const [humanBank, setHumanBank] = useState(resolvedTotalTime);
  const [botBank, setBotBank] = useState(resolvedTotalTime);
  const humanBankRef = useRef(resolvedTotalTime);
  const botBankRef = useRef(resolvedTotalTime);
  const timerActiveRef = useRef(false); // true while a side's clock is running
  const timerOwnerRef = useRef('human'); // 'human' | 'bot' — who the running clock belongs to
  useEffect(() => { timeLimitRef.current = timeLimit; }, [timeLimit]);
  useEffect(() => { timeLeftRef.current = timeLeft; }, [timeLeft]);
  useEffect(() => { humanBankRef.current = humanBank; }, [humanBank]);
  useEffect(() => { botBankRef.current = botBank; }, [botBank]);

  // AI thinking visualisation: the worker streams the move it is currently
  // weighing (`candidate`) and the best move found so far (`best`). We pace
  // these events so even a fast search shows a visible sequence.
  const [aiThinking, setAiThinking] = useState(null); // { candidate, best, score, index, total } | null
  const thinkQueueRef = useRef([]);     // pending thinking events
  const thinkTimerRef = useRef(null);   // interval id for the pacer
  const [showThinking, setShowThinking] = useState(false); // stream AI thinking? default OFF
  const showThinkingRef = useRef(false);
  useEffect(() => { showThinkingRef.current = showThinking; }, [showThinking]);

  // Compact HUD: collapsed by default so the settings don't block the 3D view.
  const [hudExpanded, setHudExpanded] = useState(false);

  // Coin-flip animation state: { running, result:'human'|'bot', label }.
  const [coinFlip, setCoinFlip] = useState(null);
  const coinTimerRef = useRef(null);
  const coinRunningRef = useRef(false);
  useEffect(() => { coinRunningRef.current = !!(coinFlip && coinFlip.running); }, [coinFlip]);
  // Run the spinning-coin animation, then invoke `onLand()` once it settles.
  const runCoinFlip = useCallback((firstMover, label, onLand) => {
    setCoinFlip({ running: true, result: firstMover, label });
    coinRunningRef.current = true;
    if (coinTimerRef.current) clearTimeout(coinTimerRef.current);
    coinTimerRef.current = setTimeout(() => {
      setCoinFlip({ running: false, result: firstMover, label });
      coinRunningRef.current = false;
      onLand?.();
      coinTimerRef.current = setTimeout(() => setCoinFlip(null), 1200);
    }, 1700);
  }, []);

  // Check-line effect: when a king is in check, store { king:{row,col}, attackers:[{row,col}] }
  // so the board renderer can draw a beam from each checking piece to the king.
  const [checkLines, setCheckLines] = useState(null);

  // Animation hint for the 3D scene: { id:'row-col', from:{row,col} } — the piece
  // now at `id`'s square glides from `from`. Set on every applied move.
  const [animating, setAnimating] = useState(null);
  const [lastMoveCells, setLastMoveCells] = useState(null);
  const animTimerRef = useRef(null);
  const triggerAnim = useCallback((from, to) => {
    if (!from || !to) return;
    setAnimating({ id: `${to.row}-${to.col}`, from });
    setLastMoveCells({ from, to });
    if (animTimerRef.current) clearTimeout(animTimerRef.current);
    animTimerRef.current = setTimeout(() => setAnimating(null), 360);
  }, []);

  // Gomoku state
  const [gomokuBoard, setGomokuBoard] = useState(() => createGomokuBoard());

  // Xiangqi state
  const [xiangqiBoard, setXiangqiBoard] = useState(() => createXiangqiBoard());
  const [xiangqiTurn, setXiangqiTurn] = useState('red');
  const [xiangqiSelected, setXiangqiSelected] = useState(null); // {row, col}
  const [xiangqiLegal, setXiangqiLegal] = useState([]); // [{from,to}]
  const [xiangqiHumanColor, setXiangqiHumanColor] = useState('red'); // 'red' | 'black'

  // Chess state
  const [chessState, setChessState] = useState(() => createChessState());
  const [chessSelected, setChessSelected] = useState(null); // {row, col}
  const [chessLegal, setChessLegal] = useState([]); // [{from,to,promo?}]
  const [chessHumanColor, setChessHumanColor] = useState('white'); // 'white' | 'black'

  // Dongtay state
  const [dongtayState, setDongtayState] = useState(null);
  const [dongtaySelected, setDongtaySelected] = useState(null); // {row, col}
  const [dongtayLegal, setDongtayLegal] = useState([]); // [{from,to,promo?}]
  const [dongtayLayout, setDongtayLayout] = useState('A');
  const [dongtayPromoRow, setDongtayPromoRow] = useState(null); // {from, to} pending promo move
  const [dongtayHumanSide, setDongtayHumanSide] = useState('west'); // 'west' | 'east'
  const [dongtaySidePref, setDongtaySidePref] = useState('west'); // picker choice: 'west' | 'east' | 'random'

  // Dark ("Úp") variants (coup / chess-up / dongtay-up) — shared state. The board
  // holds object cells; human plays red by default (bot black), unless coin flip.
  const [darkBoard, setDarkBoard] = useState(null);
  const [darkSelected, setDarkSelected] = useState(null);
  const [darkLegal, setDarkLegal] = useState([]);
  const [darkHumanColor, setDarkHumanColor] = useState('red');
  const [darkMode, setDarkMode] = useState('correct'); // 'correct' | 'shuffle'
  // Board layout for Đông Tây Úp: 'A' = theo Cờ Vua (ô vuông), 'B' = theo Cờ Tướng (có sông).
  const [darkBoardLayout, setDarkBoardLayout] = useState('A');
  const darkBoardRef = useRef(null);
  const darkHumanColorRef = useRef('red');
  useEffect(() => { darkBoardRef.current = darkBoard; }, [darkBoard]);
  useEffect(() => { darkHumanColorRef.current = darkHumanColor; }, [darkHumanColor]);

  // Worker ref
  const workerRef = useRef(null);

  // Keep a stable ref to current board/state so the worker message handler can read them
  const gomokuBoardRef = useRef(gomokuBoard);
  const xiangqiBoardRef = useRef(xiangqiBoard);
  const xiangqiTurnRef = useRef(xiangqiTurn);
  const chessStateRef = useRef(chessState);
  const dongtayStateRef = useRef(dongtayState);
  const dongtayHumanSideRef = useRef(dongtayHumanSide);
  const chessHumanColorRef = useRef(chessHumanColor);
  const xiangqiHumanColorRef = useRef(xiangqiHumanColor);

  useEffect(() => { gomokuBoardRef.current = gomokuBoard; }, [gomokuBoard]);
  useEffect(() => { xiangqiBoardRef.current = xiangqiBoard; }, [xiangqiBoard]);
  useEffect(() => { xiangqiTurnRef.current = xiangqiTurn; }, [xiangqiTurn]);
  useEffect(() => { chessStateRef.current = chessState; }, [chessState]);
  useEffect(() => { dongtayStateRef.current = dongtayState; }, [dongtayState]);
  useEffect(() => { dongtayHumanSideRef.current = dongtayHumanSide; }, [dongtayHumanSide]);
  useEffect(() => { chessHumanColorRef.current = chessHumanColor; }, [chessHumanColor]);
  useEffect(() => { xiangqiHumanColorRef.current = xiangqiHumanColor; }, [xiangqiHumanColor]);

  // Dev/test bridge: inject a dongtay board state directly (used by Playwright tests)
  useEffect(() => {
    if (tableType !== 'dongtay') return;
    window.__setDongtayState = (state) => {
      dongtayStateRef.current = state;
      setDongtayState(state);
      setDongtaySelected(null);
      setDongtayLegal([]);
      setDongtayPromoRow(null);
      setGamePhase('playing');
      setBotThinking(false);
      setStatus('Lượt của bạn (Tây)');
    };
    return () => { delete window.__setDongtayState; };
  }, [tableType]);

  // ── Per-move clock ────────────────────────────────────────────────────────

  // Begin counting down for `owner` ('human' | 'bot'). The per-move clock resets
  // to the full limit each turn; the total bank persists across turns. The clock
  // is "active" whenever at least one of the two limits is enabled.
  const startClock = useCallback((owner) => {
    timerOwnerRef.current = owner;
    // Reset the per-move clock for the new turn (even if the per-move limit is off,
    // keeping timeLeft in sync is harmless).
    timeLeftRef.current = timeLimitRef.current;
    setTimeLeft(timeLimitRef.current);
    const anyLimit = timeLimitRef.current > 0 || totalTimeRef.current > 0;
    timerActiveRef.current = anyLimit;
  }, []);

  const stopClock = useCallback(() => {
    timerActiveRef.current = false;
  }, []);

  // The side whose clock runs out loses — this works for every game type and
  // for both the human and the bot.
  const handleTimeout = useCallback((owner) => {
    timerActiveRef.current = false;
    // Stop any AI-thinking visualisation.
    if (thinkTimerRef.current) { clearInterval(thinkTimerRef.current); thinkTimerRef.current = null; }
    thinkQueueRef.current = [];
    setAiThinking(null);
    if (owner === 'human') {
      setGamePhase('bot-win');
      setStatus('Hết giờ! Bạn đã thua (quá thời gian suy nghĩ).');
    } else {
      setGamePhase('human-win');
      setStatus('Hết giờ! Bot đã thua (quá thời gian suy nghĩ).');
    }
    setBotThinking(false);
  }, []);

  // 1-second ticker. Decrements BOTH the per-move clock and the active side's
  // total bank in parallel; whichever reaches 0 first ends the game as a loss.
  useEffect(() => {
    const id = setInterval(() => {
      if (!timerActiveRef.current) return;
      const owner = timerOwnerRef.current;
      let timedOut = false;

      // Per-move clock (only if the per-move limit is enabled).
      if (timeLimitRef.current > 0) {
        const next = Math.max(0, timeLeftRef.current - 1);
        timeLeftRef.current = next;
        setTimeLeft(next);
        if (next === 0) timedOut = true;
      }

      // Total bank for the side to move (only if a total limit is set).
      if (totalTimeRef.current > 0) {
        const ref = owner === 'human' ? humanBankRef : botBankRef;
        const setBank = owner === 'human' ? setHumanBank : setBotBank;
        const next = Math.max(0, ref.current - 1);
        ref.current = next;
        setBank(next);
        if (next === 0) timedOut = true;
      }

      if (timedOut) handleTimeout(owner);
    }, 1000);
    return () => clearInterval(id);
  }, [handleTimeout]);

  // ── AI thinking pacer ───────────────────────────────────────────────────────
  // Thinking events can arrive in a burst (fast search). Display them one at a
  // time at a steady cadence so the user can watch the AI weigh moves.
  const stopThinkPacer = useCallback(() => {
    if (thinkTimerRef.current) {
      clearInterval(thinkTimerRef.current);
      thinkTimerRef.current = null;
    }
  }, []);

  const clearThinking = useCallback(() => {
    stopThinkPacer();
    thinkQueueRef.current = [];
    setAiThinking(null);
  }, [stopThinkPacer]);

  const enqueueThinking = useCallback((event) => {
    thinkQueueRef.current.push(event);
    if (thinkTimerRef.current) return;
    // Flush the queue at ~12 fps; if events pile up, show the latest few quickly.
    thinkTimerRef.current = setInterval(() => {
      const queue = thinkQueueRef.current;
      if (queue.length === 0) {
        stopThinkPacer();
        return;
      }
      // If the backlog is large, skip ahead so we never lag far behind.
      const step = queue.length > 20 ? Math.ceil(queue.length / 20) : 1;
      let next;
      for (let i = 0; i < step; i += 1) next = queue.shift();
      if (next) setAiThinking(next);
    }, 80);
  }, [stopThinkPacer]);

  // Drive the clock from game phase + whose turn it is. Each time the side to
  // move changes (human ↔ bot), the per-move clock restarts at the full limit.
  useEffect(() => {
    if (gamePhase !== 'playing' || (coinFlip && coinFlip.running)) {
      stopClock();
      return;
    }
    // dongtay has a layout/side picker phase handled by gamePhase too.
    const owner = botThinking ? 'bot' : 'human';
    startClock(owner);
  }, [gamePhase, botThinking, timeLimit, startClock, stopClock, coinFlip]);

  // ── startNewGame ────────────────────────────────────────────────────────────

  const startNewGame = useCallback(() => {
    setBotThinking(false);
    clearThinking();
    setCheckLines(null);
    setAnimating(null);
    setLastMoveCells(null);
    // Reset the total-time banks for a fresh game.
    humanBankRef.current = totalTimeRef.current;
    botBankRef.current = totalTimeRef.current;
    setHumanBank(totalTimeRef.current);
    setBotBank(totalTimeRef.current);

    if (tableType === 'caro') {
      setGamePhase('playing');
      const board = createGomokuBoard();
      setGomokuBoard(board);
      gomokuBoardRef.current = board;
      // Coin flip: randomise who places the first stone. Human = black (●), bot = white (○).
      const botFirst = Math.random() < 0.5;
      setStatus('Đang tung đồng xu…');
      runCoinFlip(botFirst ? 'bot' : 'human', botFirst ? 'Bot đi trước (trắng)' : 'Bạn đi trước (đen)', () => {
        if (botFirst) {
          setBotThinking(true);
          setStatus('Bot đi trước (quân trắng)…');
          workerRef.current.postMessage({ type: 'move', board, difficulty });
        } else {
          setStatus('Lượt của bạn (quân đen)');
        }
      });
    } else if (tableType === 'xiangqi') {
      setGamePhase('playing');
      const board = createXiangqiBoard();
      setXiangqiBoard(board);
      xiangqiBoardRef.current = board;
      setXiangqiTurn('red');
      xiangqiTurnRef.current = 'red';
      setXiangqiSelected(null);
      setXiangqiLegal([]);
      // Coin flip: human plays Red or Black. Red always moves first.
      const humanColor = Math.random() < 0.5 ? 'red' : 'black';
      setXiangqiHumanColor(humanColor);
      xiangqiHumanColorRef.current = humanColor;
      const humanLabel = humanColor === 'red' ? 'Đỏ' : 'Đen';
      const botFirst = humanColor === 'black';
      setStatus('Đang tung đồng xu…');
      runCoinFlip(botFirst ? 'bot' : 'human', botFirst ? 'Bot đi trước (Đỏ)' : `Bạn đi trước (${humanLabel})`, () => {
        if (botFirst) {
          setBotThinking(true);
          setStatus('Bot đi trước (Đỏ)…');
          workerRef.current.postMessage({ type: 'move', board, difficulty, botSide: 'red' });
        } else {
          setStatus(`Lượt của bạn (${humanLabel})`);
        }
      });
    } else if (tableType === 'dongtay') {
      setGamePhase('layout-select');
      setStatus('Chọn cách bố trí bàn cờ');
      setDongtaySelected(null);
      setDongtayLegal([]);
      setDongtayPromoRow(null);
    } else if (isDarkVariant(tableType)) {
      // Dark variants start with a mode picker (đúng bên / lộn xộn).
      setGamePhase('layout-select');
      setStatus('Chọn chế độ quân úp');
      setDarkSelected(null);
      setDarkLegal([]);
      setDarkBoard(null);
      darkBoardRef.current = null;
    } else {
      setGamePhase('playing');
      const state = createChessState();
      setChessState(state);
      chessStateRef.current = state;
      setChessSelected(null);
      setChessLegal([]);
      // Coin flip: human plays White or Black. White always moves first.
      const humanColor = Math.random() < 0.5 ? 'white' : 'black';
      setChessHumanColor(humanColor);
      chessHumanColorRef.current = humanColor;
      const humanLabel = humanColor === 'white' ? 'Trắng' : 'Đen';
      const botFirst = humanColor === 'black';
      setStatus('Đang tung đồng xu…');
      runCoinFlip(botFirst ? 'bot' : 'human', botFirst ? 'Bot đi trước (Trắng)' : `Bạn đi trước (${humanLabel})`, () => {
        if (botFirst) {
          setBotThinking(true);
          setStatus('Bot đi trước (Trắng)…');
          workerRef.current.postMessage({ type: 'move', state, difficulty, botSide: 'white' });
        } else {
          setStatus(`Lượt của bạn (${humanLabel})`);
        }
      });
    }
  }, [tableType]);

  // ── startDongtayGame ────────────────────────────────────────────────────────

  function startDongtayGame(layout) {
    const side = dongtaySidePref === 'random'
      ? (Math.random() < 0.5 ? 'west' : 'east')
      : dongtaySidePref;
    const state = createDongtayState(layout);
    dongtayStateRef.current = state;
    setDongtayState(state);
    setDongtayLayout(layout);
    setDongtayHumanSide(side);
    dongtayHumanSideRef.current = side;
    setDongtaySelected(null);
    setDongtayLegal([]);
    setDongtayPromoRow(null);
    setGamePhase('playing');

    const sideLabel = side === 'west' ? 'Tây' : 'Đông';
    // West always moves first. If the human is East, the bot (West) opens.
    const botFirst = side === 'east';
    setStatus('Đang tung đồng xu…');
    runCoinFlip(botFirst ? 'bot' : 'human', botFirst ? 'Bot đi trước (Tây)' : `Bạn đi trước (${sideLabel})`, () => {
      if (botFirst) {
        setBotThinking(true);
        setStatus('Bot đi trước (Tây)…');
        workerRef.current.postMessage({ type: 'move', state, difficulty, botSide: 'west' });
      } else {
        setStatus(`Lượt của bạn (${sideLabel})`);
      }
    });
  }

  // ── startDarkGame (coup / chess-up / dongtay-up) ─────────────────────────────

  function startDarkGame(mode, boardLayout = 'A') {
    const cfg = DARK_VARIANTS[tableType];
    const board = cfg.engine.createInitialState(mode).board;
    if (tableType === 'dongtay-up') setDarkBoardLayout(boardLayout);
    // Coin-flip the human colour; red always moves first.
    const humanColor = Math.random() < 0.5 ? 'red' : 'black';
    darkBoardRef.current = board;
    setDarkBoard(board);
    setDarkMode(mode);
    setDarkHumanColor(humanColor);
    darkHumanColorRef.current = humanColor;
    setDarkSelected(null);
    setDarkLegal([]);
    setGamePhase('playing');
    const humanLabel = humanColor === 'red' ? 'Đỏ' : 'Đen';
    const botFirst = humanColor === 'black';
    setStatus('Đang tung đồng xu…');
    runCoinFlip(botFirst ? 'bot' : 'human', botFirst ? 'Bot đi trước (Đỏ)' : `Bạn đi trước (${humanLabel})`, () => {
      if (botFirst) {
        setBotThinking(true);
        setStatus('Bot đi trước (Đỏ)…');
        workerRef.current.postMessage({ type: 'move', board, difficulty, botSide: 'red', variant: tableType });
      } else {
        setStatus(`Lượt của bạn (${humanLabel})`);
      }
    });
  }

  function handleDarkClick(row, col) {
    if (botThinking || gamePhase !== 'playing' || coinRunningRef.current) return;
    const cfg = DARK_VARIANTS[tableType];
    const board = darkBoardRef.current;
    if (!board) return;
    const humanColor = darkHumanColorRef.current;
    const botColor = humanColor === 'red' ? 'black' : 'red';
    const humanLabel = humanColor === 'red' ? 'Đỏ' : 'Đen';
    const humanCode = humanColor === 'red' ? 'r' : 'b';
    const cell = board[row][col];

    if (darkSelected) {
      const mv = darkLegal.find((m) => m.to.row === row && m.to.col === col);
      if (mv) {
        const newBoard = cfg.engine.applyMove(board, darkSelected, { row, col }, mv.promo);
        darkBoardRef.current = newBoard;
        setDarkBoard(newBoard);
        triggerAnim(darkSelected, { row, col });
        setDarkSelected(null);
        setDarkLegal([]);
        const winner = cfg.engine.checkWin(newBoard);
        if (winner === humanColor) { setGamePhase('human-win'); setStatus('Bạn thắng!'); return; }
        if (winner === botColor) { setGamePhase('bot-win'); setStatus('Bot thắng!'); return; }
        setBotThinking(true);
        const botInCheck = cfg.engine.isInCheck(newBoard, botColor);
        setCheckLines(botInCheck ? cfg.engine.getCheckers(newBoard, botColor) : null);
        setStatus(botInCheck ? '⚠ Chiếu! Bot đang suy nghĩ...' : 'Bot đang suy nghĩ...');
        workerRef.current.postMessage({ type: 'move', board: newBoard, difficulty, botSide: botColor, variant: tableType });
        return;
      }
    }
    // Select one of the human's pieces.
    if (cell && cell.s === humanCode) {
      const all = cfg.engine.getLegalMoves(board, humanColor);
      setDarkSelected({ row, col });
      setDarkLegal(all.filter((m) => m.from.row === row && m.from.col === col));
    } else {
      setDarkSelected(null);
      setDarkLegal([]);
    }
  }

  // ── Worker lifecycle ────────────────────────────────────────────────────────

  useEffect(() => {
    // Terminate any previous worker
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }

    let worker;
    if (tableType === 'caro') {
      // eslint-disable-next-line no-undef
      worker = new Worker(new URL('../game/gomoku-worker.js', import.meta.url), { type: 'module' });
    } else if (tableType === 'xiangqi') {
      // eslint-disable-next-line no-undef
      worker = new Worker(new URL('../game/xiangqi-worker.js', import.meta.url), { type: 'module' });
    } else if (tableType === 'dongtay') {
      // eslint-disable-next-line no-undef
      worker = new Worker(new URL('../game/dongtay-worker.js', import.meta.url), { type: 'module' });
    } else if (isDarkVariant(tableType)) {
      // eslint-disable-next-line no-undef
      worker = new Worker(new URL('../game/dark-worker.js', import.meta.url), { type: 'module' });
    } else {
      // eslint-disable-next-line no-undef
      worker = new Worker(new URL('../game/chess-worker.js', import.meta.url), { type: 'module' });
    }

    worker.onmessage = (event) => {
      const { type, move } = event.data;
      if (type === 'thinking') {
        if (showThinkingRef.current) enqueueThinking(event.data);
        return;
      }
      if (type !== 'bestMove') return;
      clearThinking();

      if (isDarkVariant(tableType)) {
        const cfg = DARK_VARIANTS[tableType];
        const board = darkBoardRef.current;
        if (!board) { setBotThinking(false); return; }
        const newBoard = cfg.engine.applyMove(board, move.from, move.to, move.promo);
        darkBoardRef.current = newBoard;
        setDarkBoard(newBoard);
        triggerAnim(move.from, move.to);
        setDarkSelected(null);
        setDarkLegal([]);
        const humanColor = darkHumanColorRef.current;
        const botColor = humanColor === 'red' ? 'black' : 'red';
        const humanLabel = humanColor === 'red' ? 'Đỏ' : 'Đen';
        const winner = cfg.engine.checkWin(newBoard);
        if (winner === botColor) { setGamePhase('bot-win'); setStatus('Bot thắng!'); }
        else if (winner === humanColor) { setGamePhase('human-win'); setStatus('Bạn thắng!'); }
        else {
          const inCheck = cfg.engine.isInCheck(newBoard, humanColor);
          setStatus(`Lượt của bạn (${humanLabel})${inCheck ? ' — ⚠ Chiếu tướng!' : ''}`);
          setCheckLines(inCheck ? cfg.engine.getCheckers(newBoard, humanColor) : null);
        }
        setBotThinking(false);
        return;
      }

      if (tableType === 'caro') {
        const board = gomokuBoardRef.current;
        const newBoard = applyGomokuMove(board, move.row, move.col, 2);
        gomokuBoardRef.current = newBoard;
        setGomokuBoard(newBoard);

        if (checkGomokuWin(newBoard, 2)) {
          setGamePhase('bot-win');
          setStatus('Bot thắng! (quân trắng)');
        } else if (isGomokuDraw(newBoard)) {
          setGamePhase('draw');
          setStatus('Hòa!');
        } else {
          setStatus('Lượt của bạn (quân đen)');
        }
        setBotThinking(false);

      } else if (tableType === 'xiangqi') {
        const board = xiangqiBoardRef.current;
        const newBoard = applyXiangqiMove(board, move.from, move.to);
        xiangqiBoardRef.current = newBoard;
        setXiangqiBoard(newBoard);
        triggerAnim(move.from, move.to);
        const humanColor = xiangqiHumanColorRef.current;
        const botColor = humanColor === 'red' ? 'black' : 'red';
        const humanLabel = humanColor === 'red' ? 'Đỏ' : 'Đen';
        setXiangqiTurn(humanColor);
        xiangqiTurnRef.current = humanColor;
        setXiangqiSelected(null);
        setXiangqiLegal([]);

        const winner = checkXiangqiWin(newBoard);
        if (winner === botColor) {
          setGamePhase('bot-win');
          setStatus('Bot thắng!');
        } else if (winner === humanColor) {
          setGamePhase('human-win');
          setStatus('Bạn thắng!');
        } else {
          const inCheck = isXiangqiInCheck(newBoard, humanColor);
          setStatus(`Lượt của bạn (${humanLabel})${inCheck ? ' — ⚠ Chiếu tướng!' : ''}`);
          setCheckLines(inCheck ? getXiangqiCheckers(newBoard, humanColor) : null);
        }
        setBotThinking(false);

      } else if (tableType === 'dongtay') {
        const state = dongtayStateRef.current;
        if (!state) { setBotThinking(false); return; }
        const newState = applyDongtayMove(state, move.from, move.to, move.promo || 'q');
        dongtayStateRef.current = newState;
        setDongtayState(newState);
        triggerAnim(move.from, move.to);
        setDongtaySelected(null);
        setDongtayLegal([]);

        const result = checkDongtayResult(newState);
        const humanSide = dongtayHumanSideRef.current;
        const botSide = humanSide === 'west' ? 'east' : 'west';
        const humanLabel = humanSide === 'west' ? 'Tây' : 'Đông';
        const botLabel = botSide === 'west' ? 'Tây' : 'Đông';
        if (result === botSide) {
          setGamePhase('bot-win');
          setStatus(`Bot thắng! (Phe ${botLabel})`);
        } else if (result === humanSide) {
          setGamePhase('human-win');
          setStatus(`Bạn thắng! (Phe ${humanLabel})`);
        } else if (result === 'draw') {
          setGamePhase('draw');
          setStatus('Hòa!');
        } else {
          let statusMsg = `Lượt của bạn (${humanLabel})`;
          const dtBotCheck = dongtayCheckLines(newState.board);
          if (dtBotCheck) {
            statusMsg = `Lượt của bạn (${humanLabel}) — ⚠ Mặt Tướng! Tướng đối diện Vua!`;
          }
          setCheckLines(dtBotCheck);
          setStatus(statusMsg);
        }
        setBotThinking(false);

      } else {
        // chess
        const state = chessStateRef.current;
        const newState = applyChessMove(state, move.from, move.to, move.promo || 'q');
        chessStateRef.current = newState;
        setChessState(newState);
        triggerAnim(move.from, move.to);
        setChessSelected(null);
        setChessLegal([]);

        const result = checkChessResult(newState);
        const humanColor = chessHumanColorRef.current;
        const botColor = humanColor === 'white' ? 'black' : 'white';
        const humanLabel = humanColor === 'white' ? 'Trắng' : 'Đen';
        if (result === botColor) {
          setGamePhase('bot-win');
          setStatus('Bot thắng!');
        } else if (result === humanColor) {
          setGamePhase('human-win');
          setStatus('Bạn thắng!');
        } else if (result === 'draw') {
          setGamePhase('draw');
          setStatus('Hòa!');
        } else {
          const inCheck = isChessInCheck(newState, humanColor);
          setStatus(`Lượt của bạn (${humanLabel})${inCheck ? ' — ⚠ Chiếu tướng!' : ''}`);
          setCheckLines(inCheck ? getChessCheckers(newState, humanColor) : null);
        }
        setBotThinking(false);
      }
    };

    worker.onerror = (err) => {
      console.error('Chess worker error:', err);
      setBotThinking(false);
    };

    workerRef.current = worker;
    startNewGame();

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
    // startNewGame is stable (memoized with tableType), safe to include
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableType]);

  // ── Gomoku: human move ──────────────────────────────────────────────────────

  function handleGomokuClick(row, col) {
    if (botThinking || gamePhase !== 'playing' || coinRunningRef.current) return;
    const board = gomokuBoardRef.current;
    if (board[row][col] !== 0) return;

    const newBoard = applyGomokuMove(board, row, col, 1);
    gomokuBoardRef.current = newBoard;
    setGomokuBoard(newBoard);

    if (checkGomokuWin(newBoard, 1)) {
      setGamePhase('human-win');
      setStatus('Bạn thắng! (quân đen)');
      return;
    }
    if (isGomokuDraw(newBoard)) {
      setGamePhase('draw');
      setStatus('Hòa!');
      return;
    }

    setBotThinking(true);
    setStatus('Bot đang suy nghĩ...');
    workerRef.current.postMessage({ type: 'move', board: newBoard, difficulty });
  }

  // ── Xiangqi: human move ─────────────────────────────────────────────────────

  function handleXiangqiClick(row, col) {
    if (botThinking || gamePhase !== 'playing' || coinRunningRef.current) return;
    const board = xiangqiBoardRef.current;
    const piece = board[row][col];
    const humanColor = xiangqiHumanColorRef.current;
    const botColor = humanColor === 'red' ? 'black' : 'red';
    const humanPrefix = humanColor === 'red' ? 'r' : 'b';

    // If there's a selected piece and this is a legal destination
    if (xiangqiSelected) {
      const isLegal = xiangqiLegal.some(
        (mv) => mv.to.row === row && mv.to.col === col,
      );
      if (isLegal) {
        const newBoard = applyXiangqiMove(board, xiangqiSelected, { row, col });
        xiangqiBoardRef.current = newBoard;
        setXiangqiBoard(newBoard);
        triggerAnim(xiangqiSelected, { row, col });
        setXiangqiSelected(null);
        setXiangqiLegal([]);

        const winner = checkXiangqiWin(newBoard);
        if (winner === humanColor) {
          setGamePhase('human-win');
          setStatus('Bạn thắng!');
          return;
        }
        if (winner === botColor) {
          setGamePhase('bot-win');
          setStatus('Bot thắng!');
          return;
        }

        setXiangqiTurn(botColor);
        xiangqiTurnRef.current = botColor;
        setBotThinking(true);
        const botInCheck = isXiangqiInCheck(newBoard, botColor);
        setCheckLines(botInCheck ? getXiangqiCheckers(newBoard, botColor) : null);
        setStatus(botInCheck ? '⚠ Chiếu! Bot đang suy nghĩ...' : 'Bot đang suy nghĩ...');
        workerRef.current.postMessage({ type: 'move', board: newBoard, difficulty, botSide: botColor });
        return;
      }
    }

    // Select one of the human's pieces
    if (piece && piece[0] === humanPrefix) {
      const allLegal = getXiangqiLegalMoves(board, humanColor);
      const movesFromHere = allLegal.filter(
        (mv) => mv.from.row === row && mv.from.col === col,
      );
      setXiangqiSelected({ row, col });
      setXiangqiLegal(movesFromHere);
    } else {
      // Clicking empty or opponent piece without prior selection → deselect
      setXiangqiSelected(null);
      setXiangqiLegal([]);
    }
  }

  // ── Chess: human move ───────────────────────────────────────────────────────

  function handleChessClick(row, col) {
    if (botThinking || gamePhase !== 'playing' || coinRunningRef.current) return;
    const state = chessStateRef.current;
    const piece = state.board[row][col];
    const humanColor = chessHumanColorRef.current;
    const botColor = humanColor === 'white' ? 'black' : 'white';

    // If there's a selected piece and this is a legal destination
    if (chessSelected) {
      const isLegal = chessLegal.some(
        (mv) => mv.to.row === row && mv.to.col === col,
      );
      if (isLegal) {
        const mv = chessLegal.find((m) => m.to.row === row && m.to.col === col);
        const newState = applyChessMove(state, chessSelected, { row, col }, mv.promo || 'q');
        chessStateRef.current = newState;
        setChessState(newState);
        triggerAnim(chessSelected, { row, col });
        setChessSelected(null);
        setChessLegal([]);

        const result = checkChessResult(newState);
        if (result === humanColor) {
          setGamePhase('human-win');
          setStatus('Bạn thắng!');
          return;
        }
        if (result === botColor) {
          setGamePhase('bot-win');
          setStatus('Bot thắng!');
          return;
        }
        if (result === 'draw') {
          setGamePhase('draw');
          setStatus('Hòa!');
          return;
        }

        setBotThinking(true);
        const botInCheck = isChessInCheck(newState, botColor);
        setCheckLines(botInCheck ? getChessCheckers(newState, botColor) : null);
        setStatus(botInCheck ? '⚠ Chiếu! Bot đang suy nghĩ...' : 'Bot đang suy nghĩ...');
        workerRef.current.postMessage({ type: 'move', state: newState, difficulty, botSide: botColor });
        return;
      }
    }

    // Select one of the human's pieces (White = uppercase, Black = lowercase)
    const isWhitePiece = piece && piece === piece.toUpperCase() && piece !== piece.toLowerCase();
    const isBlackPiece = piece && piece === piece.toLowerCase() && piece !== piece.toUpperCase();
    const isHumanPiece = humanColor === 'white' ? isWhitePiece : isBlackPiece;
    if (isHumanPiece) {
      const allLegal = getChessLegalMoves(state, humanColor);
      const movesFromHere = allLegal.filter(
        (mv) => mv.from.row === row && mv.from.col === col,
      );
      setChessSelected({ row, col });
      setChessLegal(movesFromHere);
    } else {
      setChessSelected(null);
      setChessLegal([]);
    }
  }

  // ── Dongtay: human move ─────────────────────────────────────────────────────

  // "Chiếu tướng" in Đông Tây = the Mặt Tướng threat: East's V and West's k sit
  // on the same file with nothing between them. Return the check-line shape the
  // 2D/3D beam renderers expect ({ king, attackers }) so the effect fires, or
  // null when there is no facing threat.
  function dongtayCheckLines(board) {
    if (!isVGeneralFacing(board)) return null;
    let v = null;
    let k = null;
    for (let r = 0; r <= 9; r += 1) {
      for (let c = 0; c <= 8; c += 1) {
        if (board[r][c] === 'V') v = { row: r, col: c };
        if (board[r][c] === 'k') k = { row: r, col: c };
      }
    }
    if (!v || !k) return null;
    // Highlight both generals; the beam is drawn from attacker → king.
    return { king: k, attackers: [v] };
  }

  function handleDongtayClick(row, col) {
    if (botThinking || gamePhase !== 'playing' || coinRunningRef.current) return;
    const state = dongtayStateRef.current;
    if (!state) return;
    const humanSide = dongtayHumanSideRef.current;
    const botSide = humanSide === 'west' ? 'east' : 'west';
    const humanLabel = humanSide === 'west' ? 'Tây' : 'Đông';
    const botLabel = botSide === 'west' ? 'Tây' : 'Đông';
    const piece = state.board[row][col];

    // If there's a selected piece and this is a legal destination
    if (dongtaySelected) {
      const isLegal = dongtayLegal.some(
        (mv) => mv.to.row === row && mv.to.col === col,
      );
      if (isLegal) {
        const mv = dongtayLegal.find((m) => m.to.row === row && m.to.col === col);
        const fromPos = dongtaySelected;
        const toPos = { row, col };

        // West pawn ('p') promotes when reaching row 9 — only when human plays West.
        const movingPiece = state.board[fromPos.row][fromPos.col];
        if (humanSide === 'west' && movingPiece === 'p' && toPos.row === 9) {
          // Show promotion picker
          setDongtayPromoRow({ from: fromPos, to: toPos });
          setDongtaySelected(null);
          setDongtayLegal([]);
          return;
        }

        const newState = applyDongtayMove(state, fromPos, toPos, mv.promo || 'q');
        dongtayStateRef.current = newState;
        setDongtayState(newState);
        triggerAnim(fromPos, toPos);
        setDongtaySelected(null);
        setDongtayLegal([]);

        const result = checkDongtayResult(newState);
        if (result === humanSide) {
          setGamePhase('human-win');
          setStatus(`Bạn thắng! (Phe ${humanLabel})`);
          return;
        }
        if (result === botSide) {
          setGamePhase('bot-win');
          setStatus(`Bot thắng! (Phe ${botLabel})`);
          return;
        }
        if (result === 'draw') {
          setGamePhase('draw');
          setStatus('Hòa!');
          return;
        }

        setBotThinking(true);
        const dtCheck = dongtayCheckLines(newState.board);
        setCheckLines(dtCheck);
        setStatus(dtCheck ? '⚠ Mặt Tướng! Bot đang suy nghĩ...' : 'Bot đang suy nghĩ...');
        workerRef.current.postMessage({ type: 'move', state: newState, difficulty, botSide });
        return;
      }
    }

    // Select one of the human's pieces
    const westPieces = 'krnbpq';
    const eastPieces = 'VSTMXPC';
    const humanPieces = humanSide === 'west' ? westPieces : eastPieces;
    if (piece && humanPieces.includes(piece)) {
      const allLegal = getDongtayLegalMoves(state, humanSide);
      const movesFromHere = allLegal.filter(
        (mv) => mv.from.row === row && mv.from.col === col,
      );
      setDongtaySelected({ row, col });
      setDongtayLegal(movesFromHere);
    } else {
      setDongtaySelected(null);
      setDongtayLegal([]);
    }
  }

  // ── Dongtay: promotion handler ──────────────────────────────────────────────

  function handleDongtayPromo(promo) {
    if (!dongtayPromoRow) return;
    const { from, to } = dongtayPromoRow;
    const state = dongtayStateRef.current;
    if (!state) { setDongtayPromoRow(null); return; }

    const humanSide = dongtayHumanSideRef.current;
    const botSide = humanSide === 'west' ? 'east' : 'west';
    const humanLabel = humanSide === 'west' ? 'Tây' : 'Đông';
    const botLabel = botSide === 'west' ? 'Tây' : 'Đông';

    const newState = applyDongtayMove(state, from, to, promo);
    dongtayStateRef.current = newState;
    setDongtayState(newState);
    setDongtayPromoRow(null);

    const result = checkDongtayResult(newState);
    if (result === humanSide) {
      setGamePhase('human-win');
      setStatus(`Bạn thắng! (Phe ${humanLabel})`);
      return;
    }
    if (result === botSide) {
      setGamePhase('bot-win');
      setStatus(`Bot thắng! (Phe ${botLabel})`);
      return;
    }
    if (result === 'draw') {
      setGamePhase('draw');
      setStatus('Hòa!');
      return;
    }

    setBotThinking(true);
    const dtPromoCheck = dongtayCheckLines(newState.board);
    setCheckLines(dtPromoCheck);
    setStatus(dtPromoCheck ? '⚠ Mặt Tướng! Bot đang suy nghĩ...' : 'Bot đang suy nghĩ...');
    workerRef.current.postMessage({ type: 'move', state: newState, difficulty, botSide });
  }

  // ── Resign ──────────────────────────────────────────────────────────────────

  function handleResign() {
    if (gamePhase !== 'playing') return;
    setGamePhase('bot-win');
    setStatus('Bot thắng! (Bạn đã từ bỏ)');
    setBotThinking(false);
  }
  // ── Render helpers ──────────────────────────────────────────────────────────

  // Draw animated "check beams" from each checking piece to the king. `opts`
  // supplies the per-board geometry: toXY(pos)→{x,y}, plus cell/cols/rows for
  // the SVG viewport. Returns null when there is no active check.
  function renderCheckBeams(opts) {
    if (!checkLines || !checkLines.king || !checkLines.attackers?.length) return null;
    const { toXY, cell, cols, rows } = opts;
    const width = cell * cols;
    const height = cell * rows;
    const king = toXY(checkLines.king);
    return (
      <svg
        className="chess-check-beams"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 20 }}
      >
        {checkLines.attackers.map((a, i) => {
          const from = toXY(a);
          return (
            <g key={i}>
              <line
                x1={from.x} y1={from.y} x2={king.x} y2={king.y}
                stroke="#ff4040" strokeWidth="4" strokeLinecap="round" opacity="0.85"
                className="chess-check-beam-line"
              />
              <circle cx={king.x} cy={king.y} r={cell * 0.42} fill="none"
                stroke="#ff4040" strokeWidth="3" className="chess-check-beam-ring" />
            </g>
          );
        })}
      </svg>
    );
  }

  // Returns extra class names marking a cell as part of the AI's current
  // thinking: the move it is weighing (candidate) or the best found so far.
  function thinkingCellClass(r, c) {
    if (!aiThinking || !botThinking) return '';
    let cls = '';
    const hit = (mv) => mv && (
      (mv.from && ((mv.from.row === r && mv.from.col === c) || (mv.to.row === r && mv.to.col === c)))
      || (typeof mv.row === 'number' && mv.row === r && mv.col === c)
    );
    if (hit(aiThinking.candidate)) cls += ' ai-think-candidate';
    if (hit(aiThinking.best)) cls += ' ai-think-best';
    return cls;
  }

  function renderGomokuBoard() {
    return (
      <div className="gomoku-grid" role="grid" aria-label="Bàn cờ ca rô">
        {gomokuBoard.map((rowArr, r) =>
          rowArr.map((cell, c) => {
            const stoneLabel = cell === 1 ? 'đen' : cell === 2 ? 'trắng' : '';
            return (
              <button
                key={`${r}-${c}`}
                className={`gomoku-cell${thinkingCellClass(r, c)}`}
                type="button"
                aria-label={`Ô ${r + 1}-${c + 1}${stoneLabel ? `: quân ${stoneLabel}` : ''}`}
                disabled={botThinking || gamePhase !== 'playing' || cell !== 0}
                onClick={() => handleGomokuClick(r, c)}
              >
                {cell === 1 && <span className="gomoku-stone gomoku-stone--black" />}
                {cell === 2 && <span className="gomoku-stone gomoku-stone--white" />}
              </button>
            );
          }),
        )}
      </div>
    );
  }

  function renderXiangqiBoard() {
    const legalDestSet = new Set(
      xiangqiLegal.map((mv) => `${mv.to.row}-${mv.to.col}`),
    );

    // Board dimensions: 9 cols × 10 rows on intersections (cờ tướng style)
    // Each cell = 52px wide × 44px tall
    const CW = 52; // cell width
    const CH = 46; // cell height
    const PAD = 26; // padding from edge to first intersection = half cell
    const totalW = CW * 8 + PAD * 2; // 8 gaps + 2 half-pads
    const totalH = CH * 9 + PAD * 2;

    // SVG grid lines
    const LINE_COLOR = '#4a2f08';
    const LINE_W = 1.4;
    const lines = [];
    // Vertical lines (9 lines, cols 0–8)
    for (let c = 0; c <= 8; c++) {
      const x = PAD + c * CW;
      // Top half (rows 5–9): full vertical line
      lines.push(<line key={`v-top-${c}`} x1={x} y1={PAD} x2={x} y2={PAD + 4 * CH} stroke={LINE_COLOR} strokeWidth={LINE_W} />);
      // Bottom half (rows 0–4): full vertical line
      lines.push(<line key={`v-bot-${c}`} x1={x} y1={PAD + 5 * CH} x2={x} y2={PAD + 9 * CH} stroke={LINE_COLOR} strokeWidth={LINE_W} />);
      // Bridge connecting halves only on outer columns
      if (c === 0 || c === 8) {
        lines.push(<line key={`v-mid-${c}`} x1={x} y1={PAD + 4 * CH} x2={x} y2={PAD + 5 * CH} stroke={LINE_COLOR} strokeWidth={LINE_W} />);
      }
    }
    // Horizontal lines (10 lines, rows 0–9, drawn bottom-to-top in display)
    for (let r = 0; r <= 9; r++) {
      const y = PAD + (9 - r) * CH;
      lines.push(<line key={`h-${r}`} x1={PAD} y1={y} x2={PAD + 8 * CW} y2={y} stroke={LINE_COLOR} strokeWidth={LINE_W} />);
    }
    // Palace diagonal lines — top palace (rows 7–9, cols 3–5, display rows 0–2)
    const tpY1 = PAD + 0 * CH, tpY2 = PAD + 2 * CH;
    const tpX1 = PAD + 3 * CW, tpX2 = PAD + 5 * CW;
    lines.push(<line key="pal-top-1" x1={tpX1} y1={tpY1} x2={tpX2} y2={tpY2} stroke={LINE_COLOR} strokeWidth={LINE_W} />);
    lines.push(<line key="pal-top-2" x1={tpX2} y1={tpY1} x2={tpX1} y2={tpY2} stroke={LINE_COLOR} strokeWidth={LINE_W} />);
    // Bottom palace (rows 0–2, display rows 7–9)
    const bpY1 = PAD + 7 * CH, bpY2 = PAD + 9 * CH;
    lines.push(<line key="pal-bot-1" x1={tpX1} y1={bpY1} x2={tpX2} y2={bpY2} stroke={LINE_COLOR} strokeWidth={LINE_W} />);
    lines.push(<line key="pal-bot-2" x1={tpX2} y1={bpY1} x2={tpX1} y2={bpY2} stroke={LINE_COLOR} strokeWidth={LINE_W} />);

    // River geometry — rule: river spans 1 row-band when the row count is odd,
    // 2 row-bands when even. Xiangqi has 10 rows (even) → 2 bands tall, centered
    // on the middle gap (between display rows 4 and 5).
    const ROW_COUNT = 10;
    const riverBands = ROW_COUNT % 2 === 0 ? 2 : 1;
    const riverCenterY = PAD + 4.5 * CH; // middle gap in display space
    const riverHeight = riverBands * CH;
    const riverTopY = riverCenterY - riverHeight / 2;

    // Piece cells as absolute-positioned buttons
    // Orient so the human's pieces are at the bottom (flip 180° when human = Black).
    const flip = xiangqiHumanColorRef.current === 'black';
    const cells = [];
    for (let r = 0; r <= 9; r++) {
      for (let c = 0; c <= 8; c++) {
        const piece = xiangqiBoard[r][c];
        const isSelected = xiangqiSelected && xiangqiSelected.row === r && xiangqiSelected.col === c;
        const isLegalDest = legalDestSet.has(`${r}-${c}`);
        // Display: human-Red → row 9 at top (displayRow = 9 - r). Human-Black flips 180°.
        const displayRow = flip ? r : 9 - r;
        const displayCol = flip ? 8 - c : c;
        const cx = PAD + displayCol * CW;
        const cy = PAD + displayRow * CH;

        let cellClass = 'xq-intersection';
        if (isSelected) cellClass += ' xq-intersection--selected';
        if (isLegalDest) cellClass += ' xq-intersection--legal';
        cellClass += thinkingCellClass(r, c);

        cells.push(
          <div
            key={`${r}-${c}`}
            className={cellClass}
            role="button"
            tabIndex={gamePhase === 'playing' && !botThinking ? 0 : -1}
            aria-label={`Ô ${r + 1}-${c + 1}${piece ? `: ${XIANGQI_CHARS[piece] || piece}` : ''}`}
            style={{ left: cx - CW / 2, top: cy - CH / 2, width: CW, height: CH }}
            onClick={() => handleXiangqiClick(r, c)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleXiangqiClick(r, c); }}
          >
            {isLegalDest && !piece && <span className="xq-legal-dot" />}
            {piece && (
              <div className={`xiangqi-piece ${piece[0] === 'r' ? 'xiangqi-piece--red' : 'xiangqi-piece--black'}`}>
                {XIANGQI_CHARS[piece] || piece}
              </div>
            )}
          </div>,
        );
      }
    }

    return (
      <div className="xiangqi-board-wrap">
        <div
          className="xiangqi-board-svg"
          style={{ width: totalW, height: totalH, position: 'relative' }}
        >
          {/* SVG grid lines */}
          <svg
            width={totalW}
            height={totalH}
            style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
          >
            {/* Board background */}
            <rect x="0" y="0" width={totalW} height={totalH} fill="#e8d48a" />
            {/* Water gradient + animated ripple definitions */}
            <defs>
              <linearGradient id="xq-river-water" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#5fb3d9" />
                <stop offset="50%" stopColor="#2f8fc0" />
                <stop offset="100%" stopColor="#1f6f9e" />
              </linearGradient>
              <clipPath id="xq-river-clip">
                <rect x={PAD} y={riverTopY} width={8 * CW} height={riverHeight} />
              </clipPath>
            </defs>
            {/* River fill — spans 2 row-bands (even row count) with a water look */}
            <rect
              x={PAD} y={riverTopY}
              width={8 * CW} height={riverHeight}
              fill="url(#xq-river-water)" opacity="0.75"
            />
            {/* Animated ripple/wave lines inside the river — seamless infinite loop.
                Each wave tiles with period 2·CW; the path is drawn one period wider
                on both sides and translated by exactly one period so it never shows a seam. */}
            <g clipPath="url(#xq-river-clip)" opacity="0.5">
              {[0.3, 0.55, 0.8].map((frac, i) => {
                const wy = riverTopY + riverHeight * frac;
                const startX = PAD - 2 * CW;
                // Span board width + 2 periods (4·CW) of extra coverage.
                const segments = Math.ceil((8 * CW + 4 * CW) / CW);
                let d = `M ${startX} ${wy} q ${CW / 2} -6 ${CW} 0`;
                for (let k = 1; k < segments; k++) d += ` t ${CW} 0`;
                return (
                  <path key={`wave-${i}`} d={d} fill="none" stroke="#eaf6ff" strokeWidth="1.5">
                    <animateTransform
                      attributeName="transform"
                      type="translate"
                      from="0 0"
                      to={`${CW * 2} 0`}
                      dur={`${3 + i}s`}
                      repeatCount="indefinite"
                    />
                  </path>
                );
              })}
            </g>
            {/* River banks */}
            <line
              x1={PAD} y1={riverTopY} x2={PAD + 8 * CW} y2={riverTopY}
              stroke="#1d4e7a" strokeWidth="1.5" opacity="0.7"
            />
            <line
              x1={PAD} y1={riverTopY + riverHeight} x2={PAD + 8 * CW} y2={riverTopY + riverHeight}
              stroke="#1d4e7a" strokeWidth="1.5" opacity="0.7"
            />
            {lines}
            {/* River name */}
            <text
              x={PAD + 4 * CW} y={riverCenterY + 5}
              textAnchor="middle" fontSize="16" fill="#ffffff" fontWeight="700"
              letterSpacing="6"
              style={{ paintOrder: 'stroke', stroke: '#1d4e7a', strokeWidth: 3, strokeLinejoin: 'round' }}
            >
              SÔNG BẾN HẢI
            </text>
            {/* Check beams — from each checking piece to the king */}
            {checkLines && checkLines.king && checkLines.attackers?.map((a, i) => {
              const kx = PAD + (flip ? 8 - checkLines.king.col : checkLines.king.col) * CW;
              const ky = PAD + (flip ? checkLines.king.row : 9 - checkLines.king.row) * CH;
              const ax = PAD + (flip ? 8 - a.col : a.col) * CW;
              const ay = PAD + (flip ? a.row : 9 - a.row) * CH;
              return (
                <g key={`beam-${i}`}>
                  <line x1={ax} y1={ay} x2={kx} y2={ky} stroke="#ff4040" strokeWidth="4"
                    strokeLinecap="round" opacity="0.85" className="chess-check-beam-line" />
                  <circle cx={kx} cy={ky} r={CW * 0.42} fill="none" stroke="#ff4040"
                    strokeWidth="3" className="chess-check-beam-ring" />
                </g>
              );
            })}
            {/* Border */}
            <rect
              x={PAD} y={PAD}
              width={8 * CW} height={9 * CH}
              fill="none" stroke="#4a2f08" strokeWidth="2.5"
            />
          </svg>
          {/* Interactive cells */}
          {cells}
        </div>
      </div>
    );
  }

  function renderChessBoard() {
    const legalDestSet = new Set(
      chessLegal.map((mv) => `${mv.to.row}-${mv.to.col}`),
    );
    // Orient so the human's pieces are at the bottom (flip 180° when human = Black).
    const flip = chessHumanColorRef.current === 'black';
    const order = flip ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];
    const cells = [];
    for (const r of order) {
      for (const c of order) {
        const piece = chessState.board[r][c];
        const isLight = (r + c) % 2 === 0;
        const isSelected =
          chessSelected && chessSelected.row === r && chessSelected.col === c;
        const isLegalDest = legalDestSet.has(`${r}-${c}`);

        let cellClass = `chess-cell ${isLight ? 'chess-cell--light' : 'chess-cell--dark'}`;
        if (isSelected) cellClass += ' chess-cell--selected';
        if (isLegalDest) cellClass += ' chess-cell--legal';
        cellClass += thinkingCellClass(r, c);

        const isWhitePiece = piece && piece === piece.toUpperCase() && piece !== piece.toLowerCase();

        cells.push(
          <div
            key={`${r}-${c}`}
            className={cellClass}
            role="button"
            tabIndex={gamePhase === 'playing' && !botThinking ? 0 : -1}
            aria-label={`Ô ${String.fromCharCode(97 + c)}${8 - r}${piece ? `: ${CHESS_UNICODE[piece] || piece}` : ''}`}
            onClick={() => handleChessClick(r, c)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleChessClick(r, c); }}
          >
            {piece && (
              <span className={`chess-piece ${isWhitePiece ? 'chess-piece--white' : 'chess-piece--black'}`}>
                {CHESS_SOLID[piece] || piece}
              </span>
            )}
          </div>,
        );
      }
    }
    return (
      <div className="chess-board-wrap">
        <div className="chess-grid chess-grid--relative" role="grid" aria-label="Bàn cờ vua">
          {cells}
          {renderCheckBeams({
            cell: 52,
            cols: 8,
            rows: 8,
            toXY: (p) => ({
              x: order.indexOf(p.col) * 52 + 26,
              y: order.indexOf(p.row) * 52 + 26,
            }),
          })}
        </div>
      </div>
    );
  }

  function renderDongtayLayoutPicker() {
    const sideOptions = [
      { value: 'west', label: 'Phe Tây (♟ cờ vua)' },
      { value: 'east', label: 'Phe Đông (卒 cờ tướng)' },
      { value: 'random', label: 'Ngẫu nhiên' },
    ];
    return (
      <div className="dongtay-layout-picker">
        <p className="dongtay-layout-picker__label">Chọn phe của bạn:</p>
        <div className="dongtay-side-choice" role="radiogroup" aria-label="Chọn phe của bạn">
          {sideOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={dongtaySidePref === opt.value}
              className={`dongtay-side-btn${dongtaySidePref === opt.value ? ' is-selected' : ''}`}
              onClick={() => setDongtaySidePref(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <p className="dongtay-layout-picker__label">Chọn cách bố trí bàn cờ:</p>
        <button
          type="button"
          onClick={() => startDongtayGame('A')}
          aria-label="Bố trí theo cờ vua"
        >
          Theo Cờ Vua
        </button>
        <button
          type="button"
          onClick={() => startDongtayGame('B')}
          aria-label="Bố trí theo cờ tướng"
        >
          Theo Cờ Tướng
        </button>
        <button
          type="button"
          onClick={() => startDongtayGame(Math.random() < 0.5 ? 'A' : 'B')}
          aria-label="Bố trí ngẫu nhiên"
        >
          Ngẫu Nhiên
        </button>
      </div>
    );
  }

  function renderDongtayBoard() {
    if (!dongtayState) return null;
    const layout = dongtayState.layout || dongtayLayout;
    const boardContent = layout === 'B'
      ? renderDongtayXiangqiStyle()
      : renderDongtayChessStyle();

    return (
      <div className="dongtay-board-wrap" style={{ position: 'relative' }}>
        {boardContent}
        {dongtayPromoRow && (
          <div className="dongtay-promo-overlay" role="dialog" aria-label="Chọn phong cấp">
            <span style={{ color: '#fff', marginRight: 8 }}>Phong cấp:</span>
            {[
              { code: 'q', label: 'Hậu', symbol: '♛' },
              { code: 'r', label: 'Xe', symbol: '♜' },
              { code: 'n', label: 'Mã', symbol: '♞' },
              { code: 'b', label: 'Tượng', symbol: '♝' },
            ].map(({ code, label, symbol }) => (
              <button
                key={code}
                type="button"
                className="dongtay-promo-btn"
                aria-label={label}
                onClick={() => handleDongtayPromo(code)}
              >
                {symbol}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  function dongtayPieceEl(piece) {
    const isEastPiece = piece && 'VSTMXPC'.includes(piece);
    const isWestPiece = piece && 'krnbpq'.includes(piece);
    if (isEastPiece) {
      return (
        <div className="dongtay-piece dongtay-piece--east">{DONGTAY_EAST_CHARS[piece]}</div>
      );
    }
    if (isWestPiece) {
      return (
        <div className="dongtay-piece dongtay-piece--west">{CHESS_SOLID[piece] || piece}</div>
      );
    }
    return null;
  }

  // Layout A — "theo Cờ Vua": cell-based board, NO river, pieces sit inside cells.
  function renderDongtayChessStyle() {
    const legalDestSet = new Set(
      dongtayLegal.map((mv) => `${mv.to.row}-${mv.to.col}`),
    );

    // Orient so the human's pieces are at the bottom.
    const humanSide = dongtayHumanSideRef.current;
    const rowOrder = humanSide === 'east'
      ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
      : [9, 8, 7, 6, 5, 4, 3, 2, 1, 0];
    const colOrder = humanSide === 'east'
      ? [8, 7, 6, 5, 4, 3, 2, 1, 0]
      : [0, 1, 2, 3, 4, 5, 6, 7, 8];

    const rows = [];
    for (const r of rowOrder) {
      const rowCells = [];
      for (const c of colOrder) {
        const piece = dongtayState.board[r][c];
        const isLight = (r + c) % 2 === 0;
        const isSelected =
          dongtaySelected && dongtaySelected.row === r && dongtaySelected.col === c;
        const isLegalDest = legalDestSet.has(`${r}-${c}`);
        // East palace (Tướng + Sĩ): cols 3–5, rows 7–9 — vẽ khung cung điện
        const inEastPalace = c >= 3 && c <= 5 && r >= 7 && r <= 9;
        // Border edges of the palace: which sides of this cell are on the outer boundary
        // of the 3×3 palace rectangle. Used to draw a clear outer gold frame.
        const palaceTop = inEastPalace && r === 7;     // top row of palace (logical)
        const palaceBottom = inEastPalace && r === 9;  // bottom row
        const palaceLeft = inEastPalace && c === 3;    // left col
        const palaceRight = inEastPalace && c === 5;   // right col
        // When board is flipped (human plays East), top/bottom/left/right swap.
        const flipBoard = humanSide === 'east';
        const palaceEdgeTop = flipBoard ? palaceBottom : palaceTop;
        const palaceEdgeBottom = flipBoard ? palaceTop : palaceBottom;
        const palaceEdgeLeft = flipBoard ? palaceRight : palaceLeft;
        const palaceEdgeRight = flipBoard ? palaceLeft : palaceRight;

        let cellClass = 'dongtay-cell dongtay-cell--chess';
        cellClass += isLight ? ' dongtay-cell--light' : ' dongtay-cell--dark';
        if (inEastPalace) {
          cellClass += ' dongtay-cell--palace';
          // Palace "X": two diagonals cross at the centre E9 (c=4, r=8).
          //   main diagonal (↘): D10(r9,c3) → E9 → F8(r7,c5)
          //   anti diagonal (↗): F10(r9,c5) → E9 → D8(r7,c3)
          const onMainDiag = (r === 9 && c === 3) || (r === 8 && c === 4) || (r === 7 && c === 5);
          const onAntiDiag = (r === 9 && c === 5) || (r === 8 && c === 4) || (r === 7 && c === 3);
          // When the board is flipped 180° (human plays East) the on-screen
          // slope of each segment reverses, so swap main↔anti for non-centre cells.
          const flip = humanSide === 'east';
          if (onMainDiag) cellClass += flip ? ' dongtay-palace-diag-anti' : ' dongtay-palace-diag-main';
          if (onAntiDiag) cellClass += flip ? ' dongtay-palace-diag-main' : ' dongtay-palace-diag-anti';
          // Outer border edges
          if (palaceEdgeTop)    cellClass += ' dongtay-palace-border-top';
          if (palaceEdgeBottom) cellClass += ' dongtay-palace-border-bottom';
          if (palaceEdgeLeft)   cellClass += ' dongtay-palace-border-left';
          if (palaceEdgeRight)  cellClass += ' dongtay-palace-border-right';
        }
        if (isSelected) cellClass += ' dongtay-cell--selected';
        if (isLegalDest) cellClass += ' dongtay-cell--legal';
        cellClass += thinkingCellClass(r, c);

        rowCells.push(
          <div
            key={`${r}-${c}`}
            className={cellClass}
            role="button"
            tabIndex={gamePhase === 'playing' && !botThinking ? 0 : -1}
            aria-label={`Ô ${String.fromCharCode(65 + c)}${r + 1}${inEastPalace ? ' (cung điện)' : ''}${piece ? `: ${DONGTAY_EAST_CHARS[piece] || CHESS_UNICODE[piece] || piece}` : ''}`}
            onClick={() => handleDongtayClick(r, c)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleDongtayClick(r, c); }}
          >
            {dongtayPieceEl(piece)}
          </div>,
        );
      }
      rows.push(
        <div key={`row-${r}`} className="dongtay-row">{rowCells}</div>,
      );
    }

    return (
      <div className="dongtay-grid dongtay-grid--chess" role="grid" aria-label="Bàn cờ Đông Tây (bố trí Cờ Vua)">
        {rows}
      </div>
    );
  }

  // Layout B — "theo Cờ Tướng": intersection-based board WITH river; pieces sit
  // on the line intersections, not inside cells (như cờ tướng).
  function renderDongtayXiangqiStyle() {
    const legalDestSet = new Set(
      dongtayLegal.map((mv) => `${mv.to.row}-${mv.to.col}`),
    );

    const CW = 50;  // horizontal gap between intersections
    const CH = 46;  // vertical gap between intersections
    const PAD = 26; // edge → first intersection
    const COLS = 9; // 9 columns of intersections (indices 0–8)
    const ROWS = 10; // 10 rows of intersections (indices 0–9)
    const totalW = CW * (COLS - 1) + PAD * 2;
    const totalH = CH * (ROWS - 1) + PAD * 2;

    const LINE_COLOR = '#4a2f08';
    const LINE_W = 1.4;

    // River rule: 1 band if row count is odd, 2 if even. ROWS = 10 → 2 bands.
    const riverBands = ROWS % 2 === 0 ? 2 : 1;
    const riverCenterY = PAD + 4.5 * CH; // middle gap, between display rows 4 and 5
    const riverHeight = riverBands * CH;
    const riverTopY = riverCenterY - riverHeight / 2;

    const lines = [];
    // Vertical lines (break across the single central gap, bridge on outer cols)
    for (let c = 0; c < COLS; c++) {
      const x = PAD + c * CW;
      lines.push(<line key={`v-top-${c}`} x1={x} y1={PAD} x2={x} y2={PAD + 4 * CH} stroke={LINE_COLOR} strokeWidth={LINE_W} />);
      lines.push(<line key={`v-bot-${c}`} x1={x} y1={PAD + 5 * CH} x2={x} y2={PAD + 9 * CH} stroke={LINE_COLOR} strokeWidth={LINE_W} />);
      if (c === 0 || c === COLS - 1) {
        lines.push(<line key={`v-mid-${c}`} x1={x} y1={PAD + 4 * CH} x2={x} y2={PAD + 5 * CH} stroke={LINE_COLOR} strokeWidth={LINE_W} />);
      }
    }
    // Horizontal lines
    for (let r = 0; r < ROWS; r++) {
      const y = PAD + r * CH;
      lines.push(<line key={`h-${r}`} x1={PAD} y1={y} x2={PAD + (COLS - 1) * CW} y2={y} stroke={LINE_COLOR} strokeWidth={LINE_W} />);
    }

    // Orient so the human's pieces are at the bottom (flip 180° when human = East).
    const humanSide = dongtayHumanSideRef.current;
    const flip = humanSide === 'east';
    const dRow = (r) => (flip ? r : 9 - r);
    const dCol = (c) => (flip ? 8 - c : c);

    // East palace diagonals (khung Tướng & Sĩ) — logical rows 7–9 / cols 3–5.
    // Draw the "X" connecting the palace corners in display space.
    const palY1 = PAD + dRow(9) * CH;
    const palY2 = PAD + dRow(7) * CH;
    const palX1 = PAD + dCol(3) * CW;
    const palX2 = PAD + dCol(5) * CW;
    lines.push(<line key="dt-pal-1" x1={palX1} y1={palY1} x2={palX2} y2={palY2} stroke={LINE_COLOR} strokeWidth={LINE_W} />);
    lines.push(<line key="dt-pal-2" x1={palX2} y1={palY1} x2={palX1} y2={palY2} stroke={LINE_COLOR} strokeWidth={LINE_W} />);
    // East palace outer border — a gold rectangle around the full 3×3 area (cols 3–5, rows 7–9).
    // Half a cell outside the extreme intersections so the border frames the whole region.
    const palBorderX = Math.min(palX1, palX2) - CW / 2;
    const palBorderY = Math.min(palY1, palY2) - CH / 2;
    const palBorderW = Math.abs(palX2 - palX1) + CW;
    const palBorderH = Math.abs(palY2 - palY1) + CH;
    lines.push(
      <rect
        key="dt-pal-border"
        x={palBorderX}
        y={palBorderY}
        width={palBorderW}
        height={palBorderH}
        fill="rgba(255, 210, 63, 0.08)"
        stroke="#ffd23f"
        strokeWidth="2.5"
        rx="3"
        style={{ pointerEvents: 'none' }}
      />,
    );

    // Intersections (interactive), display row = 9 - r so East back rank (r=9) is on top
    const dots = [];
    for (let r = 0; r <= 9; r++) {
      for (let c = 0; c <= 8; c++) {
        const piece = dongtayState.board[r][c];
        const isSelected = dongtaySelected && dongtaySelected.row === r && dongtaySelected.col === c;
        const isLegalDest = legalDestSet.has(`${r}-${c}`);
        const cx = PAD + dCol(c) * CW;
        const cy = PAD + dRow(r) * CH;

        let cls = 'xq-intersection';
        if (isSelected) cls += ' xq-intersection--selected';
        if (isLegalDest) cls += ' xq-intersection--legal';
        cls += thinkingCellClass(r, c);

        dots.push(
          <div
            key={`${r}-${c}`}
            className={cls}
            role="button"
            tabIndex={gamePhase === 'playing' && !botThinking ? 0 : -1}
            aria-label={`Ô ${String.fromCharCode(65 + c)}${r + 1}${piece ? `: ${DONGTAY_EAST_CHARS[piece] || CHESS_UNICODE[piece] || piece}` : ''}`}
            style={{ left: cx - CW / 2, top: cy - CH / 2, width: CW, height: CH }}
            onClick={() => handleDongtayClick(r, c)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleDongtayClick(r, c); }}
          >
            {isLegalDest && !piece && <span className="xq-legal-dot" />}
            {dongtayPieceEl(piece)}
          </div>,
        );
      }
    }

    return (
      <div
        className="dongtay-grid dongtay-grid--xiangqi"
        role="grid"
        aria-label="Bàn cờ Đông Tây (bố trí Cờ Tướng)"
        style={{ width: totalW, height: totalH, position: 'relative' }}
      >
        <svg width={totalW} height={totalH} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <rect x="0" y="0" width={totalW} height={totalH} fill="#e8d48a" />
          <defs>
            <linearGradient id="dt-river-water" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#5fb3d9" />
              <stop offset="50%" stopColor="#2f8fc0" />
              <stop offset="100%" stopColor="#1f6f9e" />
            </linearGradient>
            <clipPath id="dt-river-clip">
              <rect x={PAD} y={riverTopY} width={(COLS - 1) * CW} height={riverHeight} />
            </clipPath>
          </defs>
          <rect x={PAD} y={riverTopY} width={(COLS - 1) * CW} height={riverHeight} fill="url(#dt-river-water)" opacity="0.75" />
          <g clipPath="url(#dt-river-clip)" opacity="0.5">
            {[0.3, 0.55, 0.8].map((frac, i) => {
              const wy = riverTopY + riverHeight * frac;
              const startX = PAD - 2 * CW;
              const segments = Math.ceil(((COLS - 1) * CW + 4 * CW) / CW);
              let d = `M ${startX} ${wy} q ${CW / 2} -6 ${CW} 0`;
              for (let k = 1; k < segments; k++) d += ` t ${CW} 0`;
              return (
                <path key={`wave-${i}`} d={d} fill="none" stroke="#eaf6ff" strokeWidth="1.5">
                  <animateTransform attributeName="transform" type="translate" from="0 0" to={`${CW * 2} 0`} dur={`${3 + i}s`} repeatCount="indefinite" />
                </path>
              );
            })}
          </g>
          <line x1={PAD} y1={riverTopY} x2={PAD + (COLS - 1) * CW} y2={riverTopY} stroke="#1d4e7a" strokeWidth="1.5" opacity="0.7" />
          <line x1={PAD} y1={riverTopY + riverHeight} x2={PAD + (COLS - 1) * CW} y2={riverTopY + riverHeight} stroke="#1d4e7a" strokeWidth="1.5" opacity="0.7" />
          {lines}
          <text
            x={PAD + 4 * CW} y={riverCenterY + 5}
            textAnchor="middle" fontSize="16" fill="#ffffff" fontWeight="700" letterSpacing="6"
            style={{ paintOrder: 'stroke', stroke: '#1d4e7a', strokeWidth: 3, strokeLinejoin: 'round' }}
          >
            SÔNG BẾN HẢI
          </text>
          <rect x={PAD} y={PAD} width={(COLS - 1) * CW} height={(ROWS - 1) * CH} fill="none" stroke="#4a2f08" strokeWidth="2.5" />
        </svg>
        {dots}
      </div>
    );
  }

  // ── 3D scene model ───────────────────────────────────────────────────────────
  // Build the normalised piece list + grid metadata + selection/legal sets for
  // the active game, plus the orientation flip and click dispatcher.
  const scene = useMemo(() => {
    if (tableType === 'caro') {
      const base = gomokuPieces(gomokuBoard);
      return { ...base, flip: false, selected: null, legalDests: [], onClick: handleGomokuClick };
    }
    if (isDarkVariant(tableType)) {
      if (!darkBoard) return null;
      const base = darkPieces(darkBoard, tableType, darkBoardLayout);
      // Red occupies the high rows → flip to bring the human's side near.
      // For Đông Tây Úp, East palace (rows 7–9, cols 3–5) is always the East general's home.
      const isDt = tableType === 'dongtay-up';
      return {
        ...base,
        flip: darkHumanColor === 'red',
        selected: darkSelected,
        legalDests: darkLegal.map((m) => m.to),
        onClick: handleDarkClick,
        palaces: isDt ? [{ r0: 7, r1: 9, c0: 3, c1: 5 }] : null,
      };
    }
    if (tableType === 'xiangqi') {
      const base = xiangqiPieces(xiangqiBoard);
      return {
        ...base,
        // Human's own pieces must sit on the near (bottom) side. Red occupies the
        // high rows (7–9) → flip; Black occupies the low rows (0–2) → no flip.
        flip: xiangqiHumanColor === 'red',
        selected: xiangqiSelected,
        legalDests: xiangqiLegal.map((m) => m.to),
        onClick: handleXiangqiClick,
      };
    }
    if (tableType === 'chess') {
      const base = chessPieces(chessState.board);
      return {
        ...base,
        // White occupies the high rows (6–7) → flip to bring it to the near side;
        // Black occupies the low rows (0–1) → no flip.
        flip: chessHumanColor === 'white',
        selected: chessSelected,
        legalDests: chessLegal.map((m) => m.to),
        onClick: handleChessClick,
      };
    }
    // dongtay
    if (!dongtayState) return null;
    const base = dongtayPieces(dongtayState.board, dongtayState.layout || dongtayLayout);
    // East palace = Tướng + Sĩ: logical rows 7–9, cols 3–5
    const dongtayPalaceRegions = [{ r0: 7, r1: 9, c0: 3, c1: 5 }];
    return {
      ...base,
      flip: dongtayHumanSide === 'east',
      selected: dongtaySelected,
      legalDests: dongtayLegal.map((m) => m.to),
      onClick: handleDongtayClick,
      palaces: dongtayPalaceRegions,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableType, gomokuBoard, xiangqiBoard, xiangqiSelected, xiangqiLegal, xiangqiHumanColor,
    chessState, chessSelected, chessLegal, chessHumanColor,
    dongtayState, dongtaySelected, dongtayLegal, dongtayHumanSide, dongtayLayout,
    darkBoard, darkSelected, darkLegal, darkHumanColor, darkBoardLayout]);

  const showScene = scene && gamePhase !== 'layout-select';

  // ── Main render ─────────────────────────────────────────────────────────────

  return (
    <div className="chess-panel-overlay chess-panel-overlay--full" role="dialog" aria-modal="true" aria-label={tableLabel}>
      {/* Full-screen 3D board */}
      {showScene && (
        <div className="chess-scene3d">
          <ChessScene3D
            pieces={scene.pieces}
            cols={scene.cols}
            rows={scene.rows}
            flip={scene.flip}
            boardStyle={scene.boardStyle}
            selected={scene.selected}
            legalDests={scene.legalDests}
            lastMove={lastMoveCells}
            animating={animating}
            checkLines={checkLines}
            onSquareClick={scene.onClick}
            palaces={scene.palaces || null}
          />
        </div>
      )}

      {coinFlip && (
        <div className="coin-flip-overlay" aria-live="polite">
          <div className={`coin-flip is-${coinFlip.result}${coinFlip.running ? ' is-spinning' : ' is-landed'}`}>
            <div className="coin-flip__coin">
              <span className="coin-flip__face coin-flip__face--front">BẠN</span>
              <span className="coin-flip__face coin-flip__face--back">BOT</span>
            </div>
            <p className="coin-flip__label">
              {coinFlip.running ? 'Tung đồng xu…' : (coinFlip.result === 'bot' ? '🤖 ' : '🧑 ') + coinFlip.label}
            </p>
          </div>
        </div>
      )}

      <section className={`chess-panel chess-panel--hud${hudExpanded ? ' is-expanded' : ' is-collapsed'}`}>
        <header className="chess-panel__header">
          <h2>{tableLabel}</h2>
          <div className="chess-panel__header-actions">
            <button
              className="chess-panel__settings-toggle"
              type="button"
              aria-label={hudExpanded ? 'Thu gọn cài đặt' : 'Mở cài đặt'}
              aria-expanded={hudExpanded}
              title={hudExpanded ? 'Thu gọn cài đặt' : 'Mở cài đặt'}
              onClick={() => setHudExpanded((v) => !v)}
            >
              {hudExpanded ? '▴' : '⚙'}
            </button>
            <button
              className="chess-panel__close"
              type="button"
              aria-label="Đóng"
              onClick={onClose}
            >
              ✕
            </button>
          </div>
        </header>

        {hudExpanded && (
        <div className="chess-panel__controls">
          <label htmlFor="chess-difficulty">Độ khó:</label>
          <select
            id="chess-difficulty"
            value={difficulty}
            disabled={gamePhase === 'playing'}
            onChange={(e) => setDifficulty(e.target.value)}
          >
            <option value="Dễ">Dễ</option>
            <option value="Trung bình">Trung bình</option>
            <option value="Khó">Khó</option>
          </select>
          <label htmlFor="chess-timelimit">Thời gian/nước:</label>
          <select
            id="chess-timelimit"
            value={timeLimit}
            disabled={gamePhase === 'playing'}
            onChange={(e) => {
              const v = Number(e.target.value);
              setTimeLimit(v);
              timeLimitRef.current = v;
            }}
            title="Giới hạn thời gian cho mỗi nước đi. Chạy song song với tổng thời gian. 0 = Tắt."
          >
            <option value={15}>15 giây</option>
            <option value={30}>30 giây</option>
            <option value={60}>60 giây</option>
            <option value={120}>120 giây</option>
            <option value={0}>Tắt</option>
          </select>
          <label htmlFor="chess-totaltime">Tổng thời gian:</label>
          <select
            id="chess-totaltime"
            value={totalTimeRef.current}
            disabled={gamePhase === 'playing'}
            onChange={(e) => {
              const v = Number(e.target.value);
              totalTimeRef.current = v;
              humanBankRef.current = v;
              botBankRef.current = v;
              setHumanBank(v);
              setBotBank(v);
            }}
            title="Tổng quỹ thời gian cho mỗi bên qua tất cả các nước. Hết quỹ (hoặc hết giờ một nước) là thua. 0 = Tắt. Bấm Ván mới để áp dụng."
          >
            <option value={0}>Tắt</option>
            <option value={300}>5 phút</option>
            <option value={600}>10 phút</option>
            <option value={900}>15 phút</option>
            <option value={1800}>30 phút</option>
          </select>
          <label className="chess-panel__think-toggle" title="Hiển thị các nước AI đang cân nhắc theo thời gian thực">
            <input
              type="checkbox"
              checked={showThinking}
              onChange={(e) => setShowThinking(e.target.checked)}
            />
            Xem AI suy nghĩ
          </label>
          <button type="button" onClick={startNewGame} disabled={botThinking}>
            Ván mới
          </button>
          <button
            type="button"
            disabled={gamePhase !== 'playing' || botThinking}
            onClick={handleResign}
          >
            Từ bỏ
          </button>
        </div>
        )}

        {gamePhase === 'playing' && timeLimit > 0 && (
          <p
            className={`chess-panel__clock${timeLeft <= 10 ? ' chess-panel__clock--warning' : ''}`}
            aria-live="polite"
          >
            ⏱ Nước này — {botThinking ? 'Bot' : 'Bạn'}: {timeLeft}s
            {timeLeft <= 10 && (
              <span className="chess-panel__clock-alert"> — Sắp hết giờ!</span>
            )}
          </p>
        )}

        {gamePhase === 'playing' && totalTimeRef.current > 0 && (
          <div className="chess-panel__banks" aria-live="polite">
            <span className={`chess-panel__bank${!botThinking ? ' is-active' : ''}${humanBank <= 30 ? ' is-low' : ''}`}>
              🧑 Bạn: {formatClock(humanBank)}
            </span>
            <span className={`chess-panel__bank${botThinking ? ' is-active' : ''}${botBank <= 30 ? ' is-low' : ''}`}>
              🤖 Bot: {formatClock(botBank)}
            </span>
          </div>
        )}

        <p className="chess-panel__status" aria-live="polite">
          {status}
        </p>

        {showScene && (
          <p className="chess-panel__hint">Kéo để xoay · lăn chuột để phóng to · Ctrl + lăn để đổi góc nhìn</p>
        )}

        {aiThinking && botThinking && (
          <p className="chess-panel__thinking" aria-live="polite">
            🤔 AI đang cân nhắc{aiThinking.total ? ` (${(aiThinking.index ?? 0) + 1}/${aiThinking.total})` : ''}
            {formatThinkingMove(aiThinking.candidate) && (
              <span className="chess-panel__thinking-move"> · thử {formatThinkingMove(aiThinking.candidate)}</span>
            )}
            {formatThinkingMove(aiThinking.best) && (
              <span className="chess-panel__thinking-best"> · tốt nhất {formatThinkingMove(aiThinking.best)}</span>
            )}
          </p>
        )}

        {tableType === 'dongtay' && gamePhase === 'layout-select' && renderDongtayLayoutPicker()}
        {isDarkVariant(tableType) && gamePhase === 'layout-select' && (
          <div className="dongtay-layout-picker">
            {tableType === 'dongtay-up' && (
              <>
                <p className="dongtay-layout-picker__label">Chọn cách bố trí bàn cờ:</p>
                <div className="dongtay-side-choice" role="radiogroup" aria-label="Cách bố trí bàn cờ">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={darkBoardLayout === 'A'}
                    className={`dongtay-side-btn${darkBoardLayout === 'A' ? ' is-selected' : ''}`}
                    onClick={() => setDarkBoardLayout('A')}
                  >
                    Theo Cờ Vua
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={darkBoardLayout === 'B'}
                    className={`dongtay-side-btn${darkBoardLayout === 'B' ? ' is-selected' : ''}`}
                    onClick={() => setDarkBoardLayout('B')}
                  >
                    Theo Cờ Tướng
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={false}
                    className="dongtay-side-btn"
                    onClick={() => setDarkBoardLayout(Math.random() < 0.5 ? 'A' : 'B')}
                  >
                    Ngẫu nhiên
                  </button>
                </div>
              </>
            )}
            <p className="dongtay-layout-picker__label">Chọn chế độ quân úp:</p>
            <button type="button" onClick={() => startDarkGame('correct', darkBoardLayout)} aria-label="Quân luôn đúng bên">
              Quân luôn đúng bên
            </button>
            <button type="button" onClick={() => startDarkGame('shuffle', darkBoardLayout)} aria-label="Quân lộn xộn">
              Quân lộn xộn
            </button>
          </div>
        )}
      </section>

      {/* Full-screen end-game effect (win / lose / draw). */}
      {(gamePhase === 'human-win' || gamePhase === 'bot-win' || gamePhase === 'draw') && (
        <div className={`chess-endgame chess-endgame--${gamePhase}`} role="dialog" aria-label="Kết thúc ván">
          {gamePhase === 'human-win' && (
            <div className="chess-confetti-layer" aria-hidden="true">
              {Array.from({ length: 80 }).map((_, i) => (
                <span
                  key={i}
                  className="chess-confetti"
                  style={{
                    left: `${(i * 97) % 100}%`,
                    animationDelay: `${(i % 12) * 0.1}s`,
                    animationDuration: `${2.4 + ((i * 7) % 10) * 0.16}s`,
                    background: ['#ff5a5a', '#ffd23f', '#42d392', '#4a90e2', '#c77dff', '#ff9f1c'][i % 6],
                  }}
                />
              ))}
            </div>
          )}

          {gamePhase === 'bot-win' ? (
            /* Dark-Souls style "YOU DIED" cinematic for a loss. */
            <div className="chess-died">
              <div className="chess-died__bar" aria-hidden="true" />
              <h2 className="chess-died__text">THUA CUỘC</h2>
              <p className="chess-died__sub">{status}</p>
              <div className="chess-died__actions">
                <button type="button" className="chess-died__btn" onClick={startNewGame}>Ván mới</button>
                <button type="button" className="chess-died__btn chess-died__btn--ghost" onClick={onClose}>Đóng</button>
              </div>
            </div>
          ) : (
            <div className="chess-endgame__card">
              <div className="chess-endgame__icon">
                {gamePhase === 'human-win' ? '🏆' : '🤝'}
              </div>
              <h2 className="chess-endgame__title">
                {gamePhase === 'human-win' ? 'Chiến thắng!' : 'Hòa cờ'}
              </h2>
              <p className="chess-endgame__sub">{status}</p>
              <div className="chess-endgame__actions">
                <button type="button" className="chess-endgame__btn chess-endgame__btn--primary" onClick={startNewGame}>
                  Ván mới
                </button>
                <button type="button" className="chess-endgame__btn" onClick={onClose}>
                  Đóng
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
