import { describe, expect, it } from 'vitest';
import { buildPath, isBlocked } from './pathfinding.js';

describe('office pathfinding', () => {
  it('blocks furniture areas', () => {
    const obstacle = { x: 3, z: 2, width: 2, depth: 2 };
    expect(isBlocked({ x: 3.5, z: 2.5, radius: 0.5 }, [obstacle])).toBe(true);
    expect(isBlocked({ x: 6, z: 2, radius: 0.5 }, [obstacle])).toBe(false);
  });

  it('finds a route around obstacles', () => {
    const obstacles = [
      { x: 4, z: 0, width: 2, depth: 2 },
      { x: 0, z: 4, width: 2, depth: 2 },
    ];

    const path = buildPath({ x: 0, z: 0 }, { x: 8, z: 8 }, obstacles, {
      width: 20,
      height: 20,
      cellSize: 1,
    });

    expect(path.length).toBeGreaterThan(2);
    expect(path[0]).toEqual({ x: 0, z: 0 });
    expect(path[path.length - 1]).toEqual({ x: 8, z: 8 });
  });

  it('finds a route in a negatively offset office floor', () => {
    const obstacles = [{ x: -3, z: -4, width: 2, depth: 2 }];
    const path = buildPath({ x: -8, z: -4 }, { x: 2, z: -4 }, obstacles, {
      width: 40,
      height: 32,
      cellSize: 0.5,
      minX: -10,
      minZ: -8,
    });

    expect(path.length).toBeGreaterThan(2);
    expect(path[0]).toEqual({ x: -8, z: -4 });
    expect(path[path.length - 1]).toEqual({ x: 2, z: -4 });
    expect(path.slice(1, -1).some((point) => point.z < -5 || point.z > -3)).toBe(true);
  });
});
