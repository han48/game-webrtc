// Xiangqi (Cờ Tướng) game engine — pure JS, no DOM
// Board: 10 rows × 9 cols. Row 0 = black back rank (top), Row 9 = red back rank (bottom).
// Piece codes: 'rK','rA','rE','rH','rR','rC','rP' (red), 'bK','bA','bE','bH','bR','bC','bP' (black)

export function createInitialBoard() {
  const board = Array.from({ length: 10 }, () => new Array(9).fill(null));
  // Black back rank (row 0)
  board[0] = ['bR', 'bH', 'bE', 'bA', 'bK', 'bA', 'bE', 'bH', 'bR'];
  // Black cannons (row 2)
  board[2][1] = 'bC';
  board[2][7] = 'bC';
  // Black pawns (row 3)
  board[3][0] = 'bP';
  board[3][2] = 'bP';
  board[3][4] = 'bP';
  board[3][6] = 'bP';
  board[3][8] = 'bP';
  // Red pawns (row 6)
  board[6][0] = 'rP';
  board[6][2] = 'rP';
  board[6][4] = 'rP';
  board[6][6] = 'rP';
  board[6][8] = 'rP';
  // Red cannons (row 7)
  board[7][1] = 'rC';
  board[7][7] = 'rC';
  // Red back rank (row 9)
  board[9] = ['rR', 'rH', 'rE', 'rA', 'rK', 'rA', 'rE', 'rH', 'rR'];
  return board;
}

function side(piece) {
  if (!piece) return null;
  return piece[0] === 'r' ? 'red' : 'black';
}

function type(piece) {
  if (!piece) return null;
  return piece[1];
}

function inBounds(row, col) {
  return row >= 0 && row <= 9 && col >= 0 && col <= 8;
}

// Palace bounds: red rows 7-9, black rows 0-2, cols 3-5
function inPalace(row, col, s) {
  if (col < 3 || col > 5) return false;
  if (s === 'red') return row >= 7 && row <= 9;
  return row >= 0 && row <= 2;
}

// Check if a pawn has crossed the river
function crossedRiver(row, s) {
  if (s === 'red') return row <= 4;   // red moves up (decreasing row)
  return row >= 5;                     // black moves down (increasing row)
}

function getRawMoves(board, row, col) {
  const piece = board[row][col];
  if (!piece) return [];
  const s = side(piece);
  const t = type(piece);
  const moves = [];

  if (t === 'K') {
    // General: 1-step ortho, confined to palace
    const dirs = [[0,1],[0,-1],[1,0],[-1,0]];
    for (const [dr, dc] of dirs) {
      const nr = row + dr, nc = col + dc;
      if (!inPalace(nr, nc, s)) continue;
      if (board[nr][nc] && side(board[nr][nc]) === s) continue;
      moves.push({ from: { row, col }, to: { row: nr, col: nc } });
    }
  } else if (t === 'A') {
    // Advisor: 1-step diagonal, confined to palace
    const dirs = [[1,1],[1,-1],[-1,1],[-1,-1]];
    for (const [dr, dc] of dirs) {
      const nr = row + dr, nc = col + dc;
      if (!inPalace(nr, nc, s)) continue;
      if (board[nr][nc] && side(board[nr][nc]) === s) continue;
      moves.push({ from: { row, col }, to: { row: nr, col: nc } });
    }
  } else if (t === 'E') {
    // Elephant: 2-step diagonal, no river crossing, leg must be free
    const dirs = [[2,2],[2,-2],[-2,2],[-2,-2]];
    const legs = [[1,1],[1,-1],[-1,1],[-1,-1]];
    for (let i = 0; i < 4; i++) {
      const [dr, dc] = dirs[i];
      const [lr, lc] = legs[i];
      const nr = row + dr, nc = col + dc;
      if (!inBounds(nr, nc)) continue;
      // No crossing river
      if (s === 'red' && nr < 5) continue;
      if (s === 'black' && nr > 4) continue;
      // Leg blocking
      if (board[row + lr][col + lc]) continue;
      if (board[nr][nc] && side(board[nr][nc]) === s) continue;
      moves.push({ from: { row, col }, to: { row: nr, col: nc } });
    }
  } else if (t === 'H') {
    // Horse: 1 ortho + 1 diag, leg blocking
    const steps = [
      { ortho: [-1, 0], diags: [[-2, -1], [-2, 1]] },
      { ortho: [1, 0],  diags: [[2, -1],  [2, 1]]  },
      { ortho: [0, -1], diags: [[-1, -2], [1, -2]] },
      { ortho: [0, 1],  diags: [[-1, 2],  [1, 2]]  },
    ];
    for (const { ortho, diags } of steps) {
      const lr = row + ortho[0], lc = col + ortho[1];
      if (!inBounds(lr, lc)) continue;
      if (board[lr][lc]) continue; // leg blocked
      for (const [dr, dc] of diags) {
        const nr = row + dr, nc = col + dc;
        if (!inBounds(nr, nc)) continue;
        if (board[nr][nc] && side(board[nr][nc]) === s) continue;
        moves.push({ from: { row, col }, to: { row: nr, col: nc } });
      }
    }
  } else if (t === 'R') {
    // Rook: any ortho, blocked by pieces
    const dirs = [[0,1],[0,-1],[1,0],[-1,0]];
    for (const [dr, dc] of dirs) {
      let nr = row + dr, nc = col + dc;
      while (inBounds(nr, nc)) {
        if (board[nr][nc]) {
          if (side(board[nr][nc]) !== s) moves.push({ from: { row, col }, to: { row: nr, col: nc } });
          break;
        }
        moves.push({ from: { row, col }, to: { row: nr, col: nc } });
        nr += dr; nc += dc;
      }
    }
  } else if (t === 'C') {
    // Cannon: moves like rook (no capture), captures by jumping exactly one piece
    const dirs = [[0,1],[0,-1],[1,0],[-1,0]];
    for (const [dr, dc] of dirs) {
      let nr = row + dr, nc = col + dc;
      let screen = false;
      while (inBounds(nr, nc)) {
        if (!screen) {
          if (!board[nr][nc]) {
            moves.push({ from: { row, col }, to: { row: nr, col: nc } });
          } else {
            screen = true;
          }
        } else {
          if (board[nr][nc]) {
            if (side(board[nr][nc]) !== s) moves.push({ from: { row, col }, to: { row: nr, col: nc } });
            break;
          }
        }
        nr += dr; nc += dc;
      }
    }
  } else if (t === 'P') {
    // Pawn: forward + sideways after river
    const fwd = s === 'red' ? -1 : 1;
    const nr = row + fwd, nc = col;
    if (inBounds(nr, nc) && !(board[nr][nc] && side(board[nr][nc]) === s)) {
      moves.push({ from: { row, col }, to: { row: nr, col: nc } });
    }
    if (crossedRiver(row, s)) {
      for (const dc of [-1, 1]) {
        const nc2 = col + dc;
        if (!inBounds(row, nc2)) continue;
        if (board[row][nc2] && side(board[row][nc2]) === s) continue;
        moves.push({ from: { row, col }, to: { row, col: nc2 } });
      }
    }
  }
  return moves;
}

function findGeneral(board, s) {
  for (let r = 0; r <= 9; r++) {
    for (let c = 0; c <= 8; c++) {
      if (board[r][c] === (s === 'red' ? 'rK' : 'bK')) return { row: r, col: c };
    }
  }
  return null;
}

function flyingGeneral(board) {
  const redK = findGeneral(board, 'red');
  const blackK = findGeneral(board, 'black');
  if (!redK || !blackK) return false;
  if (redK.col !== blackK.col) return false;
  const minR = Math.min(redK.row, blackK.row);
  const maxR = Math.max(redK.row, blackK.row);
  for (let r = minR + 1; r < maxR; r++) {
    if (board[r][redK.col]) return false;
  }
  return true;
}

export function isInCheck(board, s) {
  const opp = s === 'red' ? 'black' : 'red';
  const king = findGeneral(board, s);
  if (!king) return true; // king captured
  // Check flying general
  if (flyingGeneral(board)) return true;
  // Check all opponent raw moves
  for (let r = 0; r <= 9; r++) {
    for (let c = 0; c <= 8; c++) {
      if (!board[r][c] || side(board[r][c]) !== opp) continue;
      const rawMoves = getRawMoves(board, r, c);
      for (const mv of rawMoves) {
        if (mv.to.row === king.row && mv.to.col === king.col) return true;
      }
    }
  }
  return false;
}

export function applyMove(board, from, to) {
  const next = board.map((row) => [...row]);
  next[to.row][to.col] = next[from.row][from.col];
  next[from.row][from.col] = null;
  return next;
}

export function getLegalMoves(board, s) {
  const legal = [];
  for (let r = 0; r <= 9; r++) {
    for (let c = 0; c <= 8; c++) {
      if (!board[r][c] || side(board[r][c]) !== s) continue;
      const rawMoves = getRawMoves(board, r, c);
      for (const mv of rawMoves) {
        const next = applyMove(board, mv.from, mv.to);
        if (!isInCheck(next, s)) legal.push(mv);
      }
    }
  }
  return legal;
}

export function isCheckmate(board, s) {
  if (!isInCheck(board, s)) return false;
  return getLegalMoves(board, s).length === 0;
}

export function checkWin(board) {
  // A side wins when opponent general is absent or opponent is checkmated
  const redK = findGeneral(board, 'red');
  const blackK = findGeneral(board, 'black');
  if (!redK) return 'black';
  if (!blackK) return 'red';
  if (isCheckmate(board, 'red')) return 'black';
  if (isCheckmate(board, 'black')) return 'red';
  return null;
}

// Piece values: K R C H E A P
const PIECE_VALUES = { K: 10000, R: 900, C: 450, H: 400, E: 200, A: 200, P: 100 };

export function evaluateBoard(board) {
  let score = 0;
  for (let r = 0; r <= 9; r++) {
    for (let c = 0; c <= 8; c++) {
      const p = board[r][c];
      if (!p) continue;
      const val = PIECE_VALUES[p[1]] || 0;
      score += side(p) === 'red' ? val : -val;
    }
  }
  return score;
}


// Return { king, attackers:[{row,col}] } for the side `s` in check, else null.
// Includes the flying-general case (opposing general on the same open file).
export function getCheckers(board, s) {
  const king = findGeneral(board, s);
  if (!king) return null;
  if (!isInCheck(board, s)) return null;
  const opp = s === 'red' ? 'black' : 'red';
  const attackers = [];
  for (let r = 0; r <= 9; r++) {
    for (let c = 0; c <= 8; c++) {
      if (!board[r][c] || side(board[r][c]) !== opp) continue;
      const raw = getRawMoves(board, r, c);
      if (raw.some((m) => m.to.row === king.row && m.to.col === king.col)) {
        attackers.push({ row: r, col: c });
      }
    }
  }
  // Flying general: the opposing general checks along an open shared file.
  if (flyingGeneral(board)) {
    const oppKing = findGeneral(board, opp);
    if (oppKing && !attackers.some((a) => a.row === oppKing.row && a.col === oppKing.col)) {
      attackers.push({ row: oppKing.row, col: oppKing.col });
    }
  }
  return { king, attackers };
}
