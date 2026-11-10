import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  BoxGeometry,
  CircleGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Scene,
  TorusGeometry,
} from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { buildConcertScene } from './export-concert-floor-plan.js';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const sourceDirectory = resolve(scriptDirectory, '../src');
const defaultOutputDirectory = resolve(scriptDirectory, '../exports');
const floorPlans = [
  { name: 'office', file: 'floor-plan.json' },
  { name: 'werewolf', file: 'werewolf-floor-plan.json' },
  { name: 'quiz', file: 'quiz-floor-plan.json' },
  { name: 'lucky-number', file: 'lucky-floor-plan.json' },
  { name: 'teams', file: 'teams-floor-plan.json' },
  { name: 'chess-room', file: 'chess-floor-plan.json' },
  { name: 'sabitech', file: 'sabitech-floor-plan.json' },
  { name: 'concert', file: 'concert-floor-plan.json' },
];

function material(color, options = {}) {
  return new MeshStandardMaterial({
    color: color || '#777777',
    roughness: 0.82,
    metalness: 0.05,
    side: DoubleSide,
    ...options,
  });
}

function addBox(parent, name, size, position, color, options = {}) {
  const mesh = new Mesh(new BoxGeometry(...size), material(color, options.material));
  mesh.name = name;
  mesh.position.set(...position);
  if (options.rotation) mesh.rotation.set(...options.rotation);
  parent.add(mesh);
  return mesh;
}

function addCylinder(parent, name, radiusTop, radiusBottom, height, position, color, segments = 16) {
  const mesh = new Mesh(
    new CylinderGeometry(radiusTop, radiusBottom, height, segments),
    material(color),
  );
  mesh.name = name;
  mesh.position.set(...position);
  parent.add(mesh);
  return mesh;
}

function addPlane(parent, name, width, depth, position, color) {
  const mesh = new Mesh(new PlaneGeometry(width, depth), material(color));
  mesh.name = name;
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(...position);
  parent.add(mesh);
  return mesh;
}

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

function addChair(parent, name, x, z, seatColor = '#7f8fa5', backColor = '#6d7b8d', rotation = 0) {
  const chair = new Group();
  chair.name = name;
  chair.position.set(x, 0, z);
  chair.rotation.y = rotation;
  parent.add(chair);
  addBox(chair, `${name} Seat`, [0.8, 0.12, 0.8], [0, 0.45, 0], seatColor);
  addBox(chair, `${name} Back`, [0.72, 0.75, 0.12], [0, 0.8, -0.18], backColor);
  addBox(chair, `${name} Base`, [0.75, 0.45, 0.12], [0, 0.2, 0.38], backColor);
}

function addTable(parent, name, x, z, width, depth, color = '#a97852') {
  const table = new Group();
  table.name = name;
  table.position.set(x, 0, z);
  parent.add(table);
  addBox(table, `${name} Top`, [width, 0.14, depth], [0, 0.82, 0], color);
  const legX = width * 0.41;
  const legZ = depth * 0.35;
  for (const [index, [dx, dz]] of [
    [-legX, -legZ], [legX, -legZ], [-legX, legZ], [legX, legZ],
  ].entries()) {
    addBox(table, `${name} Leg ${index + 1}`, [0.08, 0.68, 0.08], [dx, 0.36, dz], '#555b59');
  }
  return table;
}

function addFloorAndBoundary(scene, plan) {
  const { floor, bounds, entrance } = plan;
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerZ = (bounds.minZ + bounds.maxZ) / 2;
  const base = addPlane(scene, 'Floor Base', floor.width, floor.depth, [centerX, 0, centerZ], floor.baseColor);
  bindFloorPlanObject(base, ['floor'], {
    scale: { x: 'width', z: 'depth' },
    color: 'baseColor',
  }, plan);
  const surface = addPlane(scene, 'Floor Surface', floor.surfaceWidth ?? floor.width, floor.surfaceDepth ?? floor.depth, [centerX, 0.015, centerZ], floor.surfaceColor);
  bindFloorPlanObject(surface, ['floor'], {
    scale: { x: 'surfaceWidth', z: 'surfaceDepth' },
    color: 'surfaceColor',
  }, plan);
  if (floor.entryStrip) {
    const strip = addPlane(
      scene,
      'Entrance Floor Strip',
      floor.entryStrip.width,
      floor.entryStrip.depth,
      [floor.entryStrip.x, 0.025, floor.entryStrip.z],
      floor.entryStrip.color,
    );
    bindFloorPlanObject(strip, ['floor', 'entryStrip'], {
      position: { x: 'x', z: 'z' },
      scale: { x: 'width', z: 'depth' },
      color: 'color',
    }, plan);
  }

  const wallColor = plan.theme?.wallColor || '#c7d5de';
  const wallHeight = 3;
  const wallThickness = 0.25;
  const wall = (name, width, depth, x, z) => addBox(
    scene,
    name,
    [width, wallHeight, depth],
    [x, wallHeight / 2, z],
    wallColor,
  );
  const gap = entrance?.wallSide === 'right' ? entrance.wallGap : null;
  wall('West Boundary Wall', wallThickness, bounds.maxZ - bounds.minZ, bounds.minX, centerZ);
  wall('North Boundary Wall', bounds.maxX - bounds.minX, wallThickness, centerX, bounds.minZ);
  wall('South Boundary Wall', bounds.maxX - bounds.minX, wallThickness, centerX, bounds.maxZ);
  if (gap) {
    if (gap.minZ > bounds.minZ) {
      wall('East Boundary Wall North', wallThickness, gap.minZ - bounds.minZ, bounds.maxX, (gap.minZ + bounds.minZ) / 2);
    }
    if (gap.maxZ < bounds.maxZ) {
      wall('East Boundary Wall South', wallThickness, bounds.maxZ - gap.maxZ, bounds.maxX, (gap.maxZ + bounds.maxZ) / 2);
    }
  } else {
    wall('East Boundary Wall', wallThickness, bounds.maxZ - bounds.minZ, bounds.maxX, centerZ);
  }
  if (entrance?.floorPatch) {
    const patch = entrance.floorPatch;
    addPlane(scene, 'Entrance Floor Patch', patch.width, patch.depth, [patch.x, 0.035, patch.z], '#b7c9b8');
  }
}

function addWorkstations(scene, plan) {
  const { columns, islands, desk, chairOffset } = plan.workstations;
  islands.forEach(({ rows }, islandIndex) => {
    columns.forEach((x, columnIndex) => rows.forEach((z, rowIndex) => {
      const rotation = rowIndex === 0 ? 0 : Math.PI;
      const name = `Workstation ${islandIndex + 1}-${columnIndex + 1}-${rowIndex + 1}`;
      const table = addTable(scene, `${name} Desk`, x, z, desk.width, desk.depth);
      table.rotation.y = rotation;
      addBox(scene, `${name} Monitor`, [0.72, 0.42, 0.06], [x, 1.04, z - 0.25], '#30434a');
      const chairZ = z + (rowIndex === 0 ? -chairOffset : chairOffset);
      addChair(scene, `${name} Chair`, x, chairZ, undefined, undefined, rotation);
    }));
  });
}

function addMeetingRooms(scene, rooms) {
  rooms.forEach((room, index) => {
    const { x, z, width, depth, doorWidth, wallHeight, wallThickness, table } = room;
    const name = room.name || `Meeting Room ${index + 1}`;
    const halfWidth = width / 2;
    const halfDepth = depth / 2;
    const segmentWidth = (width - doorWidth) / 2;
    addBox(scene, `${name} Floor`, [width, 0.12, depth], [x, 0.07, z], '#d9e2dc');
    addBox(scene, `${name} North Wall`, [width, wallHeight, wallThickness], [x, wallHeight / 2, z - halfDepth], '#c7d5de');
    addBox(scene, `${name} West Wall`, [wallThickness, wallHeight, depth], [x - halfWidth, wallHeight / 2, z], '#c7d5de');
    addBox(scene, `${name} East Wall`, [wallThickness, wallHeight, depth], [x + halfWidth, wallHeight / 2, z], '#c7d5de');
    for (const side of [-1, 1]) {
      addBox(
        scene,
        `${name} Door-side Wall ${side}`,
        [segmentWidth, wallHeight, wallThickness],
        [x + side * (doorWidth / 2 + segmentWidth / 2), wallHeight / 2, z + halfDepth],
        '#c7d5de',
      );
    }
    addTable(scene, `${name} Table`, x + table.x, z + table.z, table.width, table.depth, '#967252');
  });
}

function addWerewolfLayout(scene, plan) {
  const { layout, theme } = plan;
  const { ritualCircle: circle, seating, altar } = layout;
  const floor = new Mesh(new CircleGeometry(1, 72), material(circle.floorColor));
  floor.name = 'Ritual Circle Floor';
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(circle.x, 0.045, circle.z);
  floor.scale.setScalar(circle.radius);
  bindFloorPlanObject(floor, ['layout', 'ritualCircle'], {
    position: { x: 'x', z: 'z' },
    scale: { x: 'radius', z: 'radius' },
    color: 'floorColor',
  }, plan);
  scene.add(floor);
  const ring = new Mesh(
    new TorusGeometry(circle.radius * 0.96, 0.075, 8, 80),
    material(circle.edgeColor, { emissive: circle.edgeColor, emissiveIntensity: circle.edgeEmissive ?? 0.45 }),
  );
  ring.name = 'Ritual Circle Edge';
  ring.rotation.x = Math.PI / 2;
  ring.position.set(circle.x, 0.09, circle.z);
  scene.add(ring);
  const rune = new Mesh(
    new TorusGeometry(circle.radius * 0.775, circle.radius * 0.015, 8, 72),
    material(circle.runeColor, { emissive: circle.runeColor, emissiveIntensity: circle.runeEmissive ?? 0.28 }),
  );
  rune.name = 'Ritual Circle Rune Ring';
  rune.rotation.x = Math.PI / 2;
  rune.position.set(circle.x, 0.075, circle.z);
  scene.add(rune);

  for (let index = 0; index < seating.count; index += 1) {
    const angle = (index / seating.count) * Math.PI * 2;
    addChair(
      scene,
      `Council Chair ${index + 1}`,
      circle.x + Math.cos(angle) * seating.radius,
      circle.z + Math.sin(angle) * seating.radius,
      seating.seatColor,
      seating.backColor,
      -angle - Math.PI / 2,
    );
  }
  addBox(scene, 'Altar Stone', [altar.width, altar.height * 0.76, altar.depth], [altar.x, altar.height * 0.38, altar.z], altar.stoneColor);
  addBox(scene, 'Altar Top', [altar.width * 1.12, 0.18, altar.depth * 1.12], [altar.x, altar.height * 0.82, altar.z], altar.topColor);
  addCylinder(scene, 'Altar Obelisk', 0, 0.36, 1.12, [altar.x, altar.height + 0.62, altar.z], theme.runeColor, 5);
  layout.candles.forEach((candle, index) => {
    addCylinder(scene, `Candle ${index + 1}`, 0.12, 0.16, candle.height * 0.68, [candle.x, candle.height * 0.34, candle.z], theme.candleWax || '#b5a681', 8);
    addCylinder(scene, `Candle Flame ${index + 1}`, 0.1, 0.1, 0.18, [candle.x, candle.height * 0.76, candle.z], theme.candleLight || '#e4a85d', 8);
  });
  layout.pillars.forEach((pillar, index) => {
    addCylinder(scene, `Pillar ${index + 1}`, pillar.radius * 0.72, pillar.radius, pillar.height, [pillar.x, pillar.height / 2, pillar.z], theme.pillarColor, 8);
    addCylinder(scene, `Pillar ${index + 1} Cap`, pillar.radius * 1.25, pillar.radius * 1.25, 0.24, [pillar.x, pillar.height + 0.12, pillar.z], theme.pillarColor, 8);
  });
}

function addQuizLayout(scene, plan) {
  const { layout } = plan;
  const { chest, answerZones, pigPen } = layout;
  const chestGroup = new Group();
  chestGroup.name = 'Question Chest';
  chestGroup.position.set(chest.x, 0, chest.z);
  bindFloorPlanObject(chestGroup, ['layout', 'chest'], { position: { x: 'x', z: 'z' } }, plan);
  scene.add(chestGroup);
  addBox(chestGroup, 'Question Chest Body', [chest.width, 1.1, chest.depth], [0, 0.62, 0], '#835b37');
  addBox(chestGroup, 'Question Chest Lid', [chest.width * 1.08, 0.14, chest.depth * 1.08], [0, 1.2, 0], '#c18a45');
  answerZones.forEach((zone, index) => {
    const area = addPlane(
      scene,
      `Answer Zone ${zone.answer}`,
      1,
      1,
      [zone.x, 0.045, zone.z],
      zone.color,
    );
    area.scale.set(zone.width, 1, zone.depth);
    bindFloorPlanObject(area, ['layout', 'answerZones', index], {
      position: { x: 'x', z: 'z' },
      scale: { x: 'width', z: 'depth' },
      color: 'color',
    }, plan);
  });
  const pen = [
    [pigPen.x, pigPen.z - pigPen.depth / 2, pigPen.width, 0.16],
    [pigPen.x, pigPen.z + pigPen.depth / 2, pigPen.width, 0.16],
    [pigPen.x - pigPen.width / 2, pigPen.z, 0.16, pigPen.depth],
    [pigPen.x + pigPen.width / 2, pigPen.z, 0.16, pigPen.depth],
  ];
  pen.forEach(([x, z, width, depth], index) => {
    addBox(scene, `Pig Pen Fence ${index + 1}`, [width, 0.8, depth], [x, 0.4, z], '#98745f');
  });
}

function addChessLayout(scene, plan) {
  const { layout } = plan;
  layout.tables.forEach((table, tableIndex) => {
    const surfaceWidth = table.type === 'caro' ? 1.6 : 1.8;
    const surfaceDepth = table.type === 'caro' ? 1.6 : 2;
    const height = 0.82;
    const chessTable = addTable(scene, `${table.label} Table ${table.id}`, table.x, table.z, surfaceWidth, surfaceDepth, '#967252');
    bindFloorPlanObject(chessTable, ['layout', 'tables', tableIndex], {
      position: { x: 'x', z: 'z' },
      rotationY: 'rotationY',
    }, plan);
    const squares = table.type === 'caro' ? 9 : 8;
    const cellWidth = surfaceWidth / squares;
    const cellDepth = surfaceDepth / squares;
    for (let row = 0; row < squares; row += 1) {
      for (let column = 0; column < squares; column += 1) {
        addBox(
          scene,
          `${table.id} Board Cell ${row + 1}-${column + 1}`,
          [cellWidth, 0.025, cellDepth],
          [table.x - surfaceWidth / 2 + (column + 0.5) * cellWidth, height + 0.085, table.z - surfaceDepth / 2 + (row + 0.5) * cellDepth],
          (row + column) % 2 ? '#f0d9a5' : '#735638',
        );
      }
    }
    table.seats.forEach((seat, index) => addChair(
      scene,
      `${table.id} Seat ${index + 1}`,
      table.x + seat.dx,
      table.z + seat.dz,
      '#8b6914',
      '#6b4c2a',
      seat.rotation,
    ));
  });
  layout.decorPillars.forEach((pillar, index) => {
    addCylinder(scene, `Decorative Pillar ${index + 1}`, 0.28, 0.34, 4.2, [pillar.x, 2.1, pillar.z], '#a89268', 8);
  });
}

function addStandardLayout(scene, plan) {
  const layout = plan.layout || {};
  if (layout.kind === 'werewolf') addWerewolfLayout(scene, plan);
  if (layout.kind === 'quiz') addQuizLayout(scene, plan);
  if (layout.kind === 'lucky-number') {
    const wheel = layout.wheel;
    const wheelGroup = new Group();
    wheelGroup.name = 'Lucky Number Wheel';
    wheelGroup.position.set(wheel.x, 0, wheel.z);
    bindFloorPlanObject(wheelGroup, ['layout', 'wheel'], {
      position: { x: 'x', z: 'z' },
      scale: { x: 'radius', z: 'radius' },
    }, plan);
    scene.add(wheelGroup);
    addCylinder(wheelGroup, 'Lucky Wheel Base', wheel.radius, wheel.radius * 0.92, 0.32, [0, 0.48, 0], '#d6a64d', 48);
    addCylinder(wheelGroup, 'Lucky Wheel Face', wheel.radius * 0.82, wheel.radius * 0.82, 0.12, [0, 0.68, 0], '#416c5a', 12);
    addCylinder(wheelGroup, 'Lucky Wheel Pointer', 0, 0.34, 0.72, [0, 1.05, 0], '#e9c977', 8);
  }
  if (layout.kind === 'teams') {
    const platform = layout.startPlatform;
    const platformGroup = new Group();
    platformGroup.name = 'Team Start Platform';
    platformGroup.position.set(platform.x, 0, platform.z);
    bindFloorPlanObject(platformGroup, ['layout', 'startPlatform'], {
      position: { x: 'x', z: 'z' },
      scale: { x: 'width', z: 'depth' },
    }, plan);
    scene.add(platformGroup);
    addBox(platformGroup, 'Team Start Platform Base', [platform.width, 0.3, platform.depth], [0, 0.15, 0], '#836345');
    addBox(platformGroup, 'Team Start Platform Top', [platform.width * 0.8, 0.16, platform.depth * 0.8], [0, 0.38, 0], '#d9b366');
    if (layout.arena) {
      const arena = layout.arena;
      const width = arena.maxX - arena.minX;
      const depth = arena.maxZ - arena.minZ;
      const x = (arena.minX + arena.maxX) / 2;
      const z = (arena.minZ + arena.maxZ) / 2;
      const arenaFloor = addPlane(scene, 'Team Arena', width, depth, [x, 0.045, z], '#9eaf9f');
      arenaFloor.name = 'Team Arena';
      bindFloorPlanObject(arenaFloor, ['layout', 'arena'], {
        range: { x: ['minX', 'maxX'], z: ['minZ', 'maxZ'] },
      }, plan);
      arenaFloor.material.transparent = true;
      arenaFloor.material.opacity = 0.34;
    }
  }
  if (layout.kind === 'chess-room') addChessLayout(scene, plan);
}

function buildRoomScene(plan) {
  const scene = new Scene();
  scene.name = plan.layout?.title || 'Office Floor Plan';
  addFloorAndBoundary(scene, plan);
  addWorkstations(scene, plan);
  addMeetingRooms(scene, plan.meetingRooms);
  if (plan.layout?.kind !== 'office') addStandardLayout(scene, plan);
  scene.userData.floorPlanRoundTrip = { version: 1, floorName: plan.layout?.kind || 'office', plan };
  return scene;
}

function buildSabitechScene(plan) {
  const scene = new Scene();
  scene.name = 'SabiTech Multi-floor Building';
  const roomSize = 16;
  const halfRoom = roomSize / 2;
  const floorHeight = 4;
  const wallThickness = 0.3;

  plan.floors.forEach((floor) => {
    const group = new Group();
    group.name = `${floor.id} ${floor.label}`;
    const floorIndex = plan.floors.indexOf(floor);
    bindFloorPlanObject(group, ['floors', floorIndex], { position: { y: 'y' } }, plan);
    group.position.y = floor.y;
    scene.add(group);
    const y = 0;
    addPlane(group, `${floor.label} Floor`, roomSize, roomSize, [0, y, 0], floor.floorColor);
    addPlane(group, `${floor.label} Ceiling`, roomSize, roomSize, [0, y + floorHeight, 0], floor.ceilingColor);
    addBox(group, `${floor.label} North Wall`, [roomSize, floorHeight, wallThickness], [0, y + floorHeight / 2, -halfRoom], floor.wallColor);
    addBox(group, `${floor.label} West Wall`, [wallThickness, floorHeight, roomSize], [-halfRoom, y + floorHeight / 2, 0], floor.wallColor);
    addBox(group, `${floor.label} East Wall`, [wallThickness, floorHeight, roomSize], [halfRoom, y + floorHeight / 2, 0], floor.wallColor);
    let southX = -halfRoom;
    const openings = [];
    if (floor.elevator) openings.push({ x: -2.65, width: 1.9 });
    if (floor.elevatorDown) openings.push({ x: 2.65, width: 1.9 });
    openings.sort((a, b) => a.x - b.x);
    openings.forEach(({ x, width }, index) => {
      const start = x - width / 2;
      const end = x + width / 2;
      if (start > southX) {
        addBox(group, `${floor.label} South Wall ${index + 1}`, [start - southX, floorHeight, wallThickness], [(start + southX) / 2, y + floorHeight / 2, halfRoom], floor.wallColor);
      }
      southX = end;
    });
    if (southX < halfRoom) {
      addBox(group, `${floor.label} South Wall End`, [halfRoom - southX, floorHeight, wallThickness], [(halfRoom + southX) / 2, y + floorHeight / 2, halfRoom], floor.wallColor);
    }
    [[-6.5, -6.5], [6.5, -6.5], [-6.5, 6.5], [6.5, 6.5]].forEach(([x, z], index) => {
      addBox(group, `${floor.label} Corner Pillar ${index + 1}`, [0.4, floorHeight, 0.4], [x, y + floorHeight / 2, z], floor.accentColor);
    });
    floor.panels.forEach((panel) => {
      const board = new Group();
      board.name = `${floor.label} Panel ${panel.id} ${panel.title}`;
      board.position.set(panel.x, panel.y, panel.z);
      board.rotation.y = panel.rotationY;
      bindFloorPlanObject(board, ['floors', floorIndex, 'panels', floor.panels.indexOf(panel)], {
        position: { x: 'x', y: 'y', z: 'z' },
        rotationY: 'rotationY',
      }, plan);
      group.add(board);
      addBox(board, `${board.name} Frame`, [panel.width + 0.08, panel.height + 0.08, 0.07], [0, 0, -0.035], panel.accentColor || floor.accentColor);
      addBox(board, `${board.name} Face`, [panel.width, panel.height, 0.025], [0, 0, 0.015], panel.bgColor || '#f5f8fc');
    });
    for (const [index, x] of [-4.5, 0, 4.5].entries()) {
      addBox(group, `${floor.label} Ceiling Light ${index + 1}`, [2.4, 0.08, 0.48], [x, y + floorHeight - 0.09, -2], '#ffffff', { material: { emissive: '#ffffff', emissiveIntensity: 0.25 } });
    }
  });
  scene.userData.floorPlanRoundTrip = { version: 1, floorName: 'sabitech', plan };
  return scene;
}

function readPlan(floor) {
  const file = floor.file;
  const plan = JSON.parse(readFileSync(resolve(sourceDirectory, file), 'utf8'));
  return { ...floor, plan };
}

function buildScene(floor) {
  if (floor.name === 'concert') return buildConcertScene(floor.plan);
  if (floor.name === 'sabitech') return buildSabitechScene(floor.plan);
  return buildRoomScene(floor.plan);
}

async function exportFloor(floor, outputPath) {
  const scene = buildScene(floor);
  scene.userData.floorPlanRoundTrip = { version: 1, floorName: floor.name, plan: floor.plan };
  const glb = await new GLTFExporter().parseAsync(scene, {
    binary: true,
    onlyVisible: true,
    trs: false,
  });
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, Buffer.from(glb));
  console.log(`Exported ${floor.name} to ${outputPath}`);
}

function parseArguments(args) {
  let selected = null;
  let outputPath = null;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--help' || argument === '-h') {
      console.log('Usage: npm run export:floor -- <floor-name> [--output <file-or-directory>]');
      console.log('       npm run export:all-floors -- [--output <directory>]');
      console.log(`Floors: ${floorPlans.map(({ name }) => name).join(', ')}`);
      process.exit(0);
    }
    if (argument === '--all') {
      selected = 'all';
      continue;
    }
    if (argument === '--output' || argument === '-o') {
      const value = args[index + 1];
      if (!value || value.startsWith('-')) throw new Error(`${argument} requires a path.`);
      outputPath = resolve(process.cwd(), value);
      index += 1;
      continue;
    }
    if (argument.startsWith('-')) throw new Error(`Unknown argument: ${argument}`);
    if (selected) throw new Error('Specify one floor name or --all, not both.');
    selected = argument.toLowerCase();
  }
  return { selected, outputPath };
}

async function main() {
  const { selected, outputPath } = parseArguments(process.argv.slice(2));
  if (!selected) throw new Error('Specify a floor name or use --all.');
  if (selected !== 'all' && !floorPlans.some(({ name }) => name === selected)) {
    throw new Error(`Unknown floor "${selected}". Available floors: ${floorPlans.map(({ name }) => name).join(', ')}.`);
  }

  if (selected === 'all') {
    const outputDirectory = outputPath || resolve(defaultOutputDirectory, 'floors');
    for (const floor of floorPlans) {
      await exportFloor(readPlan(floor), resolve(outputDirectory, `${floor.name}.glb`));
    }
    return;
  }

  const floor = readPlan(floorPlans.find(({ name }) => name === selected));
  const destination = outputPath || resolve(defaultOutputDirectory, `${floor.name}.glb`);
  await exportFloor(floor, destination);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`Floor plan GLB export failed: ${error.message}`);
    process.exitCode = 1;
  });
}
