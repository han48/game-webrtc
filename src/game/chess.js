// Chess game engine — pure JS, no DOM
// Board: 8×8 array (null=empty). Row 0=rank 8 (black back), row 7=rank 1 (white back). Col 0=file a.
// Piece codes: uppercase=white ('P','N','B','R','Q','K'), lowercase=black.
// State: {board, turn:'white'|'black', castling:{wK,wQ,bK,bQ}, enPassant:{row,col}|null, halfmove, fullmove}

export function createInitialState() {
  const board = Array.from({ length: 8 }, () => new Array(8).fill(null));
  // Black back rank (row 0)
  board[0] = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
  // Black pawns (row 1)
  board[1] = new Array(8).fill('p');
  // White pawns (row 6)
  board[6] = new Array(8).fill('P');
  // White back rank (row 7)
  board[7] = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];
  return {
    board,
    turn: 'white',
    castling: { wK: true, wQ: true, bK: true, bQ: true },
    enPassant: null,
    halfmove: 0,
    fullmove: 1,
  };
}

function sideOf(piece) {
  if (!piece) return null;
  return piece === piece.toUpperCase() ? 'white' : 'black';
}

function inBounds(r, c) {
  return r >= 0 && r <= 7 && c >= 0 && c <= 7;
}

// Generate pseudo-legal moves (no check filtering)
function getPseudoLegalMoves(state, s) {
  const { board, enPassant, castling } = state;
  const moves = [];
  const fwdDir = s === 'white' ? -1 : 1;
  const startRow = s === 'white' ? 6 : 1;
  const promoRow = s === 'white' ? 0 : 7;
  const opp = s === 'white' ? 'black' : 'white';

  for (let r = 0; r <= 7; r++) {
    for (let c = 0; c <= 7; c++) {
      const p = board[r][c];
      if (!p || sideOf(p) !== s) continue;
      const pt = p.toUpperCase();

      if (pt === 'P') {
        // Single push
        const nr = r + fwdDir;
        if (inBounds(nr, c) && !board[nr][c]) {
          if (nr === promoRow) {
            moves.push({ from: { row: r, col: c }, to: { row: nr, col: c }, promo: 'q' });
          } else {
            moves.push({ from: { row: r, col: c }, to: { row: nr, col: c } });
            // Double push from start
            if (r === startRow && !board[nr + fwdDir]?.[c]) {
              moves.push({ from: { row: r, col: c }, to: { row: nr + fwdDir, col: c } });
            }
          }
        }
        // Captures
        for (const dc of [-1, 1]) {
          const nc = c + dc;
          if (!inBounds(nr, nc)) continue;
          if (board[nr][nc] && sideOf(board[nr][nc]) === opp) {
            if (nr === promoRow) {
              moves.push({ from: { row: r, col: c }, to: { row: nr, col: nc }, promo: 'q' });
            } else {
              moves.push({ from: { row: r, col: c }, to: { row: nr, col: nc } });
            }
          }
          // En passant
          if (enPassant && enPassant.row === nr && enPassant.col === nc) {
            moves.push({ from: { row: r, col: c }, to: { row: nr, col: nc } });
          }
        }
      } else if (pt === 'N') {
        const jumps = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
        for (const [dr, dc] of jumps) {
          const nr = r + dr, nc = c + dc;
          if (!inBounds(nr, nc)) continue;
          if (board[nr][nc] && sideOf(board[nr][nc]) === s) continue;
          moves.push({ from: { row: r, col: c }, to: { row: nr, col: nc } });
        }
      } else if (pt === 'B' || pt === 'Q') {
        const dirs = [[1,1],[1,-1],[-1,1],[-1,-1]];
        for (const [dr, dc] of dirs) {
          let nr = r + dr, nc = c + dc;
          while (inBounds(nr, nc)) {
            if (board[nr][nc]) {
              if (sideOf(board[nr][nc]) !== s) moves.push({ from: { row: r, col: c }, to: { row: nr, col: nc } });
              break;
            }
            moves.push({ from: { row: r, col: c }, to: { row: nr, col: nc } });
            nr += dr; nc += dc;
          }
        }
        if (pt === 'B') continue;
      }
      if (pt === 'R' || pt === 'Q') {
        const dirs = [[0,1],[0,-1],[1,0],[-1,0]];
        for (const [dr, dc] of dirs) {
          let nr = r + dr, nc = c + dc;
          while (inBounds(nr, nc)) {
            if (board[nr][nc]) {
              if (sideOf(board[nr][nc]) !== s) moves.push({ from: { row: r, col: c }, to: { row: nr, col: nc } });
              break;
            }
            moves.push({ from: { row: r, col: c }, to: { row: nr, col: nc } });
            nr += dr; nc += dc;
          }
        }
      }
      if (pt === 'K') {
        const dirs = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
        for (const [dr, dc] of dirs) {
          const nr = r + dr, nc = c + dc;
          if (!inBounds(nr, nc)) continue;
          if (board[nr][nc] && sideOf(board[nr][nc]) === s) continue;
          moves.push({ from: { row: r, col: c }, to: { row: nr, col: nc } });
        }
        // Castling
        if (s === 'white' && r === 7 && c === 4) {
          if (castling.wK && !board[7][5] && !board[7][6] && board[7][7] === 'R') {
            // Check king not in check, not passing through check
            if (!squareAttacked(board, 7, 4, opp) && !squareAttacked(board, 7, 5, opp)) {
              moves.push({ from: { row: 7, col: 4 }, to: { row: 7, col: 6 } });
            }
          }
          if (castling.wQ && !board[7][3] && !board[7][2] && !board[7][1] && board[7][0] === 'R') {
            if (!squareAttacked(board, 7, 4, opp) && !squareAttacked(board, 7, 3, opp)) {
              moves.push({ from: { row: 7, col: 4 }, to: { row: 7, col: 2 } });
            }
          }
        }
        if (s === 'black' && r === 0 && c === 4) {
          if (castling.bK && !board[0][5] && !board[0][6] && board[0][7] === 'r') {
            if (!squareAttacked(board, 0, 4, opp) && !squareAttacked(board, 0, 5, opp)) {
              moves.push({ from: { row: 0, col: 4 }, to: { row: 0, col: 6 } });
            }
          }
          if (castling.bQ && !board[0][3] && !board[0][2] && !board[0][1] && board[0][0] === 'r') {
            if (!squareAttacked(board, 0, 4, opp) && !squareAttacked(board, 0, 3, opp)) {
              moves.push({ from: { row: 0, col: 4 }, to: { row: 0, col: 2 } });
            }
          }
        }
      }
    }
  }
  return moves;
}

function squareAttacked(board, row, col, byS) {
  // Check if square (row,col) is attacked by side byS
  const fwdDir = byS === 'white' ? -1 : 1;
  // Pawn attacks
  const pawnAttackRow = row - fwdDir; // a pawn on this row attacks (row,col)
  for (const dc of [-1, 1]) {
    const pc = col + dc;
    if (inBounds(pawnAttackRow, pc)) {
      const p = board[pawnAttackRow][pc];
      if (p && sideOf(p) === byS && p.toUpperCase() === 'P') return true;
    }
  }
  // Knight
  const jumps = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
  for (const [dr, dc] of jumps) {
    const nr = row + dr, nc = col + dc;
    if (!inBounds(nr, nc)) continue;
    const p = board[nr][nc];
    if (p && sideOf(p) === byS && p.toUpperCase() === 'N') return true;
  }
  // Diagonals (bishop/queen)
  for (const [dr, dc] of [[1,1],[1,-1],[-1,1],[-1,-1]]) {
    let nr = row + dr, nc = col + dc;
    while (inBounds(nr, nc)) {
      const p = board[nr][nc];
      if (p) {
        if (sideOf(p) === byS && (p.toUpperCase() === 'B' || p.toUpperCase() === 'Q')) return true;
        break;
      }
      nr += dr; nc += dc;
    }
  }
  // Straights (rook/queen)
  for (const [dr, dc] of [[0,1],[0,-1],[1,0],[-1,0]]) {
    let nr = row + dr, nc = col + dc;
    while (inBounds(nr, nc)) {
      const p = board[nr][nc];
      if (p) {
        if (sideOf(p) === byS && (p.toUpperCase() === 'R' || p.toUpperCase() === 'Q')) return true;
        break;
      }
      nr += dr; nc += dc;
    }
  }
  // King
  for (const [dr, dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) {
    const nr = row + dr, nc = col + dc;
    if (!inBounds(nr, nc)) continue;
    const p = board[nr][nc];
    if (p && sideOf(p) === byS && p.toUpperCase() === 'K') return true;
  }
  return false;
}

function findKing(board, s) {
  const kingPiece = s === 'white' ? 'K' : 'k';
  for (let r = 0; r <= 7; r++) {
    for (let c = 0; c <= 7; c++) {
      if (board[r][c] === kingPiece) return { row: r, col: c };
    }
  }
  return null;
}

export function isInCheck(state, s) {
  const king = findKing(state.board, s);
  if (!king) return true;
  const opp = s === 'white' ? 'black' : 'white';
  return squareAttacked(state.board, king.row, king.col, opp);
}

// Return { king, attackers:[{row,col}] } describing who is giving check to side
// `s`, or null if `s` is not in check. Used to draw the check-line effect.
export function getCheckers(state, s) {
  const board = state.board;
  const king = findKing(board, s);
  if (!king) return null;
  const opp = s === 'white' ? 'black' : 'white';
  if (!squareAttacked(board, king.row, king.col, opp)) return null;
  const attackers = [];
  const oppState = {
    board,
    enPassant: state.enPassant ?? null,
    castling: { wK: false, wQ: false, bK: false, bQ: false },
  };
  const oppMoves = getPseudoLegalMoves(oppState, opp);
  for (const m of oppMoves) {
    if (m.to.row === king.row && m.to.col === king.col) {
      if (!attackers.some((a) => a.row === m.from.row && a.col === m.from.col)) {
        attackers.push({ row: m.from.row, col: m.from.col });
      }
    }
  }
  return { king, attackers };
}

export function applyMove(state, from, to, promo = 'q') {
  const board = state.board.map((row) => [...row]);
  const piece = board[from.row][from.col];
  const pt = piece.toUpperCase();
  const s = sideOf(piece);
  const opp = s === 'white' ? 'black' : 'white';
  let enPassant = null;
  const castling = { ...state.castling };
  let halfmove = state.halfmove + 1;

  // En passant capture
  if (pt === 'P' && state.enPassant && to.row === state.enPassant.row && to.col === state.enPassant.col) {
    const capturedRow = s === 'white' ? to.row + 1 : to.row - 1;
    board[capturedRow][to.col] = null;
  }

  // Pawn double push → set en passant
  if (pt === 'P' && Math.abs(to.row - from.row) === 2) {
    enPassant = { row: (from.row + to.row) / 2, col: from.col };
  }

  // Move piece
  board[to.row][to.col] = piece;
  board[from.row][from.col] = null;

  // Promotion
  if (pt === 'P' && (to.row === 0 || to.row === 7)) {
    const promoChar = promo || 'q';
    board[to.row][to.col] = s === 'white' ? promoChar.toUpperCase() : promoChar.toLowerCase();
  }

  // Castling move: also move the rook
  if (pt === 'K') {
    const dc = to.col - from.col;
    if (dc === 2) {
      // Kingside
      board[from.row][5] = board[from.row][7];
      board[from.row][7] = null;
    } else if (dc === -2) {
      // Queenside
      board[from.row][3] = board[from.row][0];
      board[from.row][0] = null;
    }
    if (s === 'white') { castling.wK = false; castling.wQ = false; }
    else { castling.bK = false; castling.bQ = false; }
  }

  // Update castling rights when rook moves or is captured
  if (from.row === 7 && from.col === 7) castling.wK = false;
  if (from.row === 7 && from.col === 0) castling.wQ = false;
  if (from.row === 0 && from.col === 7) castling.bK = false;
  if (from.row === 0 && from.col === 0) castling.bQ = false;
  if (to.row === 7 && to.col === 7) castling.wK = false;
  if (to.row === 7 && to.col === 0) castling.wQ = false;
  if (to.row === 0 && to.col === 7) castling.bK = false;
  if (to.row === 0 && to.col === 0) castling.bQ = false;

  // Reset halfmove on pawn move or capture
  if (pt === 'P' || state.board[to.row][to.col]) halfmove = 0;

  const fullmove = opp === 'white' ? state.fullmove + 1 : state.fullmove;

  return { board, turn: opp, castling, enPassant, halfmove, fullmove };
}

export function getLegalMoves(state, s) {
  const pseudos = getPseudoLegalMoves(state, s);
  return pseudos.filter((mv) => {
    const next = applyMove(state, mv.from, mv.to, mv.promo);
    return !isInCheck(next, s);
  });
}

export function isCheckmate(state, s) {
  if (!isInCheck(state, s)) return false;
  return getLegalMoves(state, s).length === 0;
}

export function isStalemate(state, s) {
  if (isInCheck(state, s)) return false;
  return getLegalMoves(state, s).length === 0;
}

export function checkResult(state) {
  const { turn } = state;
  if (isCheckmate(state, turn)) return turn === 'white' ? 'black' : 'white';
  if (isStalemate(state, turn)) return 'draw';
  if (state.halfmove >= 100) return 'draw';
  return null;
}

// Piece values
const PIECE_VALUES = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 20000 };

export function evaluateBoard(state) {
  let score = 0;
  const { board } = state;
  for (let r = 0; r <= 7; r++) {
    for (let c = 0; c <= 7; c++) {
      const p = board[r][c];
      if (!p) continue;
      const val = PIECE_VALUES[p.toUpperCase()] || 0;
      let bonus = 0;
      if (r >= 2 && r <= 5 && c >= 2 && c <= 5) bonus = 10;
      score += sideOf(p) === 'white' ? val + bonus : -(val + bonus);
    }
  }
  return score;
}
