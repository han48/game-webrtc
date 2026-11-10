// Cờ Đông Tây game engine — pure JS, no DOM
// Board: 10 rows × 9 cols. Row index 0 = row 1 (West/bottom back rank). Row index 9 = row 10 (East/top back rank).
// East pieces (uppercase): V=Tướng, S=Sĩ, T=Tượng, M=Mã, X=Xe, P=Pháo, C=Chốt
// West pieces (lowercase): k=Vua, r=Xe, n=Mã(Knight), b=Tượng(Bishop), p=Tốt, q=Hậu
// State: { board, turn:'east'|'west', halfmove, positionHistory, layout }

export function createInitialState(layout = 'A') {
  const board = Array.from({ length: 10 }, () => new Array(9).fill(null));

  // East back rank at row index 9 (top)
  board[9] = ['X', 'M', 'T', 'S', 'V', 'S', 'T', 'M', 'X'];
  // East cannons at row index 7
  board[7][1] = 'P';
  board[7][7] = 'P';
  // East chốt at row index 6
  board[6][0] = 'C';
  board[6][2] = 'C';
  board[6][4] = 'C';
  board[6][6] = 'C';
  board[6][8] = 'C';

  // West pawns at row index 1
  board[1] = ['p', 'p', 'p', 'p', 'p', 'p', 'p', 'p', 'p'];
  // West back rank at row index 0
  board[0] = ['r', null, 'n', 'q', 'k', 'b', 'n', null, 'r'];

  return {
    board,
    turn: 'west', // West moves first
    halfmove: 0,
    positionHistory: [JSON.stringify(board)],
    layout,
  };
}

// Return the side that owns a piece, or null for empty square
export function sideOf(piece) {
  if (!piece) return null;
  const eastPieces = 'VSTMXPC';
  const westPieces = 'krnbpq';
  if (eastPieces.includes(piece)) return 'east';
  if (westPieces.includes(piece)) return 'west';
  return null;
}

function inBounds(r, c) {
  return r >= 0 && r <= 9 && c >= 0 && c <= 8;
}

// East palace: cols 3–5, row indices 7–9
function inEastPalace(r, c) {
  return c >= 3 && c <= 5 && r >= 7 && r <= 9;
}

// River boundary: East side is row index >= 5. West side is row index <= 4.
// East T (Tượng) cannot cross river, so must stay at row index >= 5.
// East C (Chốt) crosses river when it reaches row index <= 4.

function getPseudoLegalMoves(board, row, col) {
  const piece = board[row][col];
  if (!piece) return [];
  const s = sideOf(piece);
  const moves = [];

  // ---- EAST PIECES ----
  if (piece === 'V') {
    // Tướng: 1-step ortho, confined to East palace (cols 3–5, rows 7–9)
    const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
    for (const [dr, dc] of dirs) {
      const nr = row + dr, nc = col + dc;
      if (!inEastPalace(nr, nc)) continue;
      if (sideOf(board[nr][nc]) === 'east') continue;
      moves.push({ from: { row, col }, to: { row: nr, col: nc } });
    }
  } else if (piece === 'S') {
    // Sĩ: 1-step diagonal, confined to East palace
    const dirs = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
    for (const [dr, dc] of dirs) {
      const nr = row + dr, nc = col + dc;
      if (!inEastPalace(nr, nc)) continue;
      if (sideOf(board[nr][nc]) === 'east') continue;
      moves.push({ from: { row, col }, to: { row: nr, col: nc } });
    }
  } else if (piece === 'T') {
    // Tượng: 2-step diagonal, East side only (row index >= 5), blocked by midpoint piece
    const diags = [[2, 2], [2, -2], [-2, 2], [-2, -2]];
    const legs = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
    for (let i = 0; i < 4; i++) {
      const [dr, dc] = diags[i];
      const [lr, lc] = legs[i];
      const nr = row + dr, nc = col + dc;
      if (!inBounds(nr, nc)) continue;
      // Cannot cross river — must stay at row index >= 5
      if (nr < 5) continue;
      // Leg blocking
      if (board[row + lr][col + lc]) continue;
      if (sideOf(board[nr][nc]) === 'east') continue;
      moves.push({ from: { row, col }, to: { row: nr, col: nc } });
    }
  } else if (piece === 'M') {
    // Mã: 1 ortho + 1 diagonal, blocked by piece at ortho step
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
        if (sideOf(board[nr][nc]) === 'east') continue;
        moves.push({ from: { row, col }, to: { row: nr, col: nc } });
      }
    }
  } else if (piece === 'X') {
    // Xe: unlimited ortho
    const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
    for (const [dr, dc] of dirs) {
      let nr = row + dr, nc = col + dc;
      while (inBounds(nr, nc)) {
        if (board[nr][nc]) {
          if (sideOf(board[nr][nc]) !== 'east') moves.push({ from: { row, col }, to: { row: nr, col: nc } });
          break;
        }
        moves.push({ from: { row, col }, to: { row: nr, col: nc } });
        nr += dr; nc += dc;
      }
    }
  } else if (piece === 'P') {
    // Pháo: moves like Xe (no capture), captures by jumping exactly 1 piece
    const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
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
            if (sideOf(board[nr][nc]) !== 'east') moves.push({ from: { row, col }, to: { row: nr, col: nc } });
            break;
          }
        }
        nr += dr; nc += dc;
      }
    }
  } else if (piece === 'C') {
    // Chốt: forward = decreasing row index (toward row 0)
    // Before crossing river (row index >= 5): 1 step forward only
    // After crossing (row index <= 4): 1 step forward OR 1 step lateral; never backward
    const fwd = -1; // East chốt moves toward row 0
    const nr = row + fwd, nc = col;
    if (inBounds(nr, nc) && sideOf(board[nr][nc]) !== 'east') {
      moves.push({ from: { row, col }, to: { row: nr, col: nc } });
    }
    if (row <= 4) {
      // Crossed river — can also move laterally
      for (const dc of [-1, 1]) {
        const nc2 = col + dc;
        if (!inBounds(row, nc2)) continue;
        if (sideOf(board[row][nc2]) === 'east') continue;
        moves.push({ from: { row, col }, to: { row, col: nc2 } });
      }
    }
  }

  // ---- WEST PIECES ----
  else if (piece === 'k') {
    // Vua: 1-step any direction, no palace restriction
    const dirs = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
    for (const [dr, dc] of dirs) {
      const nr = row + dr, nc = col + dc;
      if (!inBounds(nr, nc)) continue;
      if (sideOf(board[nr][nc]) === 'west') continue;
      moves.push({ from: { row, col }, to: { row: nr, col: nc } });
    }
  } else if (piece === 'r') {
    // Xe: unlimited ortho
    const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
    for (const [dr, dc] of dirs) {
      let nr = row + dr, nc = col + dc;
      while (inBounds(nr, nc)) {
        if (board[nr][nc]) {
          if (sideOf(board[nr][nc]) !== 'west') moves.push({ from: { row, col }, to: { row: nr, col: nc } });
          break;
        }
        moves.push({ from: { row, col }, to: { row: nr, col: nc } });
        nr += dr; nc += dc;
      }
    }
  } else if (piece === 'n') {
    // Knight: L-shape, CAN jump over pieces (unlike East M)
    const jumps = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
    for (const [dr, dc] of jumps) {
      const nr = row + dr, nc = col + dc;
      if (!inBounds(nr, nc)) continue;
      if (sideOf(board[nr][nc]) === 'west') continue;
      moves.push({ from: { row, col }, to: { row: nr, col: nc } });
    }
  } else if (piece === 'b') {
    // Tượng (Bishop): unlimited diagonal
    const dirs = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
    for (const [dr, dc] of dirs) {
      let nr = row + dr, nc = col + dc;
      while (inBounds(nr, nc)) {
        if (board[nr][nc]) {
          if (sideOf(board[nr][nc]) !== 'west') moves.push({ from: { row, col }, to: { row: nr, col: nc } });
          break;
        }
        moves.push({ from: { row, col }, to: { row: nr, col: nc } });
        nr += dr; nc += dc;
      }
    }
  } else if (piece === 'q') {
    // Hậu (Queen): unlimited ortho + diagonal
    const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    for (const [dr, dc] of dirs) {
      let nr = row + dr, nc = col + dc;
      while (inBounds(nr, nc)) {
        if (board[nr][nc]) {
          if (sideOf(board[nr][nc]) !== 'west') moves.push({ from: { row, col }, to: { row: nr, col: nc } });
          break;
        }
        moves.push({ from: { row, col }, to: { row: nr, col: nc } });
        nr += dr; nc += dc;
      }
    }
  } else if (piece === 'p') {
    // Tốt (Pawn): forward = increasing row index (toward row 9)
    // Start row 1: can move 2 steps if both squares empty. Captures diagonal forward. Promotes at row 9.
    const fwd = 1;
    const nr = row + fwd;
    const promoRow = 9;
    if (inBounds(nr, col) && !board[nr][col]) {
      if (nr === promoRow) {
        moves.push({ from: { row, col }, to: { row: nr, col }, promo: 'q' });
      } else {
        moves.push({ from: { row, col }, to: { row: nr, col } });
        // Double push from start row (row index 1)
        if (row === 1 && !board[nr + fwd]?.[col]) {
          moves.push({ from: { row, col }, to: { row: nr + fwd, col } });
        }
      }
    }
    // Diagonal captures
    for (const dc of [-1, 1]) {
      const nc = col + dc;
      if (!inBounds(nr, nc)) continue;
      if (board[nr][nc] && sideOf(board[nr][nc]) === 'east') {
        if (nr === promoRow) {
          moves.push({ from: { row, col }, to: { row: nr, col: nc }, promo: 'q' });
        } else {
          moves.push({ from: { row, col }, to: { row: nr, col: nc } });
        }
      }
    }
  }

  return moves;
}

// Check if East V and West k are on same column with no piece between them
export function isVGeneralFacing(board) {
  let vRow = -1, vCol = -1;
  let kRow = -1, kCol = -1;

  for (let r = 0; r <= 9; r++) {
    for (let c = 0; c <= 8; c++) {
      if (board[r][c] === 'V') { vRow = r; vCol = c; }
      if (board[r][c] === 'k') { kRow = r; kCol = c; }
    }
  }

  if (vRow === -1 || kRow === -1) return false;
  if (vCol !== kCol) return false;

  // Check no piece between them on the same column
  const minR = Math.min(vRow, kRow);
  const maxR = Math.max(vRow, kRow);
  for (let r = minR + 1; r < maxR; r++) {
    if (board[r][vCol]) return false;
  }
  return true;
}

// Apply a move and return a new state (immutable)
export function applyMove(state, from, to, promo = 'q') {
  const board = state.board.map((row) => [...row]);
  const piece = board[from.row][from.col];
  const captured = board[to.row][to.col];

  // Move piece
  board[to.row][to.col] = piece;
  board[from.row][from.col] = null;

  // West pawn promotion at row index 9
  if (piece === 'p' && to.row === 9) {
    board[to.row][to.col] = promo || 'q';
  }

  // Update halfmove counter: reset on capture
  const halfmove = captured ? 0 : state.halfmove + 1;

  const turn = state.turn === 'east' ? 'west' : 'east';

  const boardSnapshot = JSON.stringify(board);
  const positionHistory = [...state.positionHistory, boardSnapshot];

  return {
    board,
    turn,
    halfmove,
    positionHistory,
    layout: state.layout,
  };
}

// Get all legal moves for a given side
export function getLegalMoves(state, side) {
  const { board } = state;
  const pseudoMoves = [];

  for (let r = 0; r <= 9; r++) {
    for (let c = 0; c <= 8; c++) {
      if (sideOf(board[r][c]) !== side) continue;
      const pms = getPseudoLegalMoves(board, r, c);
      pseudoMoves.push(...pms);
    }
  }

  // Check if current board already has V facing k (created by West's prior move)
  const facingNow = isVGeneralFacing(board);

  return pseudoMoves.filter((mv) => {
    const next = applyMove(state, mv.from, mv.to, mv.promo);
    const newBoard = next.board;

    if (side === 'east') {
      // East's move must not leave V facing k (Mặt Tướng rule)
      if (isVGeneralFacing(newBoard)) return false;
      return true;
    } else {
      // West has no self-check restriction in this game
      // But if it was already facing before West moved, that's a different situation
      // West's move can create Mặt Tướng — East will deal with it on their turn
      return true;
    }
  });
}

// Check game result
export function checkResult(state) {
  const { board, positionHistory, halfmove, turn } = state;

  // Check for missing kings
  let hasV = false, hasK = false;
  for (let r = 0; r <= 9; r++) {
    for (let c = 0; c <= 8; c++) {
      if (board[r][c] === 'V') hasV = true;
      if (board[r][c] === 'k') hasK = true;
    }
  }
  if (!hasV) return 'west'; // East's Tướng captured → West wins
  if (!hasK) return 'east'; // West's Vua captured → East wins

  // Mặt Tướng: if it's East's turn, V is facing k, and East has no legal move to resolve it → East loses
  if (turn === 'east' && isVGeneralFacing(board)) {
    const eastMoves = getLegalMoves(state, 'east');
    if (eastMoves.length === 0) return 'west';
  }

  // 3-fold repetition: check if the last position snapshot appears 3+ times
  if (positionHistory.length >= 1) {
    const last = positionHistory[positionHistory.length - 1];
    let count = 0;
    for (const snap of positionHistory) {
      if (snap === last) count++;
    }
    if (count >= 3) return 'draw';
  }

  // 50-move rule (100 half-moves)
  if (halfmove >= 100) return 'draw';

  return null;
}

// Piece values — East is minimiser (negative), West is maximiser (positive)
const EAST_VALUES = { V: 10000, X: 900, P: 450, M: 400, T: 200, S: 200, C: 100 };
const WEST_VALUES = { k: 10000, r: 700, q: 950, n: 350, b: 300, p: 100 };

export function evaluateBoard(state) {
  let score = 0;
  const { board } = state;
  for (let r = 0; r <= 9; r++) {
    for (let c = 0; c <= 8; c++) {
      const p = board[r][c];
      if (!p) continue;
      const s = sideOf(p);
      if (s === 'east') {
        score -= EAST_VALUES[p] || 0;
      } else if (s === 'west') {
        score += WEST_VALUES[p] || 0;
      }
    }
  }
  return score;
}
