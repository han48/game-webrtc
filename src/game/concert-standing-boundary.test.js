import { describe, expect, it } from 'vitest';
import {
  getConcertStandingBoundaryObstacles,
  getStandingAreaFenceSegments,
} from './concert-standing-boundary.js';
import { isBlocked } from './pathfinding.js';

describe('concert standing-area boundaries', () => {
  it('leaves entrances on the top and bottom edges of each standing area', () => {
    const footprint = [
      [-5, -4],
      [5, -4],
      [5, 4],
      [-5, 4],
    ];
    const segments = getStandingAreaFenceSegments(footprint, 2);

    expect(segments).toHaveLength(6);
    expect(segments).toContainEqual({ start: [-5, -4], end: [-1, -4] });
    expect(segments).toContainEqual({ start: [1, -4], end: [5, -4] });
    expect(segments).toContainEqual({ start: [-1, 4], end: [-5, 4] });
    expect(segments).toContainEqual({ start: [5, 4], end: [1, 4] });
  });

  it('blocks crossing the fences but leaves both doors passable', () => {
    const obstacles = getConcertStandingBoundaryObstacles({
      pits: [{ x: 10, z: 20, width: 10, depth: 8 }],
      centralClusterScale: 0.5,
      centralClusterOffsetZ: -3,
    });

    expect(isBlocked({ x: 5, z: 5 }, obstacles)).toBe(false);
    expect(isBlocked({ x: 5, z: 9 }, obstacles)).toBe(false);
    expect(isBlocked({ x: 2, z: 7 }, obstacles)).toBe(true);
    expect(isBlocked({ x: 5, z: 7 }, obstacles)).toBe(false);
  });
});
