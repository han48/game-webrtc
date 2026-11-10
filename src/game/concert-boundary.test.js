import { describe, expect, it } from 'vitest';
import { getConcertBoundarySegments } from './concert-boundary.js';
import { isBlocked } from './pathfinding.js';

const boundary = {
  minX: -120,
  maxX: 120,
  minZ: -130,
  maxZ: 87,
  entryWidth: 28,
  thickness: 0.5,
};

describe('concert event boundary', () => {
  it('encloses all sides while leaving an entrance centered behind the welcome gate', () => {
    const segments = getConcertBoundarySegments(boundary);

    expect(segments).toHaveLength(5);
    expect(segments.slice(0, 2)).toEqual([
      { x: -120, z: -21.5, width: 0.5, depth: 217.5 },
      { x: 120, z: -21.5, width: 0.5, depth: 217.5 },
    ]);
    expect(segments[2]).toEqual({
      x: 0,
      z: -130,
      width: 240.5,
      depth: 0.5,
    });
    expect(segments.slice(3)).toEqual([
      { x: -67, z: 87, width: 106, depth: 0.5 },
      { x: 67, z: 87, width: 106, depth: 0.5 },
    ]);
    expect(isBlocked({ x: 0, z: boundary.maxZ }, segments)).toBe(false);
    expect(isBlocked({ x: 30, z: boundary.maxZ }, segments)).toBe(true);
  });
});
