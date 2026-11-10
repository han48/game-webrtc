// Generic "Úp" (dark / face-down) engine for board games.
//
// A dark variant: every piece except the royal piece (General/King) starts
// COVERED. A covered piece moves using its square's "nominal" movement type and
// is REVEALED to its true hidden identity the instant it first moves; afterward
// it moves by that true type. Identities are shuffled within each side.
//
// This module is rule-agnostic: it is driven by a `ruleset` describing a base
// game (xiangqi / chess / dongtay). The ruleset supplies board size, the starting
// formation (squares + nominal types + sides), the royal type, a per-type move
// generator, and side-specific legality (self-check / flying-general / win).
//
// Square model: null | { s:SIDE, nominal:TYPE, hidden:TYPE, covered:bool }
//
// Two modes:
//   'correct' — covered pieces keep their square's standard nominal type
//   'shuffle' — the nominal movement type of each covered square is randomised

function shuffled(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor((rng ? rng() : Math.random()) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function activeType(cell) {
  if (!cell) return null;
  return cell.covered ? cell.nominal : cell.hidden;
}

export function createDarkEngine(ruleset) {
  const { rows, cols, firstSide, sides, formation, rawMoves, isInCheck, checkWin } = ruleset;
  // Royal type can be a single value or per-side (dongtay: East 'V', West 'k').
  const royalOf = (s) => (ruleset.royalOf ? ruleset.royalOf(s) : ruleset.royal);

  function createInitialState(mode = 'correct', rng = Math.random) {
    const board = Array.from({ length: rows }, () => new Array(cols).fill(null));
    for (const s of sides) {
      const royal = royalOf(s);
      const squares = formation(s); // [{row,col,type}]
      const nonRoyal = squares.filter((q) => q.type !== royal);
      // Hidden true identities are a shuffle of the side's army (minus the royal).
      const hiddenPool = shuffled(nonRoyal.map((q) => q.type), rng);
      // 'shuffle' mode additionally scrambles WHICH formation square each covered
      // piece occupies; 'correct' keeps the standard formation. In BOTH modes a
      // covered piece ALWAYS moves by its square's standard (nominal) type — the
      // position determines movement until the piece is revealed.
      const placements = mode === 'shuffle'
        ? shuffled(nonRoyal.map((q) => ({ row: q.row, col: q.col })), rng)
        : nonRoyal.map((q) => ({ row: q.row, col: q.col }));
      const nominalByCoord = new Map(nonRoyal.map((q) => [`${q.row}-${q.col}`, q.type]));

      // Royals first (always revealed, fixed).
      for (const q of squares) {
        if (q.type === royal) board[q.row][q.col] = { s, nominal: royal, hidden: royal, covered: false };
      }
      // Place covered pieces: position = placements[i], hidden = hiddenPool[i],
      // nominal = the standard type of the square it actually lands on.
      for (let i = 0; i < placements.length; i += 1) {
        const { row, col } = placements[i];
        board[row][col] = {
          s,
          nominal: nominalByCoord.get(`${row}-${col}`),
          hidden: hiddenPool[i],
          covered: true,
        };
      }
    }
    return { board, turn: firstSide, mode };
  }

  function sideOf(cell) { return cell ? cell.s : null; }

  function getRawMoves(board, row, col) {
    const cell = board[row][col];
    if (!cell) return [];
    return rawMoves(board, row, col, activeType(cell), cell.s);
  }

  // Reveal a covered piece on its first move.
  function applyMove(board, from, to, promo) {
    const next = board.map((r) => r.map((c) => (c ? { ...c } : null)));
    const moving = next[from.row][from.col];
    if (moving && moving.covered) moving.covered = false;
    // Optional promotion hook (chess pawn → queen on last rank), handled by ruleset.
    if (ruleset.promote) ruleset.promote(moving, to, promo);
    next[to.row][to.col] = moving;
    next[from.row][from.col] = null;
    return next;
  }

  // Side identifiers: the public API uses 'red'/'black'; board cells store the
  // short code 'r'/'b'. Convert where needed.
  const toCode = (s) => (s === 'red' ? 'r' : s === 'black' ? 'b' : s);

  function getLegalMoves(board, s) {
    const code = toCode(s);
    const legal = [];
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        if (!board[r][c] || board[r][c].s !== code) continue;
        for (const mv of getRawMoves(board, r, c)) {
          const nb = applyMove(board, mv.from, mv.to, mv.promo);
          // Side that just moved must not be in check (where the ruleset enforces it).
          if (!ruleset.selfCheckForbidden || !isInCheck(nb, s, getRawMoves)) legal.push(mv);
        }
      }
    }
    return legal;
  }

  function isCheckmate(board, s) {
    if (!isInCheck(board, s, getRawMoves)) return false;
    return getLegalMoves(board, s).length === 0;
  }

  function getCheckers(board, s) {
    if (!ruleset.getCheckers) return null;
    return ruleset.getCheckers(board, s, getRawMoves);
  }

  return {
    createInitialState,
    sideOf,
    activeType,
    getRawMoves,
    applyMove,
    getLegalMoves,
    isInCheck: (board, s) => isInCheck(board, s, getRawMoves),
    isCheckmate,
    checkWin: (board) => checkWin(board, getRawMoves, getLegalMoves),
    getCheckers,
    evaluateBoard: ruleset.evaluateBoard,
  };
}
