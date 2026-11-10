// Cờ Tướng Úp (dark xiangqi) — thin wrapper over the generic dark engine with
// the xiangqi ruleset.
import { createDarkEngine, activeType as _activeType } from './dark-engine.js';
import { xiangqiRuleset } from './dark-rulesets.js';

const engine = createDarkEngine(xiangqiRuleset);

export const createInitialState = engine.createInitialState;
export const getLegalMoves = engine.getLegalMoves;
export const applyMove = engine.applyMove;
export const isInCheck = engine.isInCheck;
export const isCheckmate = engine.isCheckmate;
export const checkWin = engine.checkWin;
export const getCheckers = engine.getCheckers;
export const evaluateBoard = engine.evaluateBoard;
export const sideOf = (cell) => (cell ? (cell.s === 'r' ? 'red' : 'black') : null);
export const activeType = _activeType;
