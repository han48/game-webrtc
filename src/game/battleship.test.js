import { describe, it, expect } from 'vitest';
import {
  SHIPS,
  createEmptyGrid,
  placeShip,
  autoPlace,
  fire,
  checkWin,
  botMove,
} from './battleship.js';

describe('createEmptyGrid', () => {
  it('returns a 10×10 grid', () => {
    const grid = createEmptyGrid();
    expect(grid).toHaveLength(10);
    grid.forEach((row) => expect(row).toHaveLength(10));
  });

  it('all cells are {ship:null, hit:false}', () => {
    const grid = createEmptyGrid();
    grid.forEach((row) =>
      row.forEach((cell) => {
        expect(cell.ship).toBeNull();
        expect(cell.hit).toBe(false);
      })
    );
  });
});

describe('placeShip', () => {
  it('places a ship horizontally — cells contain ship object', () => {
    const grid = createEmptyGrid();
    const ship = SHIPS.find((s) => s.id === 'destroyer'); // size 2
    const next = placeShip(grid, ship, 3, 4, true);
    expect(next[3][4].ship).toBe(ship);
    expect(next[3][5].ship).toBe(ship);
    expect(next[3][6]).toEqual({ ship: null, hit: false }); // next cell untouched
  });

  it('places a ship vertically — cells contain ship object', () => {
    const grid = createEmptyGrid();
    const ship = SHIPS.find((s) => s.id === 'cruiser'); // size 3
    const next = placeShip(grid, ship, 0, 0, false);
    expect(next[0][0].ship).toBe(ship);
    expect(next[1][0].ship).toBe(ship);
    expect(next[2][0].ship).toBe(ship);
    expect(next[3][0].ship).toBeNull();
  });

  it('does not mutate the original grid', () => {
    const grid = createEmptyGrid();
    const ship = SHIPS.find((s) => s.id === 'destroyer');
    placeShip(grid, ship, 0, 0, true);
    expect(grid[0][0].ship).toBeNull();
  });

  it('throws out-of-bounds when ship extends beyond column 9 (horizontal)', () => {
    const grid = createEmptyGrid();
    const ship = SHIPS.find((s) => s.id === 'destroyer'); // size 2
    expect(() => placeShip(grid, ship, 0, 9, true)).toThrow('out-of-bounds');
  });

  it('throws out-of-bounds when ship extends beyond row 9 (vertical)', () => {
    const grid = createEmptyGrid();
    const ship = SHIPS.find((s) => s.id === 'carrier'); // size 5
    // row=8 vertical: needs rows 8,9,10,11,12 → out of bounds
    expect(() => placeShip(grid, ship, 8, 0, false)).toThrow('out-of-bounds');
  });

  it('throws overlap when placing on an occupied cell', () => {
    const grid = createEmptyGrid();
    const ship = SHIPS.find((s) => s.id === 'destroyer');
    const grid2 = placeShip(grid, ship, 0, 0, true);
    // Try to place another ship overlapping at (0,1)
    const ship2 = SHIPS.find((s) => s.id === 'cruiser');
    expect(() => placeShip(grid2, ship2, 0, 0, true)).toThrow('overlap');
  });
});

describe('autoPlace', () => {
  it('places all ships with exactly ship.size cells each, no overlaps', () => {
    const grid = autoPlace(SHIPS);

    // Count cells per ship
    const counts = {};
    SHIPS.forEach((s) => (counts[s.id] = 0));
    grid.forEach((row) =>
      row.forEach((cell) => {
        if (cell.ship !== null) counts[cell.ship.id]++;
      })
    );
    SHIPS.forEach((ship) => {
      expect(counts[ship.id]).toBe(ship.size);
    });
  });

  it('produces a valid 10×10 grid with correct cell structure', () => {
    const grid = autoPlace(SHIPS);
    expect(grid).toHaveLength(10);
    grid.forEach((row) => {
      expect(row).toHaveLength(10);
      row.forEach((cell) => {
        expect(cell).toHaveProperty('hit', false);
        expect(cell).toHaveProperty('ship');
      });
    });
  });
});

describe('fire', () => {
  function buildDestroyerGrid() {
    const ship = SHIPS.find((s) => s.id === 'destroyer');
    return { grid: placeShip(createEmptyGrid(), ship, 5, 5, true), ship };
  }

  it('returns result:miss on an empty cell', () => {
    const { grid } = buildDestroyerGrid();
    const { result, grid: next } = fire(grid, 0, 0);
    expect(result).toBe('miss');
    expect(next[0][0].hit).toBe(true);
    expect(next[0][0].ship).toBeNull();
  });

  it('returns result:hit when a ship cell is struck but not all cells sunk', () => {
    const { grid } = buildDestroyerGrid();
    const { result, grid: next } = fire(grid, 5, 5);
    expect(result).toBe('hit');
    expect(next[5][5].hit).toBe(true);
    // second cell still unhit
    expect(next[5][6].hit).toBe(false);
  });

  it('returns result:sunk when all cells of the destroyer are hit', () => {
    const { grid, ship } = buildDestroyerGrid();
    const { grid: g2 } = fire(grid, 5, 5);
    const { result, sunkShip, grid: g3 } = fire(g2, 5, 6);
    expect(result).toBe('sunk');
    expect(sunkShip).toBe(ship);
    expect(g3[5][5].hit).toBe(true);
    expect(g3[5][6].hit).toBe(true);
  });

  it('returns result:already-fired and unchanged grid on double-fire', () => {
    const { grid } = buildDestroyerGrid();
    const { grid: g2 } = fire(grid, 0, 0);
    const { result, grid: g3 } = fire(g2, 0, 0);
    expect(result).toBe('already-fired');
    // Grid should be unchanged (same reference or same values)
    expect(g3[0][0]).toEqual(g2[0][0]);
  });
});

describe('checkWin', () => {
  it('returns false when ships are not all sunk', () => {
    const ship = SHIPS.find((s) => s.id === 'destroyer');
    const grid = placeShip(createEmptyGrid(), ship, 0, 0, true);
    const { grid: g2 } = fire(grid, 0, 0); // only first cell hit
    expect(checkWin(g2)).toBe(false);
  });

  it('returns true when all ship cells are hit', () => {
    const ship = SHIPS.find((s) => s.id === 'destroyer');
    const grid = placeShip(createEmptyGrid(), ship, 0, 0, true);
    const { grid: g2 } = fire(grid, 0, 0);
    const { grid: g3 } = fire(g2, 0, 1);
    expect(checkWin(g3)).toBe(true);
  });

  it('returns true on a fully played autoPlace grid where all ships sunk', () => {
    let grid = autoPlace(SHIPS);
    // Fire every cell
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 10; c++) {
        const res = fire(grid, r, c);
        grid = res.grid;
      }
    }
    expect(checkWin(grid)).toBe(true);
  });
});

describe('botMove', () => {
  const initialHuntTarget = () => ({
    mode: 'hunt',
    queue: [],
    hits: [],
    lastSunkSize: 0,
  });

  it('hunt mode: returns an unhit cell', () => {
    const grid = createEmptyGrid();
    const { row, col } = botMove(grid, initialHuntTarget());
    expect(row).toBeGreaterThanOrEqual(0);
    expect(row).toBeLessThanOrEqual(9);
    expect(col).toBeGreaterThanOrEqual(0);
    expect(col).toBeLessThanOrEqual(9);
    expect(grid[row][col].hit).toBe(false);
  });

  it('hunt mode: does not return an already-hit cell', () => {
    let grid = createEmptyGrid();
    // Fire all cells except (9,9)
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 10; c++) {
        if (r === 9 && c === 9) continue;
        ({ grid } = fire(grid, r, c));
      }
    }
    const { row, col } = botMove(grid, initialHuntTarget());
    expect(row).toBe(9);
    expect(col).toBe(9);
  });

  it('target mode: fires from the queue', () => {
    const grid = createEmptyGrid();
    const ht = {
      mode: 'target',
      queue: [{ row: 3, col: 3 }],
      hits: [],
      lastSunkSize: 0,
    };
    const { row, col } = botMove(grid, ht);
    expect(row).toBe(3);
    expect(col).toBe(3);
  });

  it('target mode: skips already-hit cells in queue and falls back to hunt', () => {
    let grid = createEmptyGrid();
    ({ grid } = fire(grid, 3, 3));
    const ht = {
      mode: 'target',
      queue: [{ row: 3, col: 3 }], // already hit
      hits: [],
      lastSunkSize: 0,
    };
    // Should fall back to hunt mode and return some other unhit cell
    const { row, col } = botMove(grid, ht);
    // Not (3,3) because it's already hit
    expect(!(row === 3 && col === 3)).toBe(true);
  });

  it('returns updated huntTarget state', () => {
    const grid = createEmptyGrid();
    const { huntTarget } = botMove(grid, initialHuntTarget());
    expect(huntTarget).toHaveProperty('mode');
    expect(huntTarget).toHaveProperty('queue');
    expect(huntTarget).toHaveProperty('hits');
    expect(huntTarget).toHaveProperty('lastSunkSize');
  });
});
