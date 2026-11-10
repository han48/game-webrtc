// Battleship (Bắn Tàu) game engine — pure JS, no DOM, no React
// Board: 10×10, each cell: { ship: null | shipObject, hit: false | true }

// Ships ordered by size (largest first), Vietnamese names
export const SHIPS = [
  { id: 'carrier',    name: 'Tàu Sân Bay',  size: 5 },
  { id: 'battleship', name: 'Thiết Giáp',   size: 4 },
  { id: 'cruiser',    name: 'Tuần Dương',   size: 3 },
  { id: 'submarine',  name: 'Tàu Ngầm',     size: 3 },
  { id: 'destroyer',  name: 'Khu Trục',     size: 2 },
];

// Returns a fresh 10×10 grid of empty cells
export function createEmptyGrid() {
  return Array.from({ length: 10 }, () =>
    Array.from({ length: 10 }, () => ({ ship: null, hit: false }))
  );
}

// Returns a deep copy of a grid
function deepCopyGrid(grid) {
  return grid.map((row) => row.map((cell) => ({ ...cell })));
}

/**
 * Places a ship on a copy of grid. Returns the new grid.
 * Throws Error('out-of-bounds') if any cell is outside 0–9.
 * Throws Error('overlap') if any cell is already occupied.
 * Does NOT mutate the input grid.
 *
 * @param {Array} grid - current grid
 * @param {Object} ship - ship object from SHIPS
 * @param {number} row - top-left row
 * @param {number} col - top-left column
 * @param {boolean} horizontal - true = extend along cols, false = extend along rows
 */
export function placeShip(grid, ship, row, col, horizontal) {
  // Validate all cells first before mutating anything
  for (let i = 0; i < ship.size; i++) {
    const r = horizontal ? row       : row + i;
    const c = horizontal ? col + i   : col;
    if (r < 0 || r > 9 || c < 0 || c > 9) {
      throw new Error('out-of-bounds');
    }
    if (grid[r][c].ship !== null) {
      throw new Error('overlap');
    }
  }

  const next = deepCopyGrid(grid);
  for (let i = 0; i < ship.size; i++) {
    const r = horizontal ? row       : row + i;
    const c = horizontal ? col + i   : col;
    next[r][c] = { ...next[r][c], ship };
  }
  return next;
}

/**
 * Randomly places all ships from the ships array onto a fresh grid.
 * Retries each ship's placement until it fits; aborts after 1000 total
 * attempts to prevent infinite loops (in practice succeeds in << 100 tries).
 *
 * @param {Array} ships - array of ship objects (use SHIPS)
 * @returns {Array} completed grid
 */
export function autoPlace(ships) {
  let grid = createEmptyGrid();
  let totalAttempts = 0;

  for (const ship of ships) {
    let placed = false;
    while (!placed) {
      if (totalAttempts >= 1000) {
        // Safety fallback: restart whole placement
        grid = createEmptyGrid();
        totalAttempts = 0;
        break;
      }
      totalAttempts++;
      const horizontal = Math.random() < 0.5;
      const row = Math.floor(Math.random() * 10);
      const col = Math.floor(Math.random() * 10);
      try {
        grid = placeShip(grid, ship, row, col, horizontal);
        placed = true;
      } catch {
        // out-of-bounds or overlap — retry
      }
    }
    if (!placed) {
      // Restart from scratch by recursing (rare edge case)
      return autoPlace(ships);
    }
  }
  return grid;
}

/**
 * Fires at (row, col) on the grid.
 * Returns { grid, result, sunkShip? }
 *   result: 'already-fired' | 'miss' | 'hit' | 'sunk'
 *   sunkShip: ship object when result === 'sunk'
 *
 * Edge case: if cell was already hit, returns { result:'already-fired', grid }
 * with the grid unchanged — caller must not count this as a turn.
 */
export function fire(grid, row, col) {
  const cell = grid[row][col];

  // Already fired — return unchanged grid (do not count as a turn)
  if (cell.hit) {
    return { grid, result: 'already-fired' };
  }

  const next = deepCopyGrid(grid);
  next[row][col] = { ...next[row][col], hit: true };

  if (cell.ship === null) {
    return { grid: next, result: 'miss' };
  }

  // Check if this ship is now fully sunk (all cells hit)
  const ship = cell.ship;
  const allSunk = next.every((r) =>
    r.every((c) => c.ship?.id !== ship.id || c.hit)
  );

  if (allSunk) {
    return { grid: next, result: 'sunk', sunkShip: ship };
  }
  return { grid: next, result: 'hit' };
}

/**
 * Returns true when every cell that has a ship is hit — i.e., all ships sunk.
 */
export function checkWin(grid) {
  return grid.every((row) =>
    row.every((cell) => cell.ship === null || cell.hit)
  );
}

/**
 * Bot AI move using hunt/target strategy.
 *
 * huntTarget shape:
 *   { mode: 'hunt'|'target', queue: [{row,col}], hits: [{row,col}], lastSunkSize: 0 }
 *
 * Target mode: fire the first queue cell that hasn't been hit yet;
 *   if queue empties, fall back to hunt mode.
 * Hunt mode: fire a random unhit cell.
 * After any hit: switch to target mode, add orthogonal unhit in-bounds neighbors to queue.
 * After a sink: clear queue, return to hunt mode, record lastSunkSize.
 *
 * Returns { row, col, huntTarget } where huntTarget is the NEXT state.
 * The caller fires and updates the grid separately.
 */
export function botMove(grid, huntTarget) {
  let { mode, queue, hits, lastSunkSize } = huntTarget;

  // Helper: check if a cell has been fired at
  const isHit = (r, c) => grid[r][c].hit;

  // Helper: collect all unhit cells
  const unhitCells = () => {
    const cells = [];
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 10; c++) {
        if (!isHit(r, c)) cells.push({ row: r, col: c });
      }
    }
    return cells;
  };

  // Helper: orthogonal neighbors in-bounds and not yet hit
  const neighbors = (r, c) => {
    const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
    return dirs
      .map(([dr, dc]) => ({ row: r + dr, col: c + dc }))
      .filter(({ row, col }) =>
        row >= 0 && row <= 9 && col >= 0 && col <= 9 && !isHit(row, col)
      );
  };

  let targetRow, targetCol;
  let nextQueue = [...queue];
  let nextHits = [...hits];
  let nextMode = mode;
  let nextLastSunkSize = lastSunkSize;

  if (mode === 'target') {
    // Drain queue, skipping already-hit cells
    while (nextQueue.length > 0 && isHit(nextQueue[0].row, nextQueue[0].col)) {
      nextQueue.shift();
    }
    if (nextQueue.length > 0) {
      const chosen = nextQueue.shift();
      targetRow = chosen.row;
      targetCol = chosen.col;
    } else {
      // Queue exhausted — fall back to hunt
      nextMode = 'hunt';
    }
  }

  if (nextMode === 'hunt') {
    const cells = unhitCells();
    const chosen = cells[Math.floor(Math.random() * cells.length)];
    targetRow = chosen.row;
    targetCol = chosen.col;
  }

  // Simulate the fire result to update huntTarget state
  const cell = grid[targetRow][targetCol];
  if (cell.ship !== null) {
    // It's a hit — but we don't know if it's a sink yet (caller fires)
    // We can pre-compute: if after firing this cell the ship would be fully sunk
    const ship = cell.ship;
    // Count how many cells of this ship are already hit
    let hitCount = 0;
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 10; c++) {
        if (grid[r][c].ship?.id === ship.id && grid[r][c].hit) hitCount++;
      }
    }
    const willSink = hitCount + 1 === ship.size;

    if (willSink) {
      // After sink: clear queue, return to hunt mode
      nextQueue = [];
      nextMode = 'hunt';
      nextLastSunkSize = ship.size;
      nextHits = nextHits.filter((h) => {
        // Remove hits that belonged to this ship
        return grid[h.row][h.col].ship?.id !== ship.id;
      });
    } else {
      // After hit (not sink): switch to target mode, add neighbors to queue
      nextMode = 'target';
      nextHits = [...nextHits, { row: targetRow, col: targetCol }];
      const newNeighbors = neighbors(targetRow, targetCol).filter(
        ({ row, col }) =>
          !nextQueue.some((q) => q.row === row && q.col === col)
      );
      nextQueue = [...nextQueue, ...newNeighbors];
    }
  }
  // miss: mode stays the same (hunt stays hunt, target stays target from above)

  return {
    row: targetRow,
    col: targetCol,
    huntTarget: {
      mode: nextMode,
      queue: nextQueue,
      hits: nextHits,
      lastSunkSize: nextLastSunkSize,
    },
  };
}
