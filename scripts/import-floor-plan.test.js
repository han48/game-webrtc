import { describe, expect, it } from 'vitest';
import { Group, Mesh, MeshStandardMaterial, PlaneGeometry } from 'three';
import { updateFloorPlanFromScene } from './import-floor-plan.js';

describe('updateFloorPlanFromScene', () => {
  it('applies bound positions, dimensions, and material colors without mutating the source plan', () => {
    const sourcePlan = {
      layout: {
        answerZones: [{ x: -7.5, z: 0, width: 4, depth: 5, color: '#3d88a5' }],
      },
    };
    const scene = new Group();
    const area = new Mesh(new PlaneGeometry(1, 1), new MeshStandardMaterial({ color: '#3d88a5' }));
    area.name = 'Answer Zone A';
    area.position.set(-5.5, 0.045, 1);
    area.scale.set(1.25, 1, 0.8);
    area.material.color.set('#ff0000');
    area.userData.floorPlanBinding = {
      path: ['layout', 'answerZones', 0],
      fields: {
        position: { x: 'x', z: 'z' },
        scale: { x: 'width', z: 'depth' },
        color: 'color',
      },
      baseScale: [1, 1, 1],
      baseValues: { width: 4, depth: 5 },
    };
    scene.add(area);

    const result = updateFloorPlanFromScene(sourcePlan, scene);

    expect(result.bindingCount).toBe(1);
    expect(result.plan.layout.answerZones[0]).toMatchObject({
      x: -5.5,
      z: 1,
      width: 5,
      depth: 4,
      color: '#ff0000',
    });
    expect(sourcePlan.layout.answerZones[0].x).toBe(-7.5);
  });

  it('maps a transformed scene object to a configured floor-plan range and footprint', () => {
    const sourcePlan = {
      layout: {
        arena: { minX: -20, maxX: 20, minZ: -18, maxZ: 16 },
        stage: { width: 10, depth: 4, footprint: [[-5, -2], [5, -2], [0, 4]] },
      },
    };
    const scene = new Group();
    const arena = new Group();
    arena.position.set(2, 0, 3);
    arena.scale.set(1.5, 1, 2);
    arena.userData.floorPlanBinding = {
      path: ['layout', 'arena'],
      fields: { range: { x: ['minX', 'maxX'], z: ['minZ', 'maxZ'] } },
      baseScale: [1, 1, 1],
      baseValues: { minX: -20, maxX: 20, minZ: -18, maxZ: 16 },
    };
    scene.add(arena);
    const stage = new Group();
    stage.scale.set(2, 1, 0.5);
    stage.userData.floorPlanBinding = {
      path: ['layout', 'stage'],
      fields: {
        scale: { x: 'width', z: 'depth' },
        footprint: 'footprint',
      },
      baseScale: [1, 1, 1],
      baseValues: { width: 10, depth: 4 },
      baseFootprint: sourcePlan.layout.stage.footprint,
    };
    scene.add(stage);

    const { plan } = updateFloorPlanFromScene(sourcePlan, scene);

    expect(plan.layout.arena).toEqual({ minX: -28, maxX: 32, minZ: -31, maxZ: 37 });
    expect(plan.layout.stage.footprint).toEqual([[-10, -1], [10, -1], [0, 2]]);
  });

  it('accounts for exporter rotation offsets when writing configured rotation values', () => {
    const scene = new Group();
    const gate = new Group();
    gate.rotation.y = Math.PI + 0.35;
    gate.userData.floorPlanBinding = {
      path: ['layout', 'gate'],
      fields: { rotationY: { property: 'rotationY', offset: Math.PI } },
      baseRotationY: Math.PI,
    };
    scene.add(gate);

    const { plan } = updateFloorPlanFromScene({ layout: { gate: {} } }, scene);

    expect(plan.layout.gate.rotationY).toBeCloseTo(0.35);
  });
});
