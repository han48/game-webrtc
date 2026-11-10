import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getDefaultSpawn, getOverflowSpawn, getSpawnPoints } from './floor-plan.js';

const floorPlan = JSON.parse(readFileSync(new URL('../floor-plan.json', import.meta.url), 'utf8'));

describe('floor plan spawn configuration', () => {
  it('uses entrance spawn and applies member offsets relative to it', () => {
    const movedPlan = {
      ...floorPlan,
      entrance: { ...floorPlan.entrance, spawn: { x: 2, z: 4 } },
    };

    expect(getDefaultSpawn(movedPlan)).toEqual({ x: 2, z: 4 });
    expect(getSpawnPoints(movedPlan)[0]).toEqual({ x: 2, z: 4 });
    expect(getSpawnPoints(movedPlan)[1]).toEqual({ x: 0.8, z: 4 });
  });

  it('uses the configured default spawn when the entrance is absent', () => {
    const planWithoutEntrance = { ...floorPlan, entrance: undefined };

    expect(getDefaultSpawn(planWithoutEntrance)).toEqual(floorPlan.defaultSpawn);
    expect(getSpawnPoints(planWithoutEntrance)[0]).toEqual(floorPlan.defaultSpawn);
  });

  it('uses the bounds center when both entrance and default spawn are absent', () => {
    const planWithoutSpawn = { ...floorPlan, entrance: undefined, defaultSpawn: undefined };

    expect(getDefaultSpawn(planWithoutSpawn)).toEqual({ x: 0, z: 0 });
  });

  it('keeps overflow spawns inside the floor bounds', () => {
    const spawn = getOverflowSpawn(floorPlan, 1000);
    expect(spawn.x).toBeGreaterThanOrEqual(floorPlan.bounds.minX);
    expect(spawn.x).toBeLessThanOrEqual(floorPlan.bounds.maxX);
    expect(spawn.z).toBeGreaterThanOrEqual(floorPlan.bounds.minZ);
    expect(spawn.z).toBeLessThanOrEqual(floorPlan.bounds.maxZ);
  });
});