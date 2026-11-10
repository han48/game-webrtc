// Rulesets for the generic dark ("Úp") engine: xiangqi, chess, dongtay.
// Each supplies board size, formation, royal type, a per-type move generator and
// side-specific legality (self-check / flying-general / win / evaluation).

// ── Shared helpers ────────────────────────────────────────────────────────────
function inB(r, c, rows, cols) { return r >= 0 && r < rows && c >= 0 && c < cols; }

// ── XIANGQI (cờ tướng) ────────────────────────────────────────────────────────
const XQ_VALUES = { K: 10000, R: 900, C: 450, H: 400, E: 200, A: 200, P: 100 };

function xqInPalace(row, col, s) {
  if (col < 3 || col > 5) return false;
  return s === 'r' ? row >= 7 && row <= 9 : row >= 0 && row <= 2;
}
function xqCrossedRiver(row, s) { return s === 'r' ? row <= 4 : row >= 5; }

function xqRawMoves(board, row, col, t, s) {
  const moves = [];
  const own = (r, c) => board[r][c] && board[r][c].s === s;
  const inBounds = (r, c) => inB(r, c, 10, 9);
  if (t === 'K') {
    for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const nr = row + dr; const nc = col + dc;
      if (!xqInPalace(nr, nc, s) || own(nr, nc)) continue;
      moves.push({ from: { row, col }, to: { row: nr, col: nc } });
    }
  } else if (t === 'A') {
    for (const [dr, dc] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nr = row + dr; const nc = col + dc;
      if (!xqInPalace(nr, nc, s) || own(nr, nc)) continue;
      moves.push({ from: { row, col }, to: { row: nr, col: nc } });
    }
  } else if (t === 'E') {
    const diag = [[2, 2], [2, -2], [-2, 2], [-2, -2]];
    const legs = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
    for (let i = 0; i < 4; i += 1) {
      const [dr, dc] = diag[i]; const [lr, lc] = legs[i];
      const nr = row + dr; const nc = col + dc;
      if (!inBounds(nr, nc)) continue;
      if (s === 'r' && nr < 5) continue;
      if (s === 'b' && nr > 4) continue;
      if (board[row + lr][col + lc] || own(nr, nc)) continue;
      moves.push({ from: { row, col }, to: { row: nr, col: nc } });
    }
  } else if (t === 'H') {
    const steps = [
      { o: [-1, 0], d: [[-2, -1], [-2, 1]] }, { o: [1, 0], d: [[2, -1], [2, 1]] },
      { o: [0, -1], d: [[-1, -2], [1, -2]] }, { o: [0, 1], d: [[-1, 2], [1, 2]] },
    ];
    for (const { o, d } of steps) {
      const lr = row + o[0]; const lc = col + o[1];
      if (!inBounds(lr, lc) || board[lr][lc]) continue;
      for (const [dr, dc] of d) {
        const nr = row + dr; const nc = col + dc;
        if (!inBounds(nr, nc) || own(nr, nc)) continue;
        moves.push({ from: { row, col }, to: { row: nr, col: nc } });
      }
    }
  } else if (t === 'R') {
    for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      let nr = row + dr; let nc = col + dc;
      while (inBounds(nr, nc)) {
        if (board[nr][nc]) { if (!own(nr, nc)) moves.push({ from: { row, col }, to: { row: nr, col: nc } }); break; }
        moves.push({ from: { row, col }, to: { row: nr, col: nc } }); nr += dr; nc += dc;
      }
    }
  } else if (t === 'C') {
    for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      let nr = row + dr; let nc = col + dc; let screen = false;
      while (inBounds(nr, nc)) {
        if (!screen) { if (!board[nr][nc]) moves.push({ from: { row, col }, to: { row: nr, col: nc } }); else screen = true; }
        else if (board[nr][nc]) { if (!own(nr, nc)) moves.push({ from: { row, col }, to: { row: nr, col: nc } }); break; }
        nr += dr; nc += dc;
      }
    }
  } else if (t === 'P') {
    const fwd = s === 'r' ? -1 : 1;
    const nr = row + fwd;
    if (inBounds(nr, col) && !own(nr, col)) moves.push({ from: { row, col }, to: { row: nr, col } });
    if (xqCrossedRiver(row, s)) {
      for (const dc of [-1, 1]) {
        const nc = col + dc;
        if (inBounds(row, nc) && !own(row, nc)) moves.push({ from: { row, col }, to: { row, col: nc } });
      }
    }
  }
  return moves;
}

function xqActive(cell) { return cell.covered ? cell.nominal : cell.hidden; }

function xqFindGeneral(board, s) {
  const code = s === 'red' ? 'r' : 'b';
  for (let r = 0; r <= 9; r += 1) for (let c = 0; c <= 8; c += 1) {
    const cell = board[r][c];
    if (cell && cell.s === code && xqActive(cell) === 'K') return { row: r, col: c };
  }
  return null;
}
function xqFlying(board) {
  const r = xqFindGeneral(board, 'red'); const b = xqFindGeneral(board, 'black');
  if (!r || !b || r.col !== b.col) return false;
  const lo = Math.min(r.row, b.row); const hi = Math.max(r.row, b.row);
  for (let i = lo + 1; i < hi; i += 1) if (board[i][r.col]) return false;
  return true;
}
function xqIsInCheck(board, s, getRaw) {
  const king = xqFindGeneral(board, s);
  if (!king) return true;
  if (xqFlying(board)) return true;
  const oppCode = s === 'red' ? 'b' : 'r';
  for (let r = 0; r <= 9; r += 1) for (let c = 0; c <= 8; c += 1) {
    if (!board[r][c] || board[r][c].s !== oppCode) continue;
    for (const mv of getRaw(board, r, c)) if (mv.to.row === king.row && mv.to.col === king.col) return true;
  }
  return false;
}
function xqGetCheckers(board, s, getRaw) {
  const king = xqFindGeneral(board, s);
  if (!king || !xqIsInCheck(board, s, getRaw)) return null;
  const oppCode = s === 'red' ? 'b' : 'r';
  const attackers = [];
  for (let r = 0; r <= 9; r += 1) for (let c = 0; c <= 8; c += 1) {
    if (!board[r][c] || board[r][c].s !== oppCode) continue;
    if (getRaw(board, r, c).some((m) => m.to.row === king.row && m.to.col === king.col)) attackers.push({ row: r, col: c });
  }
  if (xqFlying(board)) {
    const og = xqFindGeneral(board, s === 'red' ? 'black' : 'red');
    if (og && !attackers.some((a) => a.row === og.row && a.col === og.col)) attackers.push(og);
  }
  return { king, attackers };
}
function xqCheckmate(board, s, getRaw, getLegal) {
  if (!xqIsInCheck(board, s, getRaw)) return false;
  return getLegal(board, s).length === 0;
}
function xqCheckWin(board, getRaw, getLegal) {
  if (!xqFindGeneral(board, 'red')) return 'black';
  if (!xqFindGeneral(board, 'black')) return 'red';
  if (xqCheckmate(board, 'red', getRaw, getLegal)) return 'black';
  if (xqCheckmate(board, 'black', getRaw, getLegal)) return 'red';
  return null;
}

function xqFormation(s) {
  const backRow = s === 'r' ? 9 : 0;
  const cannonRow = s === 'r' ? 7 : 2;
  const pawnRow = s === 'r' ? 6 : 3;
  const back = ['R', 'H', 'E', 'A', 'K', 'A', 'E', 'H', 'R'];
  const sq = [];
  for (let c = 0; c <= 8; c += 1) sq.push({ row: backRow, col: c, type: back[c] });
  sq.push({ row: cannonRow, col: 1, type: 'C' }, { row: cannonRow, col: 7, type: 'C' });
  for (const c of [0, 2, 4, 6, 8]) sq.push({ row: pawnRow, col: c, type: 'P' });
  return sq;
}

const COVERED_VALUE = 300;
function xqEval(board) {
  let score = 0;
  for (const row of board) for (const cell of row) {
    if (!cell) continue;
    const v = cell.covered ? COVERED_VALUE : (XQ_VALUES[cell.hidden] || 0);
    score += cell.s === 'r' ? v : -v;
  }
  return score;
}

export const xiangqiRuleset = {
  rows: 10, cols: 9, royal: 'K', firstSide: 'red', sides: ['r', 'b'],
  selfCheckForbidden: true,
  formation: xqFormation,
  rawMoves: xqRawMoves,
  isInCheck: xqIsInCheck,
  getCheckers: xqGetCheckers,
  checkWin: xqCheckWin,
  evaluateBoard: xqEval,
  sideName: (code) => (code === 'r' ? 'red' : 'black'),
};

// ── CHESS (cờ vua) ────────────────────────────────────────────────────────────
// Dark chess: 8×8; royal 'K'. Covered pieces move by nominal type; pawns here
// move like a simple xiangqi-less pawn (1 forward, diagonal capture, no double /
// en passant to keep the dark variant tractable). Promotion to Q on last rank.
const CH_VALUES = { K: 10000, Q: 950, R: 500, B: 330, N: 320, P: 100 };

function chRawMoves(board, row, col, t, s) {
  const moves = [];
  const own = (r, c) => board[r][c] && board[r][c].s === s;
  const inBounds = (r, c) => inB(r, c, 8, 8);
  const slide = (dirs) => {
    for (const [dr, dc] of dirs) {
      let nr = row + dr; let nc = col + dc;
      while (inBounds(nr, nc)) {
        if (board[nr][nc]) { if (!own(nr, nc)) moves.push({ from: { row, col }, to: { row: nr, col: nc } }); break; }
        moves.push({ from: { row, col }, to: { row: nr, col: nc } }); nr += dr; nc += dc;
      }
    }
  };
  if (t === 'K') {
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nr = row + dr; const nc = col + dc;
      if (inBounds(nr, nc) && !own(nr, nc)) moves.push({ from: { row, col }, to: { row: nr, col: nc } });
    }
  } else if (t === 'Q') { slide([[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]); }
  else if (t === 'R') { slide([[1, 0], [-1, 0], [0, 1], [0, -1]]); }
  else if (t === 'B') { slide([[1, 1], [1, -1], [-1, 1], [-1, -1]]); }
  else if (t === 'N') {
    for (const [dr, dc] of [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]]) {
      const nr = row + dr; const nc = col + dc;
      if (inBounds(nr, nc) && !own(nr, nc)) moves.push({ from: { row, col }, to: { row: nr, col: nc } });
    }
  } else if (t === 'P') {
    // White ('r' side, bottom rows) moves up (row-1); Black ('b', top) moves down.
    const fwd = s === 'r' ? -1 : 1;
    const startRow = s === 'r' ? 6 : 1;
    const nr = row + fwd;
    const promoRow = s === 'r' ? 0 : 7;
    if (inBounds(nr, col) && !board[nr][col]) {
      moves.push({ from: { row, col }, to: { row: nr, col }, promo: nr === promoRow ? 'Q' : undefined });
      // Double push from starting row (standard chess rule)
      if (row === startRow && inBounds(nr + fwd, col) && !board[nr + fwd][col]) {
        moves.push({ from: { row, col }, to: { row: nr + fwd, col } });
      }
    }
    for (const dc of [-1, 1]) {
      const nc = col + dc;
      if (inBounds(nr, nc) && board[nr][nc] && !own(nr, nc)) {
        moves.push({ from: { row, col }, to: { row: nr, col: nc }, promo: nr === promoRow ? 'Q' : undefined });
      }
    }
  }
  return moves;
}

function chActive(cell) { return cell.covered ? cell.nominal : cell.hidden; }
function chFindKing(board, s) {
  const code = s === 'red' ? 'r' : 'b';
  for (let r = 0; r < 8; r += 1) for (let c = 0; c < 8; c += 1) {
    const cell = board[r][c];
    if (cell && cell.s === code && chActive(cell) === 'K') return { row: r, col: c };
  }
  return null;
}
function chIsInCheck(board, s, getRaw) {
  const king = chFindKing(board, s);
  if (!king) return true;
  const oppCode = s === 'red' ? 'b' : 'r';
  for (let r = 0; r < 8; r += 1) for (let c = 0; c < 8; c += 1) {
    if (!board[r][c] || board[r][c].s !== oppCode) continue;
    for (const mv of getRaw(board, r, c)) if (mv.to.row === king.row && mv.to.col === king.col) return true;
  }
  return false;
}
function chGetCheckers(board, s, getRaw) {
  const king = chFindKing(board, s);
  if (!king || !chIsInCheck(board, s, getRaw)) return null;
  const oppCode = s === 'red' ? 'b' : 'r';
  const attackers = [];
  for (let r = 0; r < 8; r += 1) for (let c = 0; c < 8; c += 1) {
    if (!board[r][c] || board[r][c].s !== oppCode) continue;
    if (getRaw(board, r, c).some((m) => m.to.row === king.row && m.to.col === king.col)) attackers.push({ row: r, col: c });
  }
  return { king, attackers };
}
function chCheckmate(board, s, getRaw, getLegal) {
  if (!chIsInCheck(board, s, getRaw)) return false;
  return getLegal(board, s).length === 0;
}
function chCheckWin(board, getRaw, getLegal) {
  if (!chFindKing(board, 'red')) return 'black';
  if (!chFindKing(board, 'black')) return 'red';
  if (chCheckmate(board, 'red', getRaw, getLegal)) return 'black';
  if (chCheckmate(board, 'black', getRaw, getLegal)) return 'red';
  return null;
}
function chFormation(s) {
  // 'r' = White on rows 6–7 (bottom); 'b' = Black on rows 0–1 (top).
  const back = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];
  const backRow = s === 'r' ? 7 : 0;
  const pawnRow = s === 'r' ? 6 : 1;
  const sq = [];
  for (let c = 0; c < 8; c += 1) sq.push({ row: backRow, col: c, type: back[c] });
  for (let c = 0; c < 8; c += 1) sq.push({ row: pawnRow, col: c, type: 'P' });
  return sq;
}
function chPromote(cell, to, promo) {
  if (!cell) return;
  // On reveal/move, a pawn reaching the last rank becomes a queen.
  if (chActive(cell) === 'P' && promo === 'Q') { cell.hidden = 'Q'; cell.nominal = 'Q'; }
}
function chEval(board) {
  let score = 0;
  for (const row of board) for (const cell of row) {
    if (!cell) continue;
    const v = cell.covered ? 280 : (CH_VALUES[cell.hidden] || 0);
    score += cell.s === 'r' ? v : -v;
  }
  return score;
}

export const chessRuleset = {
  rows: 8, cols: 8, royal: 'K', firstSide: 'red', sides: ['r', 'b'],
  selfCheckForbidden: true,
  formation: chFormation,
  rawMoves: chRawMoves,
  isInCheck: chIsInCheck,
  getCheckers: chGetCheckers,
  checkWin: chCheckWin,
  evaluateBoard: chEval,
  promote: chPromote,
  sideName: (code) => (code === 'r' ? 'red' : 'black'),
};



// ── ĐÔNG TÂY (east–west) ──────────────────────────────────────────────────────
// 10×9. East side ('r') uses xiangqi-style pieces {V,S,T,M,X,P,C}; West side ('b')
// uses chess-style pieces {k,r,n,b,p,q}. Each army has its own royal: V and k.
// Covered pieces move by nominal type. River between rows 4 and 5.
const DT_EAST_VALUES = { V: 10000, X: 900, P: 450, M: 400, T: 200, S: 200, C: 100 };
const DT_WEST_VALUES = { k: 10000, r: 700, q: 950, n: 350, b: 300, p: 100 };

function dtInEastPalace(r, c) { return c >= 3 && c <= 5 && r >= 7 && r <= 9; }

function dtRawMoves(board, row, col, t, s) {
  const moves = [];
  const own = (r, c) => board[r][c] && board[r][c].s === s;
  const inBounds = (r, c) => inB(r, c, 10, 9);
  const push = (nr, nc, promo) => moves.push({ from: { row, col }, to: { row: nr, col: nc }, promo });

  // East (xiangqi-style)
  if (t === 'V') {
    for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const nr = row + dr; const nc = col + dc;
      if (dtInEastPalace(nr, nc) && !own(nr, nc)) push(nr, nc);
    }
  } else if (t === 'S') {
    for (const [dr, dc] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nr = row + dr; const nc = col + dc;
      if (dtInEastPalace(nr, nc) && !own(nr, nc)) push(nr, nc);
    }
  } else if (t === 'T') {
    const diag = [[2, 2], [2, -2], [-2, 2], [-2, -2]];
    const legs = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
    for (let i = 0; i < 4; i += 1) {
      const [dr, dc] = diag[i]; const [lr, lc] = legs[i];
      const nr = row + dr; const nc = col + dc;
      if (!inBounds(nr, nc) || nr < 5) continue;
      if (board[row + lr][col + lc] || own(nr, nc)) continue;
      push(nr, nc);
    }
  } else if (t === 'M') {
    const steps = [
      { o: [-1, 0], d: [[-2, -1], [-2, 1]] }, { o: [1, 0], d: [[2, -1], [2, 1]] },
      { o: [0, -1], d: [[-1, -2], [1, -2]] }, { o: [0, 1], d: [[-1, 2], [1, 2]] },
    ];
    for (const { o, d } of steps) {
      const lr = row + o[0]; const lc = col + o[1];
      if (!inBounds(lr, lc) || board[lr][lc]) continue;
      for (const [dr, dc] of d) {
        const nr = row + dr; const nc = col + dc;
        if (inBounds(nr, nc) && !own(nr, nc)) push(nr, nc);
      }
    }
  } else if (t === 'X' || t === 'r') { // chariot / rook — same geometry
    for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      let nr = row + dr; let nc = col + dc;
      while (inBounds(nr, nc)) {
        if (board[nr][nc]) { if (!own(nr, nc)) push(nr, nc); break; }
        push(nr, nc); nr += dr; nc += dc;
      }
    }
  } else if (t === 'P') { // East cannon (Pháo)
    for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      let nr = row + dr; let nc = col + dc; let screen = false;
      while (inBounds(nr, nc)) {
        if (!screen) { if (!board[nr][nc]) push(nr, nc); else screen = true; }
        else if (board[nr][nc]) { if (!own(nr, nc)) push(nr, nc); break; }
        nr += dr; nc += dc;
      }
    }
  } else if (t === 'C') { // East chốt
    const nr = row - 1;
    if (inBounds(nr, col) && !own(nr, col)) push(nr, col);
    if (row <= 4) for (const dc of [-1, 1]) { const nc = col + dc; if (inBounds(row, nc) && !own(row, nc)) push(row, nc); }
  // West (chess-style)
  } else if (t === 'k') {
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nr = row + dr; const nc = col + dc;
      if (inBounds(nr, nc) && !own(nr, nc)) push(nr, nc);
    }
  } else if (t === 'q' || t === 'b') {
    const dirs = t === 'q'
      ? [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]
      : [[1, 1], [1, -1], [-1, 1], [-1, -1]];
    for (const [dr, dc] of dirs) {
      let nr = row + dr; let nc = col + dc;
      while (inBounds(nr, nc)) {
        if (board[nr][nc]) { if (!own(nr, nc)) push(nr, nc); break; }
        push(nr, nc); nr += dr; nc += dc;
      }
    }
  } else if (t === 'n') {
    for (const [dr, dc] of [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]]) {
      const nr = row + dr; const nc = col + dc;
      if (inBounds(nr, nc) && !own(nr, nc)) push(nr, nc);
    }
  } else if (t === 'p') { // West tốt — moves toward increasing row (row 9), promotes to q
    const nr = row + 1;
    if (inBounds(nr, col) && !board[nr][col]) {
      push(nr, col, nr === 9 ? 'q' : undefined);
      // Double push from starting row 1 (standard chess rule)
      if (row === 1 && inBounds(nr + 1, col) && !board[nr + 1][col]) {
        push(nr + 1, col);
      }
    }
    for (const dc of [-1, 1]) {
      const nc = col + dc;
      if (inBounds(nr, nc) && board[nr][nc] && !own(nr, nc)) push(nr, nc, nr === 9 ? 'q' : undefined);
    }
  }
  return moves;
}

function dtActive(cell) { return cell.covered ? cell.nominal : cell.hidden; }
function dtFind(board, s) {
  // s is 'red'(=east,'r') or 'black'(=west,'b'); royal is V / k respectively.
  const code = s === 'red' ? 'r' : 'b';
  const royal = code === 'r' ? 'V' : 'k';
  for (let r = 0; r <= 9; r += 1) for (let c = 0; c <= 8; c += 1) {
    const cell = board[r][c];
    if (cell && cell.s === code && dtActive(cell) === royal) return { row: r, col: c };
  }
  return null;
}
function dtFlying(board) {
  // Mặt tướng: East V and West k on the same open file.
  const v = dtFind(board, 'red'); const k = dtFind(board, 'black');
  if (!v || !k || v.col !== k.col) return false;
  const lo = Math.min(v.row, k.row); const hi = Math.max(v.row, k.row);
  for (let i = lo + 1; i < hi; i += 1) if (board[i][v.col]) return false;
  return true;
}
function dtIsInCheck(board, s, getRaw) {
  const royalPos = dtFind(board, s);
  if (!royalPos) return true;
  if (dtFlying(board)) return true;
  const oppCode = s === 'red' ? 'b' : 'r';
  for (let r = 0; r <= 9; r += 1) for (let c = 0; c <= 8; c += 1) {
    if (!board[r][c] || board[r][c].s !== oppCode) continue;
    for (const mv of getRaw(board, r, c)) if (mv.to.row === royalPos.row && mv.to.col === royalPos.col) return true;
  }
  return false;
}
function dtGetCheckers(board, s, getRaw) {
  const royalPos = dtFind(board, s);
  if (!royalPos || !dtIsInCheck(board, s, getRaw)) return null;
  const oppCode = s === 'red' ? 'b' : 'r';
  const attackers = [];
  for (let r = 0; r <= 9; r += 1) for (let c = 0; c <= 8; c += 1) {
    if (!board[r][c] || board[r][c].s !== oppCode) continue;
    if (getRaw(board, r, c).some((m) => m.to.row === royalPos.row && m.to.col === royalPos.col)) attackers.push({ row: r, col: c });
  }
  if (dtFlying(board)) {
    const og = dtFind(board, s === 'red' ? 'black' : 'red');
    if (og && !attackers.some((a) => a.row === og.row && a.col === og.col)) attackers.push(og);
  }
  return { king: royalPos, attackers };
}
function dtCheckmate(board, s, getRaw, getLegal) {
  if (!dtIsInCheck(board, s, getRaw)) return false;
  return getLegal(board, s).length === 0;
}
function dtCheckWin(board, getRaw, getLegal) {
  if (!dtFind(board, 'red')) return 'black';
  if (!dtFind(board, 'black')) return 'red';
  if (dtCheckmate(board, 'red', getRaw, getLegal)) return 'black';
  if (dtCheckmate(board, 'black', getRaw, getLegal)) return 'red';
  return null;
}
function dtFormation(s) {
  // East ('r', phe Tướng) uses the xiangqi formation; West ('b', phe Vua) uses the
  // chess formation — mirrored onto the shared 10×9 board, exactly like the
  // non-dark Đông Tây setup. Both armies total 16 pieces so the covered-piece
  // counts stay balanced.
  if (s === 'r') {
    // Xiangqi-style (cờ tướng): 9 back-rank + 2 cannons + 5 chốt = 16.
    const back = ['X', 'M', 'T', 'S', 'V', 'S', 'T', 'M', 'X'];
    const sq = [];
    for (let c = 0; c <= 8; c += 1) sq.push({ row: 9, col: c, type: back[c] });
    sq.push({ row: 7, col: 1, type: 'P' }, { row: 7, col: 7, type: 'P' });
    for (const c of [0, 2, 4, 6, 8]) sq.push({ row: 6, col: c, type: 'C' });
    return sq;
  }
  // Chess-style (cờ vua), adapted to 9 columns: 9 tốt on row 1 + a 7-piece back
  // rank on row 0 (cols 1 & 7 empty) = 16, matching createInitialState in dongtay.js.
  const back = ['r', null, 'n', 'q', 'k', 'b', 'n', null, 'r'];
  const sq = [];
  for (let c = 0; c <= 8; c += 1) {
    if (back[c]) sq.push({ row: 0, col: c, type: back[c] });
  }
  for (let c = 0; c <= 8; c += 1) sq.push({ row: 1, col: c, type: 'p' });
  return sq;
}
function dtEval(board) {
  let score = 0;
  for (const row of board) for (const cell of row) {
    if (!cell) continue;
    let v;
    if (cell.covered) v = 300;
    else v = (cell.s === 'r' ? DT_EAST_VALUES[cell.hidden] : DT_WEST_VALUES[cell.hidden]) || 0;
    score += cell.s === 'r' ? v : -v;
  }
  return score;
}
function dtPromote(cell, to, promo) {
  if (cell && dtActive(cell) === 'p' && promo === 'q') { cell.hidden = 'q'; cell.nominal = 'q'; }
}

export const dongtayRuleset = {
  rows: 10, cols: 9, firstSide: 'red', sides: ['r', 'b'],
  royalOf: (s) => (s === 'r' ? 'V' : 'k'),
  selfCheckForbidden: true,
  formation: dtFormation,
  rawMoves: dtRawMoves,
  isInCheck: dtIsInCheck,
  getCheckers: dtGetCheckers,
  checkWin: dtCheckWin,
  evaluateBoard: dtEval,
  promote: dtPromote,
  sideName: (code) => (code === 'r' ? 'red' : 'black'),
};
