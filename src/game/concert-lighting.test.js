import { describe, expect, it } from 'vitest';
import { getBeamLineFixtures, getBeamPerimeterFixtures } from './concert-lighting.js';

function expectSpacingAtMost(points, spacing, scale = 1) {
  points.slice(1).forEach((point, index) => {
    const previous = points[index];
    expect(Math.hypot(point[0] - previous[0], point[1] - previous[1]) * scale)
      .toBeLessThanOrEqual(spacing);
  });
}

describe('concert moving beam spacing', () => {
  it('places runway beams no more than ten meters apart after scene scaling', () => {
    const fixtures = getBeamLineFixtures([2.1, -102], [2.1, 4.1667], 10, 0.72);

    expect(fixtures.length).toBe(9);
    expect(fixtures.every(([x]) => x === 2.1)).toBe(true);
    expectSpacingAtMost(fixtures, 10, 0.72);
  });

  it('places stage-edge beams no more than ten meters apart after scene scaling', () => {
    const fixtures = getBeamPerimeterFixtures([
      [-35, -118],
      [35, -118],
      [35, -108],
      [25, -102],
      [-25, -102],
      [-35, -108],
    ], 10, 0.72);

    expect(fixtures.length).toBe(14);
    expectSpacingAtMost([...fixtures, fixtures[0]], 10, 0.72);
  });
});
