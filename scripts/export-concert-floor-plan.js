import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  BoxGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Scene,
  Shape,
} from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const floorPlanPath = resolve(scriptDirectory, '../src/concert-floor-plan.json');
const defaultOutputPath = resolve(scriptDirectory, '../public/models/ATVNCG2026-D1-2.glb');

function bindFloorPlanObject(object, path, fields, plan) {
  const source = path.reduce((current, key) => current?.[key], plan);
  const properties = new Set([
    ...Object.values(fields.scale || {}),
    ...Object.values(fields.range || {}).flat(),
  ]);
  object.userData.floorPlanBinding = {
    path,
    fields,
    baseScale: object.scale.toArray(),
    baseRotationY: object.rotation.y,
    baseFootprint: fields.footprint ? source?.[fields.footprint] : undefined,
    baseValues: Object.fromEntries(
      [...properties]
        .filter((property) => typeof property === 'string' && Number.isFinite(source?.[property]))
        .map((property) => [property, source[property]]),
    ),
  };
  return object;
}

if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class NodeFileReader {
    result = null;
    onloadend = null;
    onerror = null;

    readAsArrayBuffer(blob) {
      blob.arrayBuffer()
        .then((buffer) => {
          this.result = buffer;
          this.onloadend?.();
        })
        .catch((error) => {
          this.error = error;
          this.onerror?.(error);
        });
    }

    readAsDataURL(blob) {
      blob.arrayBuffer()
        .then((buffer) => {
          this.result = `data:${blob.type};base64,${Buffer.from(buffer).toString('base64')}`;
          this.onloadend?.();
        })
        .catch((error) => {
          this.error = error;
          this.onerror?.(error);
        });
    }
  };
}

function createMaterial(color, options = {}) {
  return new MeshStandardMaterial({
    color: color || '#777777',
    roughness: 0.82,
    metalness: 0.05,
    side: DoubleSide,
    ...options,
  });
}

function addBox(parent, name, dimensions, position, color, options = {}) {
  const mesh = new Mesh(
    new BoxGeometry(...dimensions),
    createMaterial(color, options.material),
  );
  mesh.name = name;
  mesh.position.set(...position);
  if (options.rotation) mesh.rotation.set(...options.rotation);
  parent.add(mesh);
  return mesh;
}

function createFootprintGeometry(footprint, height) {
  const shape = new Shape();
  footprint.forEach(([x, z], index) => {
    if (index === 0) shape.moveTo(x, -z);
    else shape.lineTo(x, -z);
  });
  shape.closePath();
  const geometry = new ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

function addRakedBlock(parent, block, binding = null) {
  const group = new Group();
  group.name = block.name;
  group.position.set(block.x, 0, block.z);
  group.rotation.y = block.rotationY ?? 0;
  if (binding) bindFloorPlanObject(group, binding.path, binding.fields, binding.plan);
  parent.add(group);

  const rise = Math.min(block.depth * 0.18, 3.2);
  if (block.footprint) {
    const mesh = new Mesh(createFootprintGeometry(block.footprint, rise), createMaterial(block.color));
    mesh.name = `${block.name} Footprint`;
    group.add(mesh);
  } else {
    addBox(
      group,
      `${block.name} Platform`,
      [block.width, rise, block.depth],
      [0, rise / 2 + 0.1, 0],
      block.color,
      { rotation: [Math.PI * 0.03, 0, 0] },
    );
    addBox(group, `${block.name} Front Trim`, [block.width, 0.24, 0.4], [0, 0.12, block.depth / 2], block.color);
  }
}

function addTierBlock(parent, block, baseY) {
  const group = new Group();
  group.name = block.name;
  group.position.set(block.x, 0, block.z);
  parent.add(group);

  addBox(group, `${block.name} Riser`, [block.width, baseY, block.depth], [0, baseY / 2, 0], block.color);
  addBox(group, `${block.name} Deck`, [block.width, 0.1, block.depth], [0, baseY + 0.05, 0], block.color);
  addBox(
    group,
    `${block.name} Front Trim`,
    [block.width, 0.26, 0.4],
    [0, baseY + 0.1, block.depth / 2],
    block.color,
    { material: { emissive: block.color, emissiveIntensity: 0.35 } },
  );
}

function addRunwaySegment(parent, name, runway, x, width, zStart, zEnd, height) {
  const length = zEnd - zStart;
  if (width <= 0 || length <= 0) return;
  addBox(parent, name, [width, 0.22, length], [x, height - 0.11, (zStart + zEnd) / 2], runway.color);
}

function addAccessStairs(parent, stairs, baseHeight, tierStep, name = 'Access Stairs') {
  const startHeight = baseHeight + stairs.fromTier * tierStep;
  const endHeight = baseHeight + stairs.toTier * tierStep + (stairs.toHeightOffset ?? 0);
  const length = stairs.zEnd - stairs.zStart;
  const rise = endHeight - startHeight;
  const stepCount = Math.max(4, Math.ceil(rise / 0.3));
  const group = new Group();
  group.name = name;
  parent.add(group);

  for (let index = 0; index < stepCount; index += 1) {
    const stepHeight = rise * (index + 1) / stepCount;
    const stepDepth = length / stepCount;
    const z = stairs.zStart + stepDepth * (index + 0.5);
    addBox(
      group,
      `${name} Step ${index + 1}`,
      [stairs.spanWidth, stepHeight, stepDepth + 0.04],
      [stairs.x, startHeight + stepHeight / 2, z],
      stairs.color,
    );
  }
}

function addStandingTribune(parent, tribune, index) {
  const group = new Group();
  group.name = `Standing Tribune ${index + 1}`;
  group.position.set(tribune.x, 0, tribune.z);
  group.rotation.y = tribune.rotationY ?? 0;
  parent.add(group);

  const widths = tribune.columns.map((column) => column.width ?? tribune.width / tribune.columns.length);
  const totalWidth = widths.reduce((total, width) => total + width, 0);
  tribune.columns.forEach((column, columnIndex) => {
    const width = widths[columnIndex];
    const precedingWidth = widths.slice(0, columnIndex).reduce((total, item) => total + item, 0);
    const x = -totalWidth / 2 + precedingWidth + width / 2;
    const depth = column.depth ?? tribune.depth;
    const z = column.dz ?? 0;
    const area = new Group();
    area.name = column.name;
    area.position.set(x, tribune.floorHeight ?? 0, z);
    group.add(area);

    const footprint = column.footprint ?? [
      [-(width - 0.6) / 2, -(depth - 0.6) / 2],
      [(width - 0.6) / 2, -(depth - 0.6) / 2],
      [(width - 0.6) / 2, (depth - 0.6) / 2],
      [-(width - 0.6) / 2, (depth - 0.6) / 2],
    ];
    const floor = new Mesh(createFootprintGeometry(footprint, 0.12), createMaterial(column.color));
    floor.name = `${column.name} Floor`;
    area.add(floor);

    const fenceHeight = tribune.fenceHeight ?? 0.5;
    const gateWidth = tribune.gateWidth ?? 3;
    footprint.forEach(([startX, startZ], edgeIndex) => {
      const [endX, endZ] = footprint[(edgeIndex + 1) % footprint.length];
      const dx = endX - startX;
      const dz = endZ - startZ;
      const length = Math.hypot(dx, dz);
      const entrance = edgeIndex === 0;
      const opening = entrance ? Math.min(gateWidth, length * 0.45) : 0;
      const segmentLength = entrance ? (length - opening) / 2 : length;
      const segmentCount = entrance ? 2 : 1;
      for (let segment = 0; segment < segmentCount; segment += 1) {
        const startDistance = entrance && segment === 1 ? (length + opening) / 2 : 0;
        const actualLength = entrance ? segmentLength : length;
        const distance = startDistance + actualLength / 2;
        const fence = addBox(
          area,
          `${column.name} Fence ${edgeIndex + 1}-${segment + 1}`,
          [actualLength, fenceHeight, 0.12],
          [
            startX + (dx / length) * distance,
            fenceHeight / 2,
            startZ + (dz / length) * distance,
          ],
          '#777777',
        );
        fence.rotation.y = Math.atan2(-dz, dx);
      }
    });
  });
}

function addStage(scene, stage) {
  const group = new Group();
  group.name = 'Stage';
  group.position.set(stage.x, 0, stage.z);
  bindFloorPlanObject(group, ['layout', 'stage'], {
    position: { x: 'x', z: 'z' },
    rotationY: 'rotationY',
    scale: { x: 'width', z: 'depth' },
    footprint: 'footprint',
  }, scene.userData.floorPlanRoundTrip.plan);
  scene.add(group);
  addBox(group, 'Stage Deck', [stage.width, stage.height, stage.depth], [0, stage.height / 2, 0], stage.deckColor);
  addBox(
    group,
    'Stage Front LED Trim',
    [stage.width, 0.3, 0.3],
    [0, stage.height + 0.05, stage.depth / 2],
    stage.glowColor,
    { material: { emissive: stage.glowColor, emissiveIntensity: 1.6 } },
  );
  addBox(
    group,
    'Stage Backdrop Truss',
    [stage.width, 15, 0.8],
    [0, stage.height + 7.5, -stage.depth / 2],
    stage.trussColor,
  );

  if (stage.videoScreen) {
    const screen = stage.videoScreen;
    addBox(
      group,
      'LED Video Screen (static panel in GLB)',
      [screen.width, screen.height, 0.18],
      [screen.x, screen.y, screen.z],
      '#050505',
    );
  }

  if (stage.runway) {
    const runwayZ = stage.depth / 2 + stage.runway.length / 2;
    addBox(
      group,
      'Stage Runway',
      [stage.runway.width, stage.height * 1.4, stage.runway.length],
      [0, stage.height * 0.7, runwayZ],
      stage.deckColor,
    );
    [-1, 1].forEach((side) => {
      addBox(
        group,
        `Stage Runway LED ${side}`,
        [0.25, 0.2, stage.runway.length],
        [side * stage.runway.width / 2, stage.height * 1.42, runwayZ],
        stage.glowColor,
        { material: { emissive: stage.glowColor, emissiveIntensity: 1.4 } },
      );
    });
  }
}

function addGate(scene, gate) {
  if (!gate) return;
  const group = new Group();
  group.name = 'Entrance Gate';
  group.position.set(gate.x, 0, gate.z);
  group.rotation.y = Math.PI;
  bindFloorPlanObject(group, ['layout', 'gate'], {
    position: { x: 'x', z: 'z' },
    rotationY: { property: 'rotationY', offset: Math.PI },
    scale: { x: 'width', y: 'height' },
  }, scene.userData.floorPlanRoundTrip.plan);
  scene.add(group);
  addBox(
    group,
    'Gate Scaffold',
    [gate.width * 1.6, gate.height, 0.6],
    [0, gate.height / 2, -0.8],
    gate.scaffoldColor,
    { material: { wireframe: true, metalness: 0.4, roughness: 0.6 } },
  );
  addBox(
    group,
    'Gate Central Shield',
    [gate.width * 0.42, gate.height * 0.72, 1],
    [0, gate.height * 0.55, 0],
    gate.shieldColor,
  );
  [-1, 1].forEach((side) => {
    addBox(
      group,
      `Gate Side Shield ${side}`,
      [gate.width * 0.26, gate.height * 0.42, 0.8],
      [side * gate.width * 0.5, gate.height * 0.42, 0.2],
      gate.shieldColor,
    );
  });
}

export function buildConcertScene(plan) {
  const { layout, floor } = plan;
  if (layout?.kind !== 'concert') throw new Error('The selected floor plan is not a concert layout.');

  const scene = new Scene();
  scene.name = layout.title || 'Concert Floor Plan';
  scene.userData.floorPlanRoundTrip = { version: 1, floorName: 'concert', plan };
  const ground = new Mesh(
    new PlaneGeometry(floor.surfaceWidth ?? floor.width, floor.surfaceDepth ?? floor.depth),
    createMaterial(floor.surfaceColor ?? floor.baseColor),
  );
  ground.name = 'Venue Floor';
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.12;
  bindFloorPlanObject(ground, ['floor'], {
    scale: { x: 'surfaceWidth', z: 'surfaceDepth' },
    color: 'surfaceColor',
  }, plan);
  scene.add(ground);

  addStage(scene, layout.stage);
  addGate(scene, layout.gate);
  layout.pits?.forEach((pit, index) => addRakedBlock(scene, pit, {
    path: ['layout', 'pits', index],
    fields: {
      position: { x: 'x', z: 'z' },
      rotationY: 'rotationY',
      scale: { x: 'width', z: 'depth' },
      footprint: 'footprint',
    },
    plan,
  }));
  layout.pitRunways?.forEach((runway, index) => {
    const [startX, startZ] = runway.start;
    const [endX, endZ] = runway.end;
    const dx = endX - startX;
    const dz = endZ - startZ;
    const mesh = new Mesh(
      new BoxGeometry(runway.width, 0.22, Math.hypot(dx, dz)),
      createMaterial(runway.color),
    );
    mesh.name = `Pit Runway ${index + 1}`;
    mesh.position.set((startX + endX) / 2, 0.11, (startZ + endZ) / 2);
    mesh.rotation.y = Math.atan2(dx, dz);
    scene.add(mesh);
  });
  layout.standingTribunes?.forEach((tribune, index) => {
    addStandingTribune(scene, tribune, index);
    const group = scene.getObjectByName(`Standing Tribune ${index + 1}`);
    bindFloorPlanObject(group, ['layout', 'standingTribunes', index], {
      position: { x: 'x', z: 'z' },
      rotationY: 'rotationY',
      scale: { x: 'width', z: 'depth' },
    }, plan);
  });

  layout.sideWings?.forEach((wing, wingIndex) => {
    const group = new Group();
    group.name = `${wing.side} Side Wing`;
    group.position.set(wing.x, 0, wing.z);
    group.rotation.y = wing.rotationY ?? 0;
    bindFloorPlanObject(group, ['layout', 'sideWings', wingIndex], {
      position: { x: 'x', z: 'z' },
      rotationY: 'rotationY',
    }, plan);
    scene.add(group);
    wing.blocks.forEach((block, index) => addRakedBlock(group, {
      ...block,
      x: block.dx ?? 0,
      z: block.dz ?? 0,
      width: block.width ?? 16,
      depth: block.depth ?? 10,
    }, {
      path: ['layout', 'sideWings', wingIndex, 'blocks', index],
      fields: {
        position: { x: 'dx', z: 'dz' },
        rotationY: 'rotationY',
        scale: { x: 'width', z: 'depth' },
        footprint: 'footprint',
      },
      plan,
    }));
  });

  const baseHeight = layout.seating?.baseHeight ?? 3;
  const tierStep = layout.seating?.tierStep ?? 1.5;
  if (layout.foh) {
    addTierBlock(scene, {
      name: layout.foh.label ?? 'FOH',
      x: layout.foh.x,
      z: layout.foh.z,
      width: layout.foh.width,
      depth: layout.foh.depth,
      color: layout.foh.color,
    }, baseHeight + (layout.foh.tier ?? 0) * tierStep);
  }
  layout.seatedSections?.forEach((section) => {
    const sectionGroup = new Group();
    sectionGroup.name = section.name;
    scene.add(sectionGroup);
    const height = baseHeight + (section.tier ?? 0) * tierStep;
    section.blocks?.forEach((block) => addTierBlock(sectionGroup, {
      name: block.name,
      x: block.x,
      z: block.z ?? section.z,
      width: block.width,
      depth: block.depth ?? section.depth,
      color: block.color ?? section.color,
    }, height));
  });

  layout.stairs?.forEach((stair, stairIndex) => {
    const topHeight = baseHeight + (stair.topTier ?? 0) * tierStep;
    const length = stair.zEnd - stair.zStart;
    const stepCount = Math.max(6, Math.round(topHeight / 0.35));
    const group = new Group();
    group.name = `Side Stairs ${stairIndex + 1}`;
    scene.add(group);
    for (let index = 0; index < stepCount; index += 1) {
      const stepHeight = topHeight * (index + 1) / stepCount;
      const stepDepth = length / stepCount;
      addBox(
        group,
        `Side Stairs ${stairIndex + 1} Step ${index + 1}`,
        [stair.width, stepHeight, stepDepth + 0.05],
        [stair.x, stepHeight / 2, stair.zStart + stepDepth * (index + 0.5)],
        index % 2 ? '#3a4660' : '#2b3550',
      );
    }
  });

  layout.runways?.forEach((runway, index) => {
    const height = baseHeight + runway.tier * tierStep + (runway.heightOffset ?? 0);
    const stairs = layout.accessStairs?.find((item) => (
      Math.abs(item.x - runway.x) <= (runway.spanWidth + item.spanWidth) / 2
      && item.zStart < runway.zEnd && item.zEnd > runway.zStart
    ));
    const stairsStart = stairs ? Math.max(runway.zStart, stairs.zStart) : runway.zStart;
    const stairsEnd = stairs ? Math.min(runway.zEnd, stairs.zEnd) : runway.zStart;
    const stairsWidth = stairsEnd > stairsStart ? stairs.spanWidth : 0;
    const shoulderWidth = (runway.spanWidth - stairsWidth) / 2;
    if (stairsWidth) {
      [-1, 1].forEach((side) => addRunwaySegment(
        scene, `Seating Runway ${index + 1} Shoulder ${side}`, runway,
        runway.x + side * (stairsWidth / 2 + shoulderWidth / 2), shoulderWidth,
        stairsStart, stairsEnd, height,
      ));
      addRunwaySegment(scene, `Seating Runway ${index + 1} Before Stairs`, runway, runway.x, runway.spanWidth, runway.zStart, stairsStart, height);
      addRunwaySegment(scene, `Seating Runway ${index + 1} After Stairs`, runway, runway.x, runway.spanWidth, stairsEnd, runway.zEnd, height);
    } else {
      addRunwaySegment(scene, `Seating Runway ${index + 1}`, runway, runway.x, runway.spanWidth, runway.zStart, runway.zEnd, height);
    }
  });
  layout.accessStairs?.forEach((stairs, index) => (
    addAccessStairs(scene, stairs, baseHeight, tierStep, `Runway Access Stairs ${index + 1}`)
  ));

  return scene;
}

function getOutputPath(args) {
  let outputPath = defaultOutputPath;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--help' || args[index] === '-h') {
      console.log('Usage: npm run export:concert -- [--output <path>]');
      console.log(`Default output: ${defaultOutputPath}`);
      process.exit(0);
    }
    if (args[index] === '--output' || args[index] === '-o') {
      const value = args[index + 1];
      if (!value || value.startsWith('-')) throw new Error(`${args[index]} requires an output path.`);
      outputPath = resolve(process.cwd(), value);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${args[index]}`);
  }
  return outputPath;
}

async function main() {
  const outputPath = getOutputPath(process.argv.slice(2));
  const plan = JSON.parse(readFileSync(floorPlanPath, 'utf8'));
  const scene = buildConcertScene(plan);
  const glb = await new GLTFExporter().parseAsync(scene, {
    binary: true,
    onlyVisible: true,
    trs: false,
  });
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, Buffer.from(glb));
  console.log(`Exported ${scene.name} to ${outputPath}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`Concert GLB export failed: ${error.message}`);
    process.exitCode = 1;
  });
}
