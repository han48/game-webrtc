// Gomoku (Cờ Ca-rô) game engine — pure JS, no DOM
// Board: 15×15, 0=empty, 1=human/black, 2=bot/white

export function createBoard() {
  return Array.from({ length: 15 }, () => new Array(15).fill(0));
}

export function applyMove(board, row, col, player) {
  const next = board.map((r) => [...r]);
  next[row][col] = player;
  return next;
}

export function checkWin(board, player) {
  const SIZE = 15;
  const directions = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (board[r][c] !== player) continue;
      for (const [dr, dc] of directions) {
        let count = 1;
        for (let k = 1; k < 5; k++) {
          const nr = r + dr * k;
          const nc = c + dc * k;
          if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE || board[nr][nc] !== player) break;
          count++;
        }
        if (count >= 5) return true;
      }
    }
  }
  return false;
}

export function isDraw(board) {
  return board.every((row) => row.every((cell) => cell !== 0));
}

export function getCandidates(board) {
  const SIZE = 15;
  const DIST = 2;
  // If board is all empty, return center
  let hasStone = false;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (board[r][c] !== 0) { hasStone = true; break; }
    }
    if (hasStone) break;
  }
  if (!hasStone) return [{ row: 7, col: 7 }];

  const seen = Array.from({ length: SIZE }, () => new Array(SIZE).fill(false));
  const candidates = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (board[r][c] === 0) continue;
      for (let dr = -DIST; dr <= DIST; dr++) {
        for (let dc = -DIST; dc <= DIST; dc++) {
          const nr = r + dr;
          const nc = c + dc;
          if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) continue;
          if (board[nr][nc] !== 0) continue;
          if (seen[nr][nc]) continue;
          seen[nr][nc] = true;
          candidates.push({ row: nr, col: nc });
        }
      }
    }
  }
  return candidates;
}

// Pattern-based evaluation
function countPattern(board, player, row, col, dr, dc) {
  const SIZE = 15;
  let count = 1;
  let open = 0;
  // forward
  for (let k = 1; k < 5; k++) {
    const nr = row + dr * k;
    const nc = col + dc * k;
    if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) break;
    if (board[nr][nc] === player) count++;
    else {
      if (board[nr][nc] === 0) open++;
      break;
    }
  }
  // backward
  for (let k = 1; k < 5; k++) {
    const nr = row - dr * k;
    const nc = col - dc * k;
    if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) break;
    if (board[nr][nc] === player) count++;
    else {
      if (board[nr][nc] === 0) open++;
      break;
    }
  }
  return { count, open };
}

function scoreForPlayer(board, player) {
  const SIZE = 15;
  const directions = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];
  const counted = Array.from({ length: SIZE }, () =>
    Array.from({ length: SIZE }, () => new Array(4).fill(false))
  );
  let score = 0;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (board[r][c] !== player) continue;
      for (let di = 0; di < 4; di++) {
        if (counted[r][c][di]) continue;
        const [dr, dc] = directions[di];
        // Collect full run starting from earliest cell in this direction
        let startR = r, startC = c;
        while (true) {
          const pr = startR - dr, pc = startC - dc;
          if (pr < 0 || pr >= SIZE || pc < 0 || pc >= SIZE || board[pr][pc] !== player) break;
          startR = pr; startC = pc;
        }
        // Count run length
        let len = 0;
        let rr = startR, cc = startC;
        while (rr >= 0 && rr < SIZE && cc >= 0 && cc < SIZE && board[rr][cc] === player) {
          counted[rr][cc][di] = true;
          len++;
          rr += dr; cc += dc;
        }
        // Check open ends
        const beforeR = startR - dr, beforeC = startC - dc;
        const afterR = startR + dr * len, afterC = startC + dc * len;
        const openBefore = beforeR >= 0 && beforeR < SIZE && beforeC >= 0 && beforeC < SIZE && board[beforeR][beforeC] === 0;
        const openAfter = afterR >= 0 && afterR < SIZE && afterC >= 0 && afterC < SIZE && board[afterR][afterC] === 0;
        const openEnds = (openBefore ? 1 : 0) + (openAfter ? 1 : 0);

        if (len >= 5) {
          score += 100000;
        } else if (len === 4) {
          score += openEnds === 2 ? 10000 : openEnds === 1 ? 1000 : 0;
        } else if (len === 3) {
          score += openEnds === 2 ? 500 : openEnds === 1 ? 100 : 0;
        } else if (len === 2) {
          score += openEnds === 2 ? 10 : 0;
        }
      }
    }
  }
  return score;
}

export function evaluateBoard(board, player) {
  const opponent = player === 1 ? 2 : 1;
  return scoreForPlayer(board, player) - scoreForPlayer(board, opponent);
}
