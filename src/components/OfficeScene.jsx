import { useMemo, useRef, useEffect, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Billboard, Html, OrbitControls, Text } from '@react-three/drei';
import { BufferGeometry, ConeGeometry, DoubleSide, ExtrudeGeometry, Float32BufferAttribute, LineCurve3, MathUtils, Object3D, SRGBColorSpace, Shape, TubeGeometry, Vector3, VideoTexture } from 'three';
import floorPlanDefinition from '../floor-plan.json';
import floorPlanUrl from '../floor-plan.json?url';
import werewolfFloorPlanDefinition from '../werewolf-floor-plan.json';
import werewolfFloorPlanUrl from '../werewolf-floor-plan.json?url';
import quizFloorPlanDefinition from '../quiz-floor-plan.json';
import quizFloorPlanUrl from '../quiz-floor-plan.json?url';
import luckyFloorPlanDefinition from '../lucky-floor-plan.json';
import luckyFloorPlanUrl from '../lucky-floor-plan.json?url';
import teamsFloorPlanDefinition from '../teams-floor-plan.json';
import teamsFloorPlanUrl from '../teams-floor-plan.json?url';
import chessFloorPlanDefinition from '../chess-floor-plan.json';
import chessFloorPlanUrl from '../chess-floor-plan.json?url';
import concertFloorPlanDefinition from '../concert-floor-plan.json';
import concertFloorPlanUrl from '../concert-floor-plan.json?url';
import { getDefaultSpawn } from '../game/floor-plan';
import { getConcertBoundarySegments } from '../game/concert-boundary.js';
import {
  getConcertStandingBoundaryObstacles,
  getStandingAreaFenceSegments,
} from '../game/concert-standing-boundary.js';
import { getBeamLineFixtures, getBeamPerimeterFixtures } from '../game/concert-lighting.js';
import { buildPath, isBlocked } from '../game/pathfinding';
import { DEFAULT_AVATAR } from '../avatar';
import {
  CaroBoardSurface,
  XiangqiBoardSurface,
  ChessBoardSurface,
  DongtayBoardSurface,
} from './chess-pieces-3d.jsx';
import ConcertVideoScreen from './ConcertVideoScreen.jsx';

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function validateFloorPlan(plan) {
  const validBounds = plan?.bounds
    && Number.isFinite(plan.bounds.minX)
    && Number.isFinite(plan.bounds.maxX)
    && Number.isFinite(plan.bounds.minZ)
    && Number.isFinite(plan.bounds.maxZ)
    && plan.bounds.minX < plan.bounds.maxX
    && plan.bounds.minZ < plan.bounds.maxZ;
  const validWorkstations = Array.isArray(plan?.workstations?.columns)
    && Array.isArray(plan.workstations.islands)
    && plan.workstations.islands.every((island) => Array.isArray(island.rows) && island.rows.length === 2);
  const validEntrance = plan?.entrance == null || typeof plan.entrance === 'object';
  const validSpawnOffsets = plan?.spawnOffsets == null || (Array.isArray(plan.spawnOffsets)
    && plan.spawnOffsets.every((offset) => Number.isFinite(offset.x) && Number.isFinite(offset.z)));
  const defaultSpawn = plan?.entrance?.spawn || plan?.defaultSpawn;
  const validSpawn = !defaultSpawn || (Number.isFinite(defaultSpawn.x) && Number.isFinite(defaultSpawn.z)
    && defaultSpawn.x >= plan.bounds?.minX && defaultSpawn.x <= plan.bounds?.maxX
    && defaultSpawn.z >= plan.bounds?.minZ && defaultSpawn.z <= plan.bounds?.maxZ);

  if (plan?.version !== 1 || !validBounds || !Array.isArray(plan.meetingRooms)
    || !validWorkstations || !validEntrance || !validSpawnOffsets || !validSpawn) {
    throw new Error('Floor plan JSON is missing required fields or has an unsupported version.');
  }

  return plan;
}

function HairCap({ color }) {
  const geometry = useMemo(() => {
    const radius = 0.345;
    const phiSegments = 48;
    const thetaSegments = 16;
    const positions = [];
    const normals = [];
    const indices = [];

    for (let phiIndex = 0; phiIndex <= phiSegments; phiIndex += 1) {
      const phi = (phiIndex / phiSegments) * Math.PI * 2;
      const thetaEnd = 1.2 + ((1 - Math.sin(phi)) / 2) * 0.9;

      for (let thetaIndex = 0; thetaIndex <= thetaSegments; thetaIndex += 1) {
        const theta = (thetaIndex / thetaSegments) * thetaEnd;
        const x = -radius * Math.cos(phi) * Math.sin(theta);
        const y = radius * Math.cos(theta);
        const z = radius * Math.sin(phi) * Math.sin(theta);
        positions.push(x, y, z);
        normals.push(x / radius, y / radius, z / radius);
      }
    }

    for (let phiIndex = 0; phiIndex < phiSegments; phiIndex += 1) {
      for (let thetaIndex = 0; thetaIndex < thetaSegments; thetaIndex += 1) {
        const a = phiIndex * (thetaSegments + 1) + thetaIndex;
        const b = (phiIndex + 1) * (thetaSegments + 1) + thetaIndex;
        const c = b + 1;
        const d = a + 1;
        indices.push(a, d, b, b, d, c);
      }
    }

    const capGeometry = new BufferGeometry();
    capGeometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    capGeometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
    capGeometry.setIndex(indices);
    capGeometry.computeBoundingSphere();
    return capGeometry;
  }, []);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh castShadow position={[0, 1.7, 0]}>
      <primitive object={geometry} attach="geometry" />
      <meshStandardMaterial color={color} side={DoubleSide} />
    </mesh>
  );
}

const DEFAULT_FLOOR_PLAN = validateFloorPlan(floorPlanDefinition);
const DEFAULT_SPAWN = getDefaultSpawn(DEFAULT_FLOOR_PLAN);
const FLOOR_PLAN_CATALOG = {
  office: { definition: DEFAULT_FLOOR_PLAN, url: floorPlanUrl },
  werewolf: { definition: validateFloorPlan(werewolfFloorPlanDefinition), url: werewolfFloorPlanUrl },
  quiz: { definition: validateFloorPlan(quizFloorPlanDefinition), url: quizFloorPlanUrl },
  'lucky-number': { definition: validateFloorPlan(luckyFloorPlanDefinition), url: luckyFloorPlanUrl },
  teams: { definition: validateFloorPlan(teamsFloorPlanDefinition), url: teamsFloorPlanUrl },
  'chess-room': { definition: validateFloorPlan(chessFloorPlanDefinition), url: chessFloorPlanUrl },
  concert: { definition: validateFloorPlan(concertFloorPlanDefinition), url: concertFloorPlanUrl },
};

function getFloorPlanConfig(roomType) {
  return FLOOR_PLAN_CATALOG[roomType] || FLOOR_PLAN_CATALOG.office;
}

function OfficeFloor({ floor, bounds }) {
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerZ = (bounds.minZ + bounds.maxZ) / 2;

  return (
    <group>
      <mesh receiveShadow rotation-x={-Math.PI / 2} position={[centerX, 0, centerZ]}>
        <planeGeometry args={[floor.width, floor.depth]} />
        <meshStandardMaterial color={floor.baseColor} />
      </mesh>

      <mesh receiveShadow rotation-x={-Math.PI / 2} position={[centerX, 0.015, centerZ]}>
        <planeGeometry args={[floor.surfaceWidth, floor.surfaceDepth]} />
        <meshStandardMaterial color={floor.surfaceColor} />
      </mesh>

      {floor.entryStrip && (
        <mesh receiveShadow rotation-x={-Math.PI / 2} position={[floor.entryStrip.x, 0.025, floor.entryStrip.z]}>
          <planeGeometry args={[floor.entryStrip.width, floor.entryStrip.depth]} />
          <meshStandardMaterial color={floor.entryStrip.color} />
        </mesh>
      )}
    </group>
  );
}

function Wall({ position, size, color = '#c7d5de' }) {
  return (
    <mesh position={position} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}

function Table({ position, rotation = 0, width, depth }) {
  const legX = width * 0.41;
  const legZ = depth * 0.35;
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh castShadow receiveShadow position={[0, 0.76, 0]}>
        <boxGeometry args={[width, 0.12, depth]} />
        <meshStandardMaterial color="#a97852" />
      </mesh>
      <mesh castShadow position={[0, 1.04, -0.25]}>
        <boxGeometry args={[0.72, 0.42, 0.06]} />
        <meshStandardMaterial color="#30434a" />
      </mesh>
      <mesh castShadow position={[0, 0.9, -0.25]}>
        <boxGeometry args={[0.08, 0.18, 0.08]} />
        <meshStandardMaterial color="#707d76" />
      </mesh>
      <mesh castShadow position={[0, 0.83, 0.08]}>
        <boxGeometry args={[0.42, 0.035, 0.16]} />
        <meshStandardMaterial color="#49575b" />
      </mesh>
      <mesh castShadow receiveShadow position={[-legX, 0.36, -legZ]}>
        <boxGeometry args={[0.08, 0.68, 0.08]} />
      </mesh>
      <mesh castShadow receiveShadow position={[legX, 0.36, -legZ]}>
        <boxGeometry args={[0.08, 0.68, 0.08]} />
      </mesh>
      <mesh castShadow receiveShadow position={[-legX, 0.36, legZ]}>
        <boxGeometry args={[0.08, 0.68, 0.08]} />
      </mesh>
      <mesh castShadow receiveShadow position={[legX, 0.36, legZ]}>
        <boxGeometry args={[0.08, 0.68, 0.08]} />
      </mesh>
    </group>
  );
}

function Chair({ position, rotation = 0, colors = {} }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh castShadow position={[0, 0.45, 0]}>
        <boxGeometry args={[0.8, 0.12, 0.8]} />
        <meshStandardMaterial color={colors.seat || '#7f8fa5'} />
      </mesh>
      <mesh castShadow position={[0, 0.8, -0.18]}>
        <boxGeometry args={[0.72, 0.75, 0.12]} />
        <meshStandardMaterial color={colors.back || '#6d7b8d'} />
      </mesh>
      <mesh castShadow position={[0, 0.2, 0.38]}>
        <boxGeometry args={[0.75, 0.45, 0.12]} />
        <meshStandardMaterial color={colors.base || '#73839a'} />
      </mesh>
    </group>
  );
}

function MeetingRoom({ room }) {
  const { x, z, width, depth, doorWidth, wallHeight, wallThickness, table } = room;
  const halfWidth = width / 2;
  const halfDepth = depth / 2;
  const doorSideWidth = (width - doorWidth) / 2;

  return (
    <group position={[x, 0, z]}>
      <mesh receiveShadow position={[0, 0.07, 0]}>
        <boxGeometry args={[width, 0.12, depth]} />
        <meshStandardMaterial color="#d9e2dc" />
      </mesh>
      <Wall position={[0, wallHeight / 2, -halfDepth]} size={[width, wallHeight, wallThickness]} />
      <Wall position={[-halfWidth, wallHeight / 2, 0]} size={[wallThickness, wallHeight, depth]} />
      <Wall position={[halfWidth, wallHeight / 2, 0]} size={[wallThickness, wallHeight, depth]} />
      {[-1, 1].map((side) => (
        <Wall
          key={side}
          position={[side * (doorWidth / 2 + doorSideWidth / 2), wallHeight / 2, halfDepth]}
          size={[doorSideWidth, wallHeight, wallThickness]}
        />
      ))}
      <mesh castShadow receiveShadow position={[table.x, 0.82, table.z]}>
        <boxGeometry args={[table.width, 0.14, table.depth]} />
        <meshStandardMaterial color="#967252" />
      </mesh>
      <Text position={[0, wallHeight - 0.35, -halfDepth + 1.2]} anchorX="center" anchorY="middle" fontSize={0.38} color="#34483f">
        {room.name}
      </Text>
    </group>
  );
}

function buildWorkstations(plan) {
  const { columns, islands, chairOffset } = plan.workstations;
  return islands.flatMap(({ rows }) => [
    ...columns.map((x) => ({
      x,
      z: rows[0],
      rotation: 0,
      chairZ: rows[0] - chairOffset,
      chairRotation: 0,
    })),
    ...columns.map((x) => ({
      x,
      z: rows[1],
      rotation: Math.PI,
      chairZ: rows[1] + chairOffset,
      chairRotation: Math.PI,
    })),
  ]);
}

function RoomShell({ plan }) {
  const { entrance } = plan;
  const entrancePatch = entrance?.floorPatch;

  return (
    <group>
      <OfficeFloor floor={plan.floor} bounds={plan.bounds} />
      <OfficeBoundary plan={plan} />
      {entrancePatch && (
        <mesh receiveShadow rotation-x={-Math.PI / 2} position={[entrancePatch.x, 0.035, entrancePatch.z]}>
          <planeGeometry args={[entrancePatch.width, entrancePatch.depth]} />
          <meshStandardMaterial color="#b7c9b8" />
        </mesh>
      )}
      {entrance?.label && entrance.labelPosition && (
        <Text
          position={[entrance.labelPosition.x, 0.1, entrance.labelPosition.z]}
          rotation={[-Math.PI / 2, 0, 0]}
          anchorX="center"
          anchorY="middle"
          fontSize={0.34}
          color="#40564a"
        >
          {entrance.label}
        </Text>
      )}
    </group>
  );
}

function FixedOfficeLayout({ plan, workstations }) {
  const { desk } = plan.workstations;

  return (
    <group>
      <RoomShell plan={plan} />
      {workstations.map(({ x, z, rotation, chairZ, chairRotation }, index) => (
        <group key={`workstation-${index}`}>
          <Table position={[x, 0, z]} rotation={rotation} width={desk.width} depth={desk.depth} />
          <Chair position={[x, 0, chairZ]} rotation={chairRotation} />
        </group>
      ))}
      {plan.meetingRooms.map((room) => <MeetingRoom key={room.name} room={room} />)}
    </group>
  );
}

function buildWerewolfSeats(layout) {
  const { ritualCircle, seating } = layout;
  return Array.from({ length: seating.count }, (_, index) => {
    const angle = (index / seating.count) * Math.PI * 2;
    return {
      x: ritualCircle.x + Math.cos(angle) * seating.radius,
      z: ritualCircle.z + Math.sin(angle) * seating.radius,
      rotation: -angle - Math.PI / 2,
    };
  });
}

function RitualCircle({ circle }) {
  return (
    <group position={[circle.x, 0, circle.z]}>
      <mesh receiveShadow rotation-x={-Math.PI / 2} position={[0, 0.045, 0]}>
        <circleGeometry args={[circle.radius, 72]} />
        <meshStandardMaterial color={circle.floorColor} roughness={0.9} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.075, 0]}>
        <ringGeometry args={[circle.radius * 0.76, circle.radius * 0.79, 72]} />
        <meshStandardMaterial color={circle.runeColor} emissive={circle.runeColor} emissiveIntensity={circle.runeEmissive ?? 0.28} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.09, 0]}>
        <torusGeometry args={[circle.radius * 0.96, 0.075, 8, 80]} />
        <meshStandardMaterial color={circle.edgeColor} emissive={circle.edgeColor} emissiveIntensity={circle.edgeEmissive ?? 0.45} />
      </mesh>
      {Array.from({ length: circle.sigilCount }, (_, index) => {
        const angle = (index / circle.sigilCount) * Math.PI * 2;
        const radius = circle.radius * 0.875;
        return (
          <group key={`sigil-${index}`} position={[Math.cos(angle) * radius, 0.105, Math.sin(angle) * radius]} rotation-y={-angle}>
            <mesh>
              <boxGeometry args={[0.055, 0.025, circle.radius * 0.2]} />
              <meshStandardMaterial color={circle.runeColor} emissive={circle.runeColor} emissiveIntensity={circle.runeEmissive ?? 0.3} />
            </mesh>
            <Text
              position={[0, 0.025, circle.radius * 0.16]}
              rotation={[-Math.PI / 2, 0, 0]}
              anchorX="center"
              anchorY="middle"
              fontSize={0.2}
              color={circle.runeColor}
            >
              {String(index + 1).padStart(2, '0')}
            </Text>
          </group>
        );
      })}
    </group>
  );
}

function Candle({ candle, theme }) {
  return (
    <group position={[candle.x, 0, candle.z]}>
      <mesh castShadow receiveShadow position={[0, candle.height * 0.34, 0]}>
        <cylinderGeometry args={[0.12, 0.16, candle.height * 0.68, 8]} />
        <meshStandardMaterial color={theme.candleWax || '#8b7861'} />
      </mesh>
      <mesh position={[0, candle.height * 0.76, 0]}>
        <sphereGeometry args={[0.11, 8, 8]} />
        <meshStandardMaterial
          color={theme.candleLight || '#d68e4e'}
          emissive={theme.candleLight || '#d68e4e'}
          emissiveIntensity={theme.candleLightIntensity || 1.8}
        />
      </mesh>
      <pointLight
        position={[0, candle.height * 0.76, 0]}
        color={theme.candleLight || '#d68e4e'}
        intensity={theme.candleLightIntensity || 0.72}
        distance={theme.candleLightDistance || 4.5}
      />
    </group>
  );
}

function WerewolfCards({ cards }) {
  return cards.map((card) => (
    <group key={card.id} position={[card.x, 0.42, card.z]}>
      <mesh castShadow rotation-y={0.28}>
        <boxGeometry args={[0.72, 0.12, 0.92]} />
        <meshStandardMaterial color="#24342d" roughness={0.58} metalness={0.16} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.067, 0]}>
        <ringGeometry args={[0.19, 0.23, 8]} />
        <meshStandardMaterial color="#d2ae6b" emissive="#8d6238" emissiveIntensity={0.38} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.069, 0]}>
        <circleGeometry args={[0.1, 4]} />
        <meshStandardMaterial color="#b76558" roughness={0.48} />
      </mesh>
    </group>
  ));
}
// ─────────────────────────────────────────────
// Concert venue (outdoor stadium seating map)
// ─────────────────────────────────────────────

// A raked seating/standing block: a sloped slab with its name on the top surface.
function ConcertBlock({
  x,
  z,
  width,
  depth,
  footprint,
  rotationY = 0,
  color,
  textColor = '#ffffff',
  label,
  tag,
  priceLabel,
  fontScale = 1,
}) {
  const rise = Math.min(depth * 0.18, 3.2);
  const labelSize = Math.min(width, depth) * 0.16 * fontScale;
  const footprintGeometry = useMemo(() => {
    if (!footprint) return null;
    const shape = new Shape();
    footprint.forEach(([pointX, pointZ], index) => {
      if (index === 0) shape.moveTo(pointX, -pointZ);
      else shape.lineTo(pointX, -pointZ);
    });
    shape.closePath();
    const geometry = new ExtrudeGeometry(shape, { depth: rise, bevelEnabled: false });
    geometry.rotateX(-Math.PI / 2);
    return geometry;
  }, [footprint, rise]);
  return (
    <group position={[x, 0, z]} rotation={[0, rotationY, 0]}>
      {/* Sloped seating slab: higher at the back (−z, away from stage is +z here,
          so lift the far edge toward the audience side). */}
      {footprintGeometry ? (
        <mesh castShadow receiveShadow geometry={footprintGeometry}>
          <meshStandardMaterial color={color} roughness={0.85} metalness={0.05} />
        </mesh>
      ) : (
        <mesh castShadow receiveShadow position={[0, rise / 2 + 0.1, 0]} rotation={[Math.PI * 0.03, 0, 0]}>
          <boxGeometry args={[width, rise, depth]} />
          <meshStandardMaterial color={color} roughness={0.85} metalness={0.05} />
        </mesh>
      )}
      {/* Front edge trim */}
      {!footprintGeometry && (
        <mesh position={[0, 0.12, depth / 2]}>
          <boxGeometry args={[width, 0.24, 0.4]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.25} roughness={0.6} />
        </mesh>
      )}
      <Text
        position={[0, rise + 0.02, priceLabel ? -depth * 0.12 : 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        anchorX="center"
        anchorY="middle"
        fontSize={labelSize}
        color={textColor}
        maxWidth={width * 0.92}
        textAlign="center"
      >
        {label}
      </Text>
      {priceLabel && (
        <Text
          position={[0, rise + 0.02, depth * 0.3]}
          rotation={[-Math.PI / 2, 0, 0]}
          anchorX="center"
          anchorY="middle"
          fontSize={labelSize * 0.48}
          color={textColor}
          maxWidth={width * 0.86}
          textAlign="center"
        >
          {priceLabel}
        </Text>
      )}
      {tag && (
        <Text
          position={[0, rise + 0.02, -depth * 0.3]}
          rotation={[-Math.PI / 2, 0, 0]}
          anchorX="center"
          anchorY="middle"
          fontSize={labelSize * 0.6}
          color={textColor}
        >
          {tag}
        </Text>
      )}
    </group>
  );
}

// Compute the per-side blocks for a mirrored seated section (side 1 = left of
// centre, side 2 = right). Returns an array of { x, z, width, depth, label }.
function buildConcertSeatedBlocks(section) {
  if (section.blocks) {
    return section.blocks.map((block, index) => ({
      side: `${block.name}-${index}`,
      name: block.name,
      x: block.x,
      z: block.z ?? section.z,
      width: block.width,
      depth: block.depth ?? section.depth,
      color: block.color ?? section.color,
      textColor: block.textColor ?? section.textColor,
      priceLabel: block.priceLabel,
    }));
  }

  const halfGap = (section.sideGap ?? 2) / 2;
  const sideWidth = section.sideWidth;
  const centerX = halfGap + sideWidth / 2;
  return [
    { side: '1', x: -centerX, z: section.z, width: sideWidth, depth: section.depth },
    { side: '2', x: centerX, z: section.z, width: sideWidth, depth: section.depth },
  ];
}

// A raised seated tier: a flat deck at `baseY` with a solid riser down to the
// floor, plus a section label on the deck. Players walk on top at height baseY.
function ConcertTierBlock({
  x,
  z,
  width,
  depth,
  baseY,
  color,
  textColor = '#ffffff',
  label,
  priceLabel,
}) {
  const labelSize = Math.min(width, depth) * 0.16;
  return (
    <group position={[x, 0, z]}>
      {/* Riser / supporting wall from the floor up to the deck */}
      <mesh castShadow receiveShadow position={[0, baseY / 2, 0]}>
        <boxGeometry args={[width, baseY, depth]} />
        <meshStandardMaterial color={color} roughness={0.85} metalness={0.05} />
      </mesh>
      {/* Deck surface */}
      <mesh receiveShadow position={[0, baseY + 0.05, 0]}>
        <boxGeometry args={[width, 0.1, depth]} />
        <meshStandardMaterial color={color} roughness={0.7} />
      </mesh>
      {/* Front edge glow trim */}
      <mesh position={[0, baseY + 0.1, depth / 2]}>
        <boxGeometry args={[width, 0.26, 0.4]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.35} roughness={0.6} />
      </mesh>
      <Text
        position={[0, baseY + 0.12, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        anchorX="center"
        anchorY="middle"
        fontSize={labelSize}
        color={textColor}
        maxWidth={width * 0.92}
        textAlign="center"
      >
        {label}
      </Text>
      {priceLabel && (
        <Text
          position={[width * 0.38, baseY + 0.12, depth * 0.32]}
          rotation={[-Math.PI / 2, 0, 0]}
          anchorX="right"
          anchorY="middle"
          fontSize={labelSize * 0.46}
          color={textColor}
          maxWidth={width * 0.56}
          textAlign="right"
        >
          {priceLabel}
        </Text>
      )}
    </group>
  );
}

// A staircase ramp running along z, from the field up to the top tier height.
function ConcertStairs({ stair, baseHeight, tierStep }) {
  const topHeight = baseHeight + (stair.topTier ?? 0) * tierStep;
  const length = stair.zEnd - stair.zStart;
  const stepCount = Math.max(6, Math.round(topHeight / 0.35));
  return (
    <group position={[stair.x, 0, stair.zStart]}>
      {Array.from({ length: stepCount }, (_, index) => {
        const t = (index + 0.5) / stepCount;
        const stepZ = t * length;
        const stepY = topHeight * ((index + 1) / stepCount);
        return (
          <mesh key={`step-${index}`} castShadow receiveShadow position={[0, stepY / 2, stepZ]}>
            <boxGeometry args={[stair.width, stepY, length / stepCount + 0.05]} />
            <meshStandardMaterial color={index % 2 ? '#3a4660' : '#2b3550'} roughness={0.8} />
          </mesh>
        );
      })}
      {/* Side rails */}
      {[-1, 1].map((side) => (
        <mesh key={`rail-${side}`} position={[side * stair.width / 2, topHeight * 0.5 + 0.6, length / 2]} rotation={[Math.atan2(topHeight, length), 0, 0]}>
          <boxGeometry args={[0.12, 0.12, Math.hypot(length, topHeight)]} />
          <meshStandardMaterial color="#8fa0c0" metalness={0.5} roughness={0.4} />
        </mesh>
      ))}
    </group>
  );
}

function ConcertRunway({ runway, stairs, baseHeight, tierStep }) {
  const height = baseHeight + runway.tier * tierStep + (runway.heightOffset ?? 0);
  const makeSegment = (key, x, width, zStart, zEnd) => {
    const length = zEnd - zStart;
    if (width <= 0 || length <= 0) return null;
    return (
      <mesh key={key} castShadow receiveShadow position={[x, height - 0.11, (zStart + zEnd) / 2]}>
        <boxGeometry args={[width, 0.22, length]} />
        <meshStandardMaterial color={runway.color} roughness={0.75} />
      </mesh>
    );
  };
  const stairsStart = stairs ? Math.max(runway.zStart, stairs.zStart) : runway.zStart;
  const stairsEnd = stairs ? Math.min(runway.zEnd, stairs.zEnd) : runway.zStart;
  const stairsWidth = stairsEnd > stairsStart ? stairs.spanWidth : 0;
  const shoulderWidth = (runway.spanWidth - stairsWidth) / 2;

  return (
    <group>
      {stairsWidth > 0 ? (
        <>
          {[-1, 1].map((side) => makeSegment(
            `runway-shoulder-${side}`,
            runway.x + side * (stairsWidth / 2 + shoulderWidth / 2),
            shoulderWidth,
            stairsStart,
            stairsEnd,
          ))}
          {makeSegment('runway-before-stairs', runway.x, runway.spanWidth, runway.zStart, stairsStart)}
          {makeSegment('runway-after-stairs', runway.x, runway.spanWidth, stairsEnd, runway.zEnd)}
        </>
      ) : makeSegment('runway', runway.x, runway.spanWidth, runway.zStart, runway.zEnd)}
    </group>
  );
}

function ConcertAccessStairs({ stairs, baseHeight, tierStep }) {
  const startHeight = baseHeight + stairs.fromTier * tierStep;
  const endHeight = baseHeight + stairs.toTier * tierStep + (stairs.toHeightOffset ?? 0);
  const length = stairs.zEnd - stairs.zStart;
  const rise = endHeight - startHeight;
  const stepCount = Math.max(4, Math.ceil(rise / 0.3));
  const stepDepth = length / stepCount;

  return (
    <group>
      {Array.from({ length: stepCount }, (_, index) => {
        const stepHeight = rise * (index + 1) / stepCount;
        const z = stairs.zStart + stepDepth * (index + 0.5);
        return (
          <mesh
            key={`access-step-${index}`}
            castShadow
            receiveShadow
            position={[stairs.x, startHeight + stepHeight / 2, z]}
          >
            <boxGeometry args={[stairs.spanWidth, stepHeight, stepDepth + 0.04]} />
            <meshStandardMaterial color={stairs.color || '#888888'} roughness={0.8} />
          </mesh>
        );
      })}
    </group>
  );
}

function ConcertPitRunway({ runway }) {
  const [startX, startZ] = runway.start;
  const [endX, endZ] = runway.end;
  const geometry = useMemo(() => {
    const path = new LineCurve3(
      new Vector3(startX, 0, startZ),
      new Vector3(endX, 0, endZ),
    );
    const runwayGeometry = new TubeGeometry(path, 2, runway.width / 2, 12, false);
    runwayGeometry.scale(1, 0.025, 1);
    return runwayGeometry;
  }, [endX, endZ, runway.width, startX, startZ]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh
      geometry={geometry}
      receiveShadow
      position={[0, 0.11, 0]}
    >
      <meshStandardMaterial color={runway.color || '#888888'} roughness={0.75} />
    </mesh>
  );
}

function ConcertBoundary({ boundary }) {
  const segments = getConcertBoundarySegments(boundary);
  const supportSpacing = 6;
  const entryGateWidth = boundary.entryWidth;
  const entryGateHeight = boundary.entryGateHeight ?? 8;
  const entryGateColor = boundary.entryGateColor || '#b7893f';

  return (
    <group>
      <group position={[0, 0, boundary.maxZ]}>
        {[-1, 1].map((side) => (
          <mesh
            key={`entry-gate-post-${side}`}
            castShadow
            receiveShadow
            position={[side * entryGateWidth / 2, entryGateHeight / 2, 0]}
          >
            <boxGeometry args={[0.8, entryGateHeight, 0.8]} />
            <meshStandardMaterial color={entryGateColor} metalness={0.45} roughness={0.55} />
          </mesh>
        ))}
        <mesh castShadow receiveShadow position={[0, entryGateHeight, 0]}>
          <boxGeometry args={[entryGateWidth, 0.8, 0.8]} />
          <meshStandardMaterial color={entryGateColor} metalness={0.45} roughness={0.55} />
        </mesh>
        <Text
          position={[0, entryGateHeight, 0.46]}
          anchorX="center"
          anchorY="middle"
          fontSize={1.1}
          color="#fff1ce"
          maxWidth={entryGateWidth * 0.85}
          textAlign="center"
        >
          CỔNG VÀO
        </Text>
      </group>
      {segments.map((segment, index) => {
        const horizontal = segment.width >= segment.depth;
        const length = horizontal ? segment.width : segment.depth;
        const supportCount = Math.ceil(length / supportSpacing);
        const supports = Array.from({ length: supportCount + 1 }, (_, supportIndex) => {
          const offset = -length / 2 + (length * supportIndex) / supportCount;
          return horizontal
            ? [segment.x + offset, 0, segment.z]
            : [segment.x, 0, segment.z + offset];
        });

        return (
          <group key={`event-boundary-${index}`}>
            {[0.7, 1.45, 2.2].map((height) => (
              <mesh
                key={`rail-${height}`}
                castShadow
                receiveShadow
                position={[segment.x, height, segment.z]}
              >
                <boxGeometry args={[segment.width, 0.12, segment.depth]} />
                <meshStandardMaterial color={boundary.color || '#606a70'} metalness={0.45} roughness={0.65} />
              </mesh>
            ))}
            {supports.map((position, supportIndex) => (
              <mesh
                key={`post-${supportIndex}`}
                castShadow
                receiveShadow
                position={[position[0], boundary.height / 2, position[2]]}
              >
                <boxGeometry args={[0.22, boundary.height, 0.22]} />
                <meshStandardMaterial color={boundary.color || '#606a70'} metalness={0.45} roughness={0.65} />
              </mesh>
            ))}
          </group>
        );
      })}
    </group>
  );
}

function ConcertMovingBeam({
  position,
  target,
  color,
  sweepX = 0,
  sweepZ = 0,
  speed = 0.7,
  phase = 0,
  beamLength = 42,
  beamWidth = 2.4,
}) {
  const targetObject = useMemo(() => new Object3D(), []);
  const beamRef = useRef();
  const axis = useMemo(() => new Vector3(0, 1, 0), []);
  const beamGeometry = useMemo(
    () => new ConeGeometry(beamWidth, beamLength, 20, 1, true),
    [beamLength, beamWidth],
  );

  useFrame(({ clock }) => {
    const time = clock.getElapsedTime() * speed + phase;
    const targetX = target[0] + Math.sin(time) * sweepX;
    const targetY = target[1];
    const targetZ = target[2] + Math.cos(time * 0.83) * sweepZ;
    targetObject.position.set(targetX, targetY, targetZ);

    const direction = new Vector3(targetX, targetY, targetZ);
    const length = direction.length();
    if (length <= 0) return;
    direction.normalize();
    if (beamRef.current) {
      beamRef.current.position.copy(direction).multiplyScalar(length / 2);
      beamRef.current.quaternion.setFromUnitVectors(axis, direction.clone().negate());
      beamRef.current.scale.y = length / beamLength;
    }
  });

  return (
    <group position={position}>
      <primitive object={targetObject} />
      <mesh position={[0, -0.3, 0]}>
        <cylinderGeometry args={[0.48, 0.62, 0.6, 16]} />
        <meshStandardMaterial color="#20242c" metalness={0.65} roughness={0.35} />
      </mesh>
      <mesh
        ref={beamRef}
        geometry={beamGeometry}
      >
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.105}
          depthWrite={false}
          side={DoubleSide}
        />
      </mesh>
      <spotLight
        position={[0, 0, 0]}
        target={targetObject}
        color={color}
        intensity={95}
        distance={beamLength + 12}
        angle={0.24}
        penumbra={0.45}
        decay={1.35}
      />
    </group>
  );
}

function GateUplight({ gate, side, face }) {
  const target = useMemo(() => new Object3D(), []);

  return (
    <group position={[side * gate.width * 0.3, 0.12, face * 1.4]}>
      <primitive
        object={target}
        position={[0, gate.height * 0.55 - 0.3, -face * 0.9]}
      />
      <mesh>
        <cylinderGeometry args={[0.65, 0.8, 0.24, 16]} />
        <meshStandardMaterial color="#252932" metalness={0.65} roughness={0.35} />
      </mesh>
      <mesh position={[0, 0.16, 0]}>
        <cylinderGeometry args={[0.42, 0.58, 0.08, 16]} />
        <meshStandardMaterial
          color={gate.uplightColor || '#ffd98a'}
          emissive={gate.uplightColor || '#ffd98a'}
          emissiveIntensity={2.2}
          roughness={0.3}
        />
      </mesh>
      <spotLight
        position={[0, 0.3, 0]}
        target={target}
        color={gate.uplightColor || '#ffd98a'}
        intensity={gate.uplightIntensity ?? 24}
        distance={gate.height * 2.2}
        angle={0.52}
        penumbra={0.65}
        decay={1.4}
      />
    </group>
  );
}

// Sample the walkable ground height at a point for the concert's tiered seating.
// Seated tiers are raised (base 3 m, +1.5 m per tier). Side stairs ramp smoothly
// from the field up to the top tier so players can walk up either wing.
function getConcertGroundHeight(plan, x, z) {
  const layout = plan?.layout;
  if (layout?.kind !== 'concert') return 0;
  const baseHeight = layout.seating?.baseHeight ?? 3;
  const tierStep = layout.seating?.tierStep ?? 1.5;

  // Side staircases: a diagonal ramp along z, from field (0) up to the top tier.
  for (const stair of layout.stairs || []) {
    if (Math.abs(x - stair.x) <= stair.width / 2 && z >= stair.zStart && z <= stair.zEnd) {
      const topHeight = baseHeight + (stair.topTier ?? 0) * tierStep;
      const t = (z - stair.zStart) / (stair.zEnd - stair.zStart || 1);
      return topHeight * clamp(t, 0, 1);
    }
  }

  // Seated tier platforms.
  let height = 0;
  for (const section of layout.seatedSections || []) {
    for (const block of buildConcertSeatedBlocks(section)) {
      if (Math.abs(x - block.x) <= block.width / 2
        && Math.abs(z - block.z) <= block.depth / 2) {
        height = Math.max(height, baseHeight + (section.tier ?? 0) * tierStep);
      }
    }
  }
  const foh = layout.foh;
  if (foh && Math.abs(x - foh.x) <= foh.width / 2
    && Math.abs(z - foh.z) <= foh.depth / 2) {
    height = Math.max(height, baseHeight + (foh.tier ?? 0) * tierStep);
  }
  for (const runway of layout.runways || []) {
    if (Math.abs(x - runway.x) <= runway.spanWidth / 2
      && z >= runway.zStart && z <= runway.zEnd) {
      const onStairs = (layout.accessStairs || []).some((stairs) => (
        Math.abs(x - stairs.x) <= stairs.spanWidth / 2
        && z >= stairs.zStart && z <= stairs.zEnd
        && stairs.toTier === runway.tier
      ));
      if (onStairs) continue;
      height = Math.max(height, baseHeight + runway.tier * tierStep + (runway.heightOffset ?? 0));
    }
  }
  for (const stairs of layout.accessStairs || []) {
    if (Math.abs(x - stairs.x) <= stairs.spanWidth / 2
      && z >= stairs.zStart && z <= stairs.zEnd) {
      const progress = (z - stairs.zStart) / (stairs.zEnd - stairs.zStart || 1);
      const startHeight = baseHeight + stairs.fromTier * tierStep;
      const endHeight = baseHeight + stairs.toTier * tierStep + (stairs.toHeightOffset ?? 0);
      height = Math.max(height, startHeight + (endHeight - startHeight) * clamp(progress, 0, 1));
    }
  }
  return height;
}

function ConcertStandingArea({ column, width, depth, fenceHeight, gateWidth, showFloor = true }) {
  const floorGeometry = useMemo(() => {
    const footprint = column.footprint ?? [
      [-width / 2, -depth / 2],
      [width / 2, -depth / 2],
      [width / 2, depth / 2],
      [-width / 2, depth / 2],
    ];
    const shape = new Shape();
    footprint.forEach(([x, z], index) => {
      if (index === 0) shape.moveTo(x, -z);
      else shape.lineTo(x, -z);
    });
    shape.closePath();
    const geometry = new ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: false });
    geometry.rotateX(-Math.PI / 2);
    return geometry;
  }, [column.footprint, width, depth]);
  const footprint = column.footprint ?? [
    [-width / 2, -depth / 2],
    [width / 2, -depth / 2],
    [width / 2, depth / 2],
    [-width / 2, depth / 2],
  ];
  const edges = getStandingAreaFenceSegments(footprint, gateWidth).map(({ start, end }, index) => {
    const dx = end[0] - start[0];
    const dz = end[1] - start[1];
    const length = Math.hypot(dx, dz);
    return {
      key: index,
      position: [(start[0] + end[0]) / 2, fenceHeight / 2, (start[1] + end[1]) / 2],
      length,
      angle: Math.atan2(-dz, dx),
    };
  });

  return (
    <group>
      {showFloor && (
        <mesh geometry={floorGeometry} receiveShadow>
          <meshStandardMaterial color={column.color} roughness={0.82} />
        </mesh>
      )}
      {edges.map((edge) => (
        <mesh
          key={edge.key}
          castShadow
          receiveShadow
          position={edge.position}
          rotation={[0, edge.angle, 0]}
        >
          <boxGeometry args={[edge.length, fenceHeight, 0.12]} />
          <meshStandardMaterial color="#777777" roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
}

// Flat standing areas with a low fence and an entrance on the stage-facing edge.
function ConcertTribune({ tribune }) {
  const {
    x,
    z,
    width,
    depth,
    rotationY,
    columns,
    floorHeight = 0,
    fenceHeight = 0.5,
    gateWidth = 3,
  } = tribune;
  const columnWidths = columns.map((column) => column.width ?? width / columns.length);
  const totalColumnWidth = columnWidths.reduce((total, columnWidth) => total + columnWidth, 0);
  return (
    <group position={[x, 0, z]} rotation={[0, rotationY, 0]}>
      {columns.map((column, index) => {
        const columnWidth = columnWidths[index];
        const precedingWidth = columnWidths.slice(0, index).reduce((total, current) => total + current, 0);
        const columnX = -totalColumnWidth / 2 + precedingWidth + columnWidth / 2;
        const columnDepth = column.depth ?? depth;
        const columnZ = column.dz ?? 0;
        return (
          <group key={`${column.name}-${index}`} position={[columnX, floorHeight, columnZ]}>
            <ConcertStandingArea
              column={column}
              width={columnWidth - 0.6}
              depth={columnDepth - 0.6}
              fenceHeight={fenceHeight}
              gateWidth={gateWidth}
            />
            <Text
              position={[0, 0.15, columnDepth * (column.priceLabel ? -0.12 : 0.12)]}
              rotation={[-Math.PI / 2, 0, 0]}
              anchorX="center"
              anchorY="middle"
              fontSize={Math.min(columnWidth * 0.18, 2.4)}
              color="#ffffff"
              maxWidth={columnWidth - 1}
              textAlign="center"
            >
              {column.name}
            </Text>
            {column.priceLabel && (
              <Text
                position={[0, 0.15, columnDepth * 0.3]}
                rotation={[-Math.PI / 2, 0, 0]}
                anchorX="center"
                anchorY="middle"
                fontSize={0.55}
                color="#ffffff"
                maxWidth={columnWidth - 1}
                textAlign="center"
              >
                {column.priceLabel}
              </Text>
            )}
          </group>
        );
      })}
    </group>
  );
}

// A single drifting cloud puff cluster.
function Cloud({ position, scale = 1, speed = 1, range = 60, color = '#ffffff', opacity = 0.9 }) {
  const ref = useRef();
  const startX = position[0];
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime() * speed * 0.6;
    ref.current.position.x = startX + ((t % range) - range / 2);
  });
  const puffs = [
    [0, 0, 0, 1],
    [1.1, -0.2, 0.3, 0.78],
    [-1.1, -0.15, -0.2, 0.72],
    [0.5, 0.5, -0.3, 0.62],
    [-0.6, 0.4, 0.4, 0.58],
  ];
  return (
    <group ref={ref} position={position} scale={scale}>
      {puffs.map((p, i) => (
        <mesh key={i} position={[p[0], p[1], p[2]]}>
          <sphereGeometry args={[p[3] * 3.4, 12, 12]} />
          <meshStandardMaterial color={color} transparent opacity={opacity} roughness={1} metalness={0} />
        </mesh>
      ))}
    </group>
  );
}

// Outdoor sky dome with a sun (day) or moon (night) and drifting clouds.
function ConcertSky({ night }) {
  const skyColor = night ? '#0a1030' : '#5fa8e8';
  const horizonColor = night ? '#1a1230' : '#cfe6ff';
  const bodyColor = night ? '#eaf0ff' : '#fff2c2';
  const bodyEmissive = night ? '#9fb4ff' : '#ffcf5e';
  const bodyPos = night ? [-70, 95, -150] : [70, 110, -150];
  const cloudColor = night ? '#30405f' : '#ffffff';
  const cloudOpacity = night ? 0.55 : 0.92;
  const clouds = [
    { position: [-60, 60, -120], scale: 2.6, speed: 0.5 },
    { position: [40, 72, -140], scale: 3.2, speed: 0.35 },
    { position: [-20, 55, -90], scale: 2.0, speed: 0.6 },
    { position: [80, 64, -70], scale: 2.4, speed: 0.42 },
    { position: [-90, 68, -40], scale: 2.8, speed: 0.3 },
    { position: [10, 80, -160], scale: 3.6, speed: 0.25 },
  ];
  return (
    <group>
      {/* Sky dome */}
      <mesh scale={[1, 1, 1]}>
        <sphereGeometry args={[280, 32, 16]} />
        <meshBasicMaterial color={skyColor} side={DoubleSide} fog={false} />
      </mesh>
      {/* Horizon band near the ground */}
      <mesh position={[0, 10, 0]}>
        <sphereGeometry args={[278, 32, 8, 0, Math.PI * 2, Math.PI * 0.4, Math.PI * 0.1]} />
        <meshBasicMaterial color={horizonColor} side={DoubleSide} fog={false} transparent opacity={0.6} />
      </mesh>
      {/* Sun or moon */}
      <mesh position={bodyPos}>
        <sphereGeometry args={[night ? 10 : 13, 24, 24]} />
        <meshStandardMaterial color={bodyColor} emissive={bodyEmissive} emissiveIntensity={night ? 0.8 : 1.4} fog={false} />
      </mesh>
      <pointLight position={bodyPos} color={bodyEmissive} intensity={night ? 0.6 : 1.6} distance={600} />
      {/* Night stars */}
      {night && Array.from({ length: 90 }, (_, i) => {
        const a = (i / 90) * Math.PI * 2;
        const r = 200 + (i % 7) * 10;
        return (
          <mesh key={`star-${i}`} position={[Math.cos(a) * r, 80 + (i % 11) * 9, -Math.abs(Math.sin(a)) * r - 40]}>
            <sphereGeometry args={[0.5, 6, 6]} />
            <meshBasicMaterial color="#dfe6ff" fog={false} />
          </mesh>
        );
      })}
      {clouds.map((c, i) => (
        <Cloud key={`cloud-${i}`} position={c.position} scale={c.scale} speed={c.speed} color={cloudColor} opacity={cloudOpacity} />
      ))}
    </group>
  );
}

function ConcertFloodlight({ x, z }) {
  const target = useMemo(() => new Object3D(), []);

  return (
    <group position={[x, 34, z]}>
      <primitive object={target} position={[0, -34, 0]} />
      <mesh position={[0, -0.5, 0]}>
        <boxGeometry args={[2.2, 0.8, 1.1]} />
        <meshStandardMaterial
          color="#eaf0ff"
          emissive="#c9ddff"
          emissiveIntensity={2.4}
          metalness={0.25}
          roughness={0.3}
        />
      </mesh>
      <spotLight
        position={[0, -0.9, 0]}
        target={target}
        angle={1.08}
        penumbra={0.9}
        intensity={650}
        color="#eaf0ff"
        distance={125}
        decay={2}
      />
    </group>
  );
}

function ConcertLayout({ plan, audioControlRef, onAudioStatusChange }) {
  const layout = plan.layout;
  const {
    stage,
    pits = [],
    pitRunways = [],
    standingTribunes = [],
    sideWings = [],
    foh,
    seatedSections = [],
    gate,
  } = layout;
  const boundary = layout.eventBoundary;
  const centralClusterScale = layout.centralClusterScale ?? 1;
  const centralClusterOffsetZ = layout.centralClusterOffsetZ ?? 0;
  const stageFootprintGeometry = useMemo(() => {
    if (!stage.footprint) return null;
    const shape = new Shape();
    const radius = stage.cornerRadius ?? 0;
    const corners = stage.footprint.map(([x, z], index, points) => {
      const previous = points[(index - 1 + points.length) % points.length];
      const next = points[(index + 1) % points.length];
      const previousLength = Math.hypot(previous[0] - x, previous[1] - z);
      const nextLength = Math.hypot(next[0] - x, next[1] - z);
      const trim = Math.min(radius, previousLength / 2, nextLength / 2);
      return {
        before: [
          x + ((previous[0] - x) / previousLength) * trim,
          z + ((previous[1] - z) / previousLength) * trim,
        ],
        point: [x, z],
        after: [
          x + ((next[0] - x) / nextLength) * trim,
          z + ((next[1] - z) / nextLength) * trim,
        ],
      };
    });
    const first = corners[0];
    shape.moveTo(first.before[0], -first.before[1]);
    corners.forEach(({ point, after }, index) => {
      shape.quadraticCurveTo(point[0], -point[1], after[0], -after[1]);
      const following = corners[(index + 1) % corners.length];
      shape.lineTo(following.before[0], -following.before[1]);
    });
    shape.closePath();
    const geometry = new ExtrudeGeometry(shape, {
      depth: stage.height,
      bevelEnabled: false,
    });
    geometry.rotateX(-Math.PI / 2);
    return geometry;
  }, [stage.cornerRadius, stage.footprint, stage.height]);
  const lightingFixtures = [-88, -44, 0, 44, 88].flatMap((x) => (
    [stage.z + 14, -15, 55].map((z) => ({ x, z }))
  ));
  const beamSpacing = 10;
  const runwayStartZ = stage.z + stage.depth / 2;
  const runwayEndZ = runwayStartZ + (stage.runway?.length ?? 0);
  const stageBeamFootprint = (stage.footprint ?? [
    [-stage.width / 2, -stage.depth / 2],
    [stage.width / 2, -stage.depth / 2],
    [stage.width / 2, stage.depth / 2],
    [-stage.width / 2, stage.depth / 2],
  ]).map(([x, z]) => [stage.x + x, stage.z + z]);
  const runwayBeams = [-1, 1].flatMap((side) => (
    getBeamLineFixtures(
      [stage.x + side * (stage.runway?.width ?? 0) / 2, runwayStartZ],
      [stage.x + side * (stage.runway?.width ?? 0) / 2, runwayEndZ],
      beamSpacing,
      centralClusterScale,
    ).map(([x, z], index) => ({
      position: [x, 9, z],
      target: [stage.x, -3, z],
      color: side < 0 ? '#56d9ff' : '#ff54bd',
      sweepX: 1.5,
      sweepZ: 3,
      speed: 0.72,
      phase: index * 0.32 + (side < 0 ? 0 : Math.PI),
    }))
  ));
  const stageEdgeBeams = getBeamPerimeterFixtures(
    stageBeamFootprint,
    beamSpacing,
    centralClusterScale,
  ).map(([x, z], index) => ({
    position: [x, 9, z],
    target: [stage.x, -3, stage.z],
    color: index % 2 === 0 ? '#ffb347' : '#55dfff',
    sweepX: 3,
    sweepZ: 2,
    speed: 0.52,
    phase: index * 0.24,
  }));
  const skyBeamCorners = [
    stageBeamFootprint[0],
    stageBeamFootprint[1],
    stageBeamFootprint[Math.floor(stageBeamFootprint.length / 2)],
    stageBeamFootprint[stageBeamFootprint.length - 1],
  ];
  const skyBeams = skyBeamCorners.map(([x, z], index) => ({
    position: [x, 0.25, z],
    target: [0, 105, 0],
    color: ['#ffb347', '#55dfff', '#ff54bd', '#a47bff'][index],
    sweepX: 0,
    sweepZ: 0,
    speed: 0,
    phase: 0,
    beamLength: 105,
    beamWidth: 3.2,
  }));

  return (
    <group>
      <RoomShell plan={plan} />

      <group position={[0, 0, centralClusterOffsetZ]} scale={[centralClusterScale, 1, centralClusterScale]}>
      {/* Stage with truss backdrop and logo */}
      <group position={[stage.x, 0, stage.z]} rotation={[0, stage.rotationY ?? 0, 0]}>
        <mesh
          castShadow
          receiveShadow
          geometry={stageFootprintGeometry ?? undefined}
          position={stageFootprintGeometry ? undefined : [0, stage.height / 2, 0]}
        >
          {!stageFootprintGeometry && <boxGeometry args={[stage.width, stage.height, stage.depth]} />}
          <meshStandardMaterial color={stage.deckColor} roughness={0.7} metalness={0.2} />
        </mesh>
        {stage.floorLabel && (
          <Text
            position={[0, stage.height + 0.1, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            anchorX="center"
            anchorY="middle"
            fontSize={stage.floorLabel.fontSize}
            color={stage.floorLabel.color}
          >
            {stage.floorLabel.text}
          </Text>
        )}
        {/* Red LED edge glow along the stage lip */}
        <mesh position={[0, stage.height + 0.05, stage.depth / 2]}>
          <boxGeometry args={[stage.frontLipWidth ?? stage.width, 0.3, 0.3]} />
          <meshStandardMaterial color={stage.glowColor || '#ff5a2b'} emissive={stage.glowColor || '#ff5a2b'} emissiveIntensity={1.6} />
        </mesh>
        {/* Backdrop truss wall */}
        <mesh castShadow position={[0, stage.height + 7.5, -stage.depth / 2]}>
          <boxGeometry args={[stage.width, 15, 0.8]} />
          <meshStandardMaterial color={stage.trussColor} roughness={0.6} metalness={0.4} />
        </mesh>
        {stage.videoScreen && (
          <ConcertVideoScreen
            screen={stage.videoScreen}
            audioControlRef={audioControlRef}
            onAudioStatusChange={onAudioStatusChange}
          />
        )}
        {(stage.labels || []).map((label) => (
          <Text
            key={label.name}
            position={[label.x, label.y, label.z]}
            anchorX="center"
            anchorY="middle"
            fontSize={label.fontSize}
            color={label.color || stage.logoColor}
            maxWidth={label.maxWidth}
            textAlign="center"
          >
            {label.name}
          </Text>
        ))}
        {/* T-stage runway extending toward the crowd */}
        {stage.runway && (
          <group position={[0, 0, stage.depth / 2 + stage.runway.length / 2]}>
            <mesh receiveShadow position={[0, stage.height * 0.7, 0]}>
              <boxGeometry args={[stage.runway.width, stage.height * 1.4, stage.runway.length]} />
              <meshStandardMaterial color={stage.deckColor} roughness={0.7} metalness={0.2} />
            </mesh>
            {[-1, 1].map((side) => (
              <mesh key={`runway-glow-${side}`} position={[side * stage.runway.width / 2, stage.height * 1.42, 0]}>
                <boxGeometry args={[0.25, 0.2, stage.runway.length]} />
                <meshStandardMaterial color={stage.glowColor || '#ff5a2b'} emissive={stage.glowColor || '#ff5a2b'} emissiveIntensity={1.4} />
              </mesh>
            ))}
            {stage.runway.label && (
              <Text
                position={[0, stage.height * 1.4 + 0.2, 0]}
                rotation={[-Math.PI / 2, 0, 0]}
                anchorX="center"
                anchorY="middle"
                fontSize={1.5}
                color="#ffffff"
                maxWidth={stage.runway.width * 0.9}
                textAlign="center"
              >
                {stage.runway.label}
              </Text>
            )}
          </group>
        )}
        <Text
          position={[0, stage.height + 1.4, stage.depth / 2 + 0.1]}
          anchorX="center"
          anchorY="middle"
          fontSize={2.2}
          color="#ffd36b"
        >
          {layout.title}
        </Text>
        {/* Warm red stage wash */}
        <pointLight position={[0, stage.height + 10, stage.depth]} color={stage.glowColor || '#ff5a2b'} intensity={2.2} distance={70} decay={1.6} />
      </group>

      {pitRunways.map((runway, index) => (
        <ConcertPitRunway key={`pit-runway-${index}`} runway={runway} />
      ))}
      {runwayBeams.map((beam, index) => (
        <ConcertMovingBeam key={`runway-moving-beam-${index}`} {...beam} />
      ))}
      {stageEdgeBeams.map((beam, index) => (
        <ConcertMovingBeam
          key={`stage-edge-moving-beam-${index}`}
          {...beam}
        />
      ))}
      {skyBeams.map((beam, index) => (
        <ConcertMovingBeam key={`sky-beam-${index}`} {...beam} />
      ))}
      </group>

      {/* Entrance gate (golden shield emblem) outside the performance area */}
      {boundary && <ConcertBoundary boundary={boundary} />}
      {gate && (
        <group position={[gate.x, 0, gate.z]} rotation={[0, Math.PI + (gate.rotationY ?? 0), 0]}>
          {[-1, 1].flatMap((face) => [-1, 0, 1].map((side) => (
            <GateUplight
              key={`gate-uplight-${face}-${side}`}
              gate={gate}
              side={side}
              face={face}
            />
          )))}
          {/* Scaffold backdrop */}
          <mesh position={[0, gate.height / 2, -0.8]}>
            <boxGeometry args={[gate.width * 1.6, gate.height, 0.6]} />
            <meshStandardMaterial color={gate.scaffoldColor} metalness={0.4} roughness={0.6} wireframe />
          </mesh>
          {/* Central shield */}
          <mesh castShadow position={[0, gate.height * 0.55, 0]}>
            <boxGeometry args={[gate.width * 0.42, gate.height * 0.72, 1]} />
            <meshStandardMaterial color={gate.shieldColor} metalness={0.35} roughness={0.5} />
          </mesh>
          {/* Side shields */}
          {[-1, 1].map((side) => (
            <mesh key={`gate-shield-${side}`} castShadow position={[side * gate.width * 0.5, gate.height * 0.42, 0.2]}>
              <boxGeometry args={[gate.width * 0.26, gate.height * 0.42, 0.8]} />
              <meshStandardMaterial color={gate.shieldColor} metalness={0.35} roughness={0.5} />
            </mesh>
          ))}
          {/* Emblem on the central shield (mirror text back since the group is rotated) */}
          <Text position={[0, gate.height * 0.6, 0.6]} rotation={[0, Math.PI, 0]} anchorX="center" anchorY="middle" fontSize={gate.height * 0.3} color={gate.shieldEdge}>
            {gate.emblemText || 'M'}
          </Text>
          {gate.title && (
            <Text position={[0, gate.height * 0.3, 0.6]} rotation={[0, Math.PI, 0]} anchorX="center" anchorY="middle" fontSize={1.1} color="#f3e3c0" maxWidth={gate.width * 0.4} textAlign="center">
              {gate.title}
            </Text>
          )}
          <Text position={[0, gate.height * 0.07, 0.6]} rotation={[0, Math.PI, 0]} anchorX="center" anchorY="middle" fontSize={gate.height * 0.12} color={gate.labelColor || '#b7893f'}>
            {gate.label || 'CONCERT'}
          </Text>
        </group>
      )}

      {/* Named standing areas in front of the stage */}
      <group position={[0, 0, centralClusterOffsetZ]} scale={[centralClusterScale, 1, centralClusterScale]}>
      {pits.map((pit) => (
        <group key={`pit-${pit.name}`} position={[pit.x, 0, pit.z]} rotation={[0, pit.rotationY ?? 0, 0]}>
          <ConcertBlock
            x={0}
            z={0}
            width={pit.width}
            depth={pit.depth}
            footprint={pit.footprint}
            color={pit.color}
            textColor={pit.textColor}
            label={pit.name}
            priceLabel={pit.priceLabel}
            fontScale={1.3}
          />
          <ConcertStandingArea
            column={{ footprint: pit.footprint, color: pit.color }}
            width={pit.width}
            depth={pit.depth}
            fenceHeight={1.2}
            gateWidth={layout.pitGateWidth ?? 3}
            showFloor={false}
          />
        </group>
      ))}
      </group>

      {/* Large standing tribunes 1 & 2 */}
      {standingTribunes.map((tribune, index) => (
        <ConcertTribune key={`tribune-${index}`} tribune={tribune} />
      ))}

      {/* Angled side wings */}
      {sideWings.map((wing, wingIndex) => (
        <group key={`wing-${wing.side}-${wingIndex}`} position={[wing.x, 0, wing.z]} rotation={[0, wing.rotationY || 0, 0]}>
          {wing.blocks.map((block, blockIndex) => (
            <ConcertBlock
              key={`wing-block-${block.name}-${blockIndex}`}
              x={block.dx ?? 0}
              z={block.dz || 0}
              width={block.width || 16}
              depth={block.depth || 10}
              color={block.color}
              textColor="#ffffff"
              label={block.name}
              tag={block.tag}
              priceLabel={block.priceLabel}
            />
          ))}
          {wing.number && (
            <Text
              position={[0, 4.5, -16]}
              rotation={[-Math.PI / 2, 0, 0]}
              anchorX="center"
              anchorY="middle"
              fontSize={5}
              color={wing.numberColor || '#e8a21c'}
            >
              {wing.number}
            </Text>
          )}
        </group>
      ))}

      {/* FOH booth (not for sale) */}
      {foh && (
        <ConcertTierBlock
          x={foh.x}
          z={foh.z}
          width={foh.width}
          depth={foh.depth}
          baseY={(layout.seating?.baseHeight ?? 3) + (foh.tier ?? 0) * (layout.seating?.tierStep ?? 1.5)}
          color={foh.color}
          textColor={foh.textColor}
          label={foh.label}
        />
      )}

      {/* Raised seating sections */}
      {seatedSections.map((section) => {
        const baseHeight = layout.seating?.baseHeight ?? 3;
        const tierStep = layout.seating?.tierStep ?? 1.5;
        const baseY = baseHeight + (section.tier ?? 0) * tierStep;
        return (
          <group key={`seated-${section.name}`}>
            {buildConcertSeatedBlocks(section).map((block) => (
              <ConcertTierBlock
                key={`seated-${section.name}-${block.side}`}
                x={block.x}
                z={block.z}
                width={block.width}
                depth={block.depth}
                baseY={baseY}
                color={block.color || section.color}
                textColor={block.textColor || section.textColor}
                label={block.name || `${section.name} ${block.side}`}
                priceLabel={block.priceLabel}
              />
            ))}
          </group>
        );
      })}

      {/* Side staircases up to the tiers */}
      {(layout.stairs || []).map((stair, index) => (
        <ConcertStairs
          key={`stairs-${index}`}
          stair={stair}
          baseHeight={layout.seating?.baseHeight ?? 3}
          tierStep={layout.seating?.tierStep ?? 1.5}
        />
      ))}

      {(layout.runways || []).map((runway, index) => (
        <ConcertRunway
          key={`runway-${index}`}
          runway={runway}
          stairs={(layout.accessStairs || []).find((stairs) => (
            Math.abs(stairs.x - runway.x) <= (runway.spanWidth + stairs.spanWidth) / 2
            && stairs.zStart < runway.zEnd && stairs.zEnd > runway.zStart
          )) || null}
          baseHeight={layout.seating?.baseHeight ?? 3}
          tierStep={layout.seating?.tierStep ?? 1.5}
        />
      ))}

      {(layout.accessStairs || []).map((stairs, index) => (
        <ConcertAccessStairs
          key={`access-stairs-${index}`}
          stairs={stairs}
          baseHeight={layout.seating?.baseHeight ?? 3}
          tierStep={layout.seating?.tierStep ?? 1.5}
        />
      ))}

      {/* Stage wash lighting */}
      <spotLight
        position={[
          stage.x * centralClusterScale,
          36,
          (stage.z + 24) * centralClusterScale + centralClusterOffsetZ,
        ]}
        angle={0.6}
        penumbra={0.5}
        intensity={80}
        color="#eaf0ff"
        distance={160}
        target-position={[
          stage.x * centralClusterScale,
          0,
          stage.z * centralClusterScale + centralClusterOffsetZ,
        ]}
      />

      {/* Distributed overhead fixtures light the stage, pits, and seating sections. */}
      {lightingFixtures.map(({ x, z }) => (
        <ConcertFloodlight key={`concert-light-${x}-${z}`} x={x} z={z} />
      ))}
    </group>
  );
}


function WerewolfLayout({ plan }) {
  const layout = plan.layout;
  const { altar, ritualCircle, seating } = layout;
  const seats = buildWerewolfSeats(layout);

  return (
    <group>
      <RoomShell plan={plan} />
      <RitualCircle circle={ritualCircle} />
      {seats.map((seat, index) => (
        <Chair
          key={`council-seat-${index}`}
          position={[seat.x, 0, seat.z]}
          rotation={seat.rotation}
          colors={{ seat: seating.seatColor, back: seating.backColor, base: seating.backColor }}
        />
      ))}
      <mesh castShadow receiveShadow position={[altar.x, altar.height * 0.38, altar.z]}>
        <boxGeometry args={[altar.width, altar.height * 0.76, altar.depth]} />
        <meshStandardMaterial
          color={altar.stoneColor}
          emissive={altar.stoneColor}
          emissiveIntensity={plan.theme.altarEmissiveIntensity || 0}
          roughness={0.88}
        />
      </mesh>
      <mesh castShadow receiveShadow position={[altar.x, altar.height * 0.82, altar.z]}>
        <boxGeometry args={[altar.width * 1.12, 0.18, altar.depth * 1.12]} />
        <meshStandardMaterial color={altar.topColor} roughness={0.72} />
      </mesh>
      <mesh castShadow position={[altar.x, altar.height + 0.62, altar.z]}>
        <coneGeometry args={[0.36, 1.12, 5]} />
        <meshStandardMaterial color={plan.theme.runeColor} emissive={plan.theme.runeColor} emissiveIntensity={0.55} />
      </mesh>
      <Text position={[altar.x, altar.height + 1.2, altar.z]} anchorX="center" anchorY="middle" fontSize={0.42} color={plan.theme.runeColor}>
        {layout.title}
      </Text>
      <mesh castShadow position={[0, 4.2, plan.bounds.minZ + 0.8]}>
        <sphereGeometry args={[1.05, 20, 16]} />
        <meshStandardMaterial
          color={plan.theme.moonColor || '#c6b796'}
          emissive={plan.theme.moonEmissive || '#84978c'}
          emissiveIntensity={plan.theme.moonEmissiveIntensity ?? 0.5}
          roughness={0.48}
        />
      </mesh>
      {layout.candles.map((candle, index) => <Candle key={`candle-${index}`} candle={candle} theme={plan.theme} />)}
      {layout.pillars.map((pillar, index) => (
        <group key={`pillar-${index}`} position={[pillar.x, 0, pillar.z]}>
          <mesh castShadow receiveShadow position={[0, pillar.height / 2, 0]}>
            <cylinderGeometry args={[pillar.radius * 0.72, pillar.radius, pillar.height, 8]} />
            <meshStandardMaterial color={plan.theme.pillarColor} roughness={0.92} />
          </mesh>
          <mesh castShadow position={[0, pillar.height + 0.12, 0]}>
            <cylinderGeometry args={[pillar.radius * 1.25, pillar.radius * 1.25, 0.24, 8]} />
            <meshStandardMaterial color={plan.theme.pillarColor} roughness={0.9} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function QuizLayout({ plan }) {
  const { chest, answerZones, pigPen } = plan.layout;
  const penCorners = [
    [pigPen.x, pigPen.z - pigPen.depth / 2, pigPen.width, 0.16],
    [pigPen.x, pigPen.z + pigPen.depth / 2, pigPen.width, 0.16],
    [pigPen.x - pigPen.width / 2, pigPen.z, 0.16, pigPen.depth],
    [pigPen.x + pigPen.width / 2, pigPen.z, 0.16, pigPen.depth],
  ];

  return (
    <group>
      <RoomShell plan={plan} />
      <mesh castShadow receiveShadow position={[chest.x, 0.62, chest.z]}>
        <boxGeometry args={[chest.width, 1.1, chest.depth]} />
        <meshStandardMaterial color="#835b37" />
      </mesh>
      <mesh castShadow position={[chest.x, 1.2, chest.z]}>
        <boxGeometry args={[chest.width * 1.08, 0.14, chest.depth * 1.08]} />
        <meshStandardMaterial color="#c18a45" metalness={0.18} />
      </mesh>
      <Text position={[chest.x, 1.65, chest.z]} anchorX="center" anchorY="middle" fontSize={0.38} color="#34483f">
        HÒM CÂU HỎI
      </Text>
      {answerZones.map((zone) => (
        <group key={zone.answer}>
          <mesh receiveShadow rotation-x={-Math.PI / 2} position={[zone.x, 0.045, zone.z]}>
            <planeGeometry args={[zone.width, zone.depth]} />
            <meshStandardMaterial color={zone.color} transparent opacity={0.8} roughness={0.84} />
          </mesh>
          <Text position={[zone.x, 0.12, zone.z]} rotation={[-Math.PI / 2, 0, 0]} anchorX="center" anchorY="middle" fontSize={1.5} color="white">
            {zone.answer}
          </Text>
        </group>
      ))}
      {penCorners.map(([x, z, width, depth], index) => (
        <mesh key={`pen-fence-${index}`} castShadow position={[x, 0.42, z]}>
          <boxGeometry args={[width, 0.84, depth]} />
          <meshStandardMaterial color="#75533e" />
        </mesh>
      ))}
      <mesh receiveShadow rotation-x={-Math.PI / 2} position={[pigPen.x, 0.035, pigPen.z]}>
        <planeGeometry args={[pigPen.width - 0.2, pigPen.depth - 0.2]} />
        <meshStandardMaterial color={pigPen.color} />
      </mesh>
      <Text position={[pigPen.x, 1.08, pigPen.z]} anchorX="center" anchorY="middle" fontSize={0.54} color="#fff0d9">
        CHUỒNG HEO
      </Text>
    </group>
  );
}

function LuckyNumberLayout({ plan }) {
  const { wheel } = plan.layout;
  return (
    <group>
      <RoomShell plan={plan} />
      <group position={[wheel.x, 0, wheel.z]}>
        <mesh castShadow receiveShadow position={[0, 0.48, 0]}>
          <cylinderGeometry args={[wheel.radius, wheel.radius * 0.92, 0.32, 48]} />
          <meshStandardMaterial color="#d6a64d" metalness={0.55} roughness={0.3} />
        </mesh>
        <mesh castShadow position={[0, 0.68, 0]}>
          <cylinderGeometry args={[wheel.radius * 0.82, wheel.radius * 0.82, 0.12, 12]} />
          <meshStandardMaterial color="#416c5a" metalness={0.25} roughness={0.36} />
        </mesh>
        <mesh castShadow position={[0, 1.05, 0]}>
          <coneGeometry args={[0.34, 0.72, 8]} />
          <meshStandardMaterial color="#e9c977" metalness={0.4} />
        </mesh>
        <Text position={[0, 1.1, wheel.radius + 0.2]} anchorX="center" anchorY="middle" fontSize={0.32} color="#fff8e4">
          QUAY SỐ
        </Text>
      </group>
      <Text position={[wheel.x, 2.15, wheel.z]} anchorX="center" anchorY="middle" fontSize={0.42} color="#34483f">
        VÒNG QUAY MAY MẮN
      </Text>
    </group>
  );
}

function TeamRoomLayout({ plan }) {
  const { startPlatform } = plan.layout;
  const { arena } = plan.layout;
  const arenaWidth = arena.maxX - arena.minX;
  const arenaDepth = arena.maxZ - arena.minZ;
  const arenaCenterX = (arena.minX + arena.maxX) / 2;
  const arenaCenterZ = (arena.minZ + arena.maxZ) / 2;
  return (
    <group>
      <RoomShell plan={plan} />
      <mesh receiveShadow rotation-x={-Math.PI / 2} position={[arenaCenterX, 0.045, arenaCenterZ]}>
        <planeGeometry args={[arenaWidth, arenaDepth]} />
        <meshStandardMaterial color="#9eaf9f" transparent opacity={0.34} />
      </mesh>
      <mesh castShadow receiveShadow position={[startPlatform.x, 0.3, startPlatform.z]}>
        <boxGeometry args={[startPlatform.width, 0.6, startPlatform.depth]} />
        <meshStandardMaterial color="#836345" />
      </mesh>
      <mesh castShadow position={[startPlatform.x, 0.66, startPlatform.z]}>
        <boxGeometry args={[startPlatform.width * 0.8, 0.16, startPlatform.depth * 0.8]} />
        <meshStandardMaterial color="#d9b366" metalness={0.3} />
      </mesh>
      <Text position={[startPlatform.x, 1.1, startPlatform.z]} anchorX="center" anchorY="middle" fontSize={0.4} color="#35473e">
        {plan.layout.title}
      </Text>
      <Text position={[0, 0.1, 8.5]} rotation={[-Math.PI / 2, 0, 0]} anchorX="center" anchorY="middle" fontSize={0.48} color="#4a6252">
        CHẠY ĐẾN BẮT LÁ BÀI
      </Text>
    </group>
  );
}

function FlyingTeamCard({ card }) {
  const groupRef = useRef(null);

  useFrame(({ clock }, delta) => {
    if (!groupRef.current) return;
    groupRef.current.position.x = MathUtils.lerp(groupRef.current.position.x, card.x, 0.24);
    groupRef.current.position.z = MathUtils.lerp(groupRef.current.position.z, card.z, 0.24);
    groupRef.current.position.y = 1.2 + Math.sin(clock.getElapsedTime() * 5 + card.id.length) * 0.3;
    groupRef.current.rotation.y += delta * 1.8;
    groupRef.current.rotation.z = Math.sin(clock.getElapsedTime() * 2.5 + card.id.length) * 0.14;
  });

  return (
    <group ref={groupRef} position={[card.x, 1.2, card.z]}>
      <mesh castShadow>
        <boxGeometry args={[0.72, 0.12, 1]} />
        <meshStandardMaterial color="#f3d27d" metalness={0.24} roughness={0.38} emissive="#a9792e" emissiveIntensity={0.24} />
      </mesh>
      <mesh position={[0, 0.075, 0]}>
        <boxGeometry args={[0.56, 0.035, 0.82]} />
        <meshStandardMaterial color="#416c5a" />
      </mesh>
      <Text position={[0, 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]} anchorX="center" anchorY="middle" fontSize={0.42} color="#fff4d5">
        ?
      </Text>
      <pointLight position={[0, 0.38, 0]} color="#f4d27c" intensity={0.6} distance={2.2} />
    </group>
  );
}

// ── Chess table surface helpers ──────────────────────────────────────────────
// 3D board surfaces and piece models live in ./chess-pieces-3d.jsx

// ── Chess Table (board + legs + seats) ────────────────────────────────────────

const TABLE_CONFIGS = {
  caro:    { tableColor: '#6b4c2a', legColor: '#5a3d1e', width: 1.5, depth: 1.5, height: 0.76, boardW: 1.15, boardD: 1.15 },
  xiangqi: { tableColor: '#7a5528', legColor: '#63421a', width: 1.6, depth: 1.8, height: 0.76, boardW: 1.05, boardD: 1.15 },
  chess:   { tableColor: '#5c3d1a', legColor: '#4a2f0e', width: 1.6, depth: 1.6, height: 0.76, boardW: 1.0,  boardD: 1.0  },
  dongtay: { tableColor: '#2d4a2d', legColor: '#1e3a1e', width: 1.8, depth: 2.0, height: 0.76, boardW: 1.2,  boardD: 1.4  },
};

function ChessTable({ table, seatColor, seatBackColor }) {
  const cfg = TABLE_CONFIGS[table.type] || TABLE_CONFIGS.chess;
  const { width, depth, height, tableColor, legColor, boardW, boardD } = cfg;
  const legHalf = 0.065;
  const legPositions = [
    [-width / 2 + legHalf + 0.02, depth / 2 - legHalf - 0.02],
    [ width / 2 - legHalf - 0.02, depth / 2 - legHalf - 0.02],
    [-width / 2 + legHalf + 0.02, -depth / 2 + legHalf + 0.02],
    [ width / 2 - legHalf - 0.02, -depth / 2 + legHalf + 0.02],
  ];

  const BoardSurface = table.type === 'caro' ? CaroBoardSurface
    : table.type === 'xiangqi' ? XiangqiBoardSurface
    : table.type === 'dongtay' ? DongtayBoardSurface
    : ChessBoardSurface;

  const labelColors = { caro: '#f0e0a0', xiangqi: '#ffe0b0', chess: '#faebd7' };
  const labelColor = labelColors[table.type] || '#f5deb3';

  return (
    <group position={[table.x, 0, table.z]}>
      {/* table top */}
      <mesh castShadow receiveShadow position={[0, height, 0]}>
        <boxGeometry args={[width, 0.06, depth]} />
        <meshStandardMaterial color={tableColor} roughness={0.7} metalness={0.05} />
      </mesh>
      {/* board surface on top */}
      <group position={[0, height + 0.033, 0]}>
        <BoardSurface />
      </group>
      {/* table legs */}
      {legPositions.map(([lx, lz], i) => (
        <mesh key={i} castShadow receiveShadow position={[lx, height / 2, lz]}>
          <boxGeometry args={[legHalf * 2, height, legHalf * 2]} />
          <meshStandardMaterial color={legColor} roughness={0.85} />
        </mesh>
      ))}
      {/* label above table */}
      <Text
        position={[0, height + 0.62, -depth / 2 - 0.1]}
        anchorX="center"
        anchorY="middle"
        fontSize={0.22}
        color={labelColor}
        maxWidth={2}
      >
        {table.label}
      </Text>
      {/* seats */}
      {table.seats.map((seat, i) => (
        <Chair
          key={`seat-${i}`}
          position={[seat.dx, 0, seat.dz]}
          rotation={seat.rotation}
          colors={{ seat: seatColor, back: seatBackColor, base: seatBackColor }}
        />
      ))}
    </group>
  );
}

// ── Section divider strip ─────────────────────────────────────────────────────

function SectionDivider({ x, minZ, maxZ, color }) {
  const centerZ = (minZ + maxZ) / 2;
  const len = maxZ - minZ;
  return (
    <mesh receiveShadow rotation-x={-Math.PI / 2} position={[x, 0.03, centerZ]}>
      <planeGeometry args={[0.08, len]} />
      <meshStandardMaterial color={color} roughness={0.9} transparent opacity={0.6} />
    </mesh>
  );
}

// ── Chess Room Layout ─────────────────────────────────────────────────────────

function ChessRoomLayout({ plan }) {
  const { tables, sectionLabels, decorPillars, wallLamps } = plan.layout;
  const seatColor = '#8b6914';
  const seatBackColor = '#6b4c2a';
  const pillarColor = plan.theme.wallColor || '#a89268';
  const lampColor = '#f5e6b0';

  return (
    <group>
      <RoomShell plan={plan} />

      {/* Section header banner */}
      <Text
        position={[0, 3.8, plan.bounds.minZ + 1.2]}
        anchorX="center"
        anchorY="middle"
        fontSize={0.6}
        color="#5c3d0a"
      >
        {plan.layout.title}
      </Text>

      {/* Section labels on floor */}
      {sectionLabels.map((lbl, i) => (
        <Text
          key={i}
          position={[lbl.x, 0.08, lbl.z]}
          rotation={[-Math.PI / 2, 0, 0]}
          anchorX="center"
          anchorY="middle"
          fontSize={0.55}
          color="#7a5c1e"
        >
          {lbl.text}
        </Text>
      ))}

      {/* Section dividers */}
      <SectionDivider x={-6}  minZ={plan.bounds.minZ + 1} maxZ={plan.bounds.maxZ - 3} color="#8b7040" />
      <SectionDivider x={6}   minZ={plan.bounds.minZ + 1} maxZ={plan.bounds.maxZ - 3} color="#8b7040" />

      {/* Chess tables */}
      {tables.map((table) => (
        <ChessTable
          key={table.id}
          table={table}
          seatColor={seatColor}
          seatBackColor={seatBackColor}
        />
      ))}

      {/* Decorative corner pillars */}
      {decorPillars.map((pillar, i) => (
        <group key={`pillar-${i}`} position={[pillar.x, 0, pillar.z]}>
          <mesh castShadow receiveShadow position={[0, 2.1, 0]}>
            <cylinderGeometry args={[0.28, 0.34, 4.2, 8]} />
            <meshStandardMaterial color={pillarColor} roughness={0.92} />
          </mesh>
          <mesh castShadow position={[0, 4.28, 0]}>
            <cylinderGeometry args={[0.42, 0.42, 0.28, 8]} />
            <meshStandardMaterial color={pillarColor} roughness={0.88} />
          </mesh>
          {/* pillar base */}
          <mesh castShadow receiveShadow position={[0, 0.1, 0]}>
            <cylinderGeometry args={[0.42, 0.42, 0.2, 8]} />
            <meshStandardMaterial color={pillarColor} roughness={0.92} />
          </mesh>
        </group>
      ))}

      {/* Wall lamps */}
      {wallLamps.map((lamp, i) => (
        <group key={`lamp-${i}`} position={[lamp.x, 2.6, lamp.z]}>
          <mesh castShadow position={[0, 0, 0]}>
            <sphereGeometry args={[0.18, 10, 8]} />
            <meshStandardMaterial
              color={lampColor}
              emissive={lampColor}
              emissiveIntensity={0.9}
              roughness={0.4}
            />
          </mesh>
          <pointLight color="#ffe8b0" intensity={1.2} distance={7} castShadow={false} />
        </group>
      ))}
    </group>
  );
}

function RoomLayout({ plan, workstations, audioControlRef, onAudioStatusChange }) {
  if (plan.layout?.kind === 'werewolf') return <WerewolfLayout plan={plan} />;
  if (plan.layout?.kind === 'quiz') return <QuizLayout plan={plan} />;
  if (plan.layout?.kind === 'lucky-number') return <LuckyNumberLayout plan={plan} />;
  if (plan.layout?.kind === 'teams') return <TeamRoomLayout plan={plan} />;
  if (plan.layout?.kind === 'chess-room') return <ChessRoomLayout plan={plan} />;
  if (plan.layout?.kind === 'concert') {
    return (
      <ConcertLayout
        plan={plan}
        audioControlRef={audioControlRef}
        onAudioStatusChange={onAudioStatusChange}
      />
    );
  }
  return <FixedOfficeLayout plan={plan} workstations={workstations} />;
}

function getBoundaryWalls(plan) {
  // Outdoor venues (e.g. the concert layout) have no perimeter walls.
  if (plan.layout?.kind === 'concert') return [];
  const { minX, maxX, minZ, maxZ } = plan.bounds;
  const entranceGap = plan.entrance?.wallSide === 'right' ? plan.entrance.wallGap : null;
  const rightSegments = entranceGap
    ? [[minZ, entranceGap.minZ], [entranceGap.maxZ, maxZ]]
    : [[minZ, maxZ]];
  const centerZ = (minZ + maxZ) / 2;
  const centerX = (minX + maxX) / 2;
  const depth = maxZ - minZ;

  return [
    { position: [minX, 1.5, centerZ], size: [0.25, 3, depth] },
    ...rightSegments.filter(([start, end]) => end > start).map(([start, end]) => ({
      position: [maxX, 1.5, (start + end) / 2],
      size: [0.25, 3, end - start],
    })),
    { position: [centerX, 1.5, minZ], size: [maxX - minX, 3, 0.25] },
    { position: [centerX, 1.5, maxZ], size: [maxX - minX, 3, 0.25] },
  ];
}

function OfficeBoundary({ plan }) {
  const color = plan.theme?.wallColor || '#c7d5de';
  return getBoundaryWalls(plan).map((wall, index) => (
    <Wall key={`boundary-${index}`} position={wall.position} size={wall.size} color={color} />
  ));
}

function getOfficeObstacles(plan, workstations) {
  const { minX, maxX, minZ, maxZ } = plan.bounds;
  const { desk } = plan.workstations;
  const obstacles = workstations.map(({ x, z }) => ({
    x,
    z,
    width: desk.width,
    depth: desk.depth,
  }));

  for (const room of plan.meetingRooms) {
    const halfWidth = room.width / 2;
    const halfDepth = room.depth / 2;
    const doorSideWidth = (room.width - room.doorWidth) / 2;
    obstacles.push(
      { x: room.x, z: room.z - halfDepth, width: room.width, depth: room.wallThickness },
      { x: room.x - halfWidth, z: room.z, width: room.wallThickness, depth: room.depth },
      { x: room.x + halfWidth, z: room.z, width: room.wallThickness, depth: room.depth },
      { x: room.x - room.doorWidth / 2 - doorSideWidth / 2, z: room.z + halfDepth, width: doorSideWidth, depth: room.wallThickness },
      { x: room.x + room.doorWidth / 2 + doorSideWidth / 2, z: room.z + halfDepth, width: doorSideWidth, depth: room.wallThickness },
      {
        x: room.x + room.table.x,
        z: room.z + room.table.z,
        width: room.table.width,
        depth: room.table.depth,
      },
    );
  }

  if (plan.layout?.kind === 'werewolf') {
    const { altar, pillars } = plan.layout;
    obstacles.push(
      { x: altar.x, z: altar.z, width: altar.width, depth: altar.depth },
      ...buildWerewolfSeats(plan.layout).map((seat) => ({ x: seat.x, z: seat.z, width: 0.8, depth: 0.8 })),
      ...pillars.map((pillar) => ({ x: pillar.x, z: pillar.z, width: pillar.radius * 2, depth: pillar.radius * 2 })),
    );
  }

  if (plan.layout?.kind === 'chess-room') {
    const { tables, decorPillars } = plan.layout;
    for (const table of tables) {
      const cfg = { caro: [1.5, 1.5], xiangqi: [1.6, 1.8], chess: [1.6, 1.6] };
      const [tw, td] = cfg[table.type] || [1.6, 1.6];
      obstacles.push({ x: table.x, z: table.z, width: tw + 0.2, depth: td + 0.2 });
      for (const seat of table.seats) {
        obstacles.push({ x: table.x + seat.dx, z: table.z + seat.dz, width: 0.75, depth: 0.75 });
      }
    }
    for (const pillar of (decorPillars || [])) {
      obstacles.push({ x: pillar.x, z: pillar.z, width: 0.9, depth: 0.9 });
    }
  }

  if (plan.layout?.kind === 'concert') {
    const { stage } = plan.layout;
    // The field is freely walkable. Only genuine hard structures block the
    // player; seated tiers are walkable (elevation handled separately) and
    // standing areas / wings stay open for free roaming.
    if (stage) {
      obstacles.push({ x: stage.x, z: stage.z, width: stage.width, depth: stage.depth + 4 });
      if (stage.runway) {
        obstacles.push({
          x: stage.x,
          z: stage.z + stage.depth / 2 + stage.runway.length / 2,
          width: stage.runway.width,
          depth: stage.runway.length,
        });
      }
    }
    if (plan.layout.gate) {
      const gate = plan.layout.gate;
      obstacles.push(
        { x: gate.x - gate.width * 0.5, z: gate.z, width: gate.width * 0.26, depth: 0.8 },
        { x: gate.x + gate.width * 0.5, z: gate.z, width: gate.width * 0.26, depth: 0.8 },
      );
    }
    if (plan.layout.eventBoundary) {
      obstacles.push(...getConcertBoundarySegments(plan.layout.eventBoundary));
    }
    obstacles.push(...getConcertStandingBoundaryObstacles(plan.layout));
  }

  for (const wall of getBoundaryWalls(plan)) {
    obstacles.push({
      x: wall.position[0],
      z: wall.position[2],
      width: wall.size[0],
      depth: wall.size[2],
    });
  }

  return obstacles;
}

function getAvatarAnimation(state) {
  if (state === 'walk') return 'walk';
  return 'idle';
}

function CharacterMedia({ stream, hasVideo, hasAudio, local }) {
  const [videoTexture, setVideoTexture] = useState(null);
  const [aspectRatio, setAspectRatio] = useState(16 / 9);

  useEffect(() => {
    if (!hasVideo || !stream) {
      setVideoTexture(null);
      return undefined;
    }

    const video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;
    video.autoplay = true;
    video.playsInline = true;
    const texture = new VideoTexture(video);
    texture.colorSpace = SRGBColorSpace;
    setVideoTexture(texture);

    const updateAspectRatio = () => {
      if (video.videoWidth && video.videoHeight) {
        setAspectRatio(video.videoWidth / video.videoHeight);
      }
    };
    video.addEventListener('loadedmetadata', updateAspectRatio);
    video.addEventListener('resize', updateAspectRatio);
    video.play().catch(() => {});

    return () => {
      video.removeEventListener('loadedmetadata', updateAspectRatio);
      video.removeEventListener('resize', updateAspectRatio);
      video.pause();
      video.srcObject = null;
      texture.dispose();
    };
  }, [hasVideo, stream]);

  useEffect(() => {
    if (local || !stream?.getAudioTracks().length) return undefined;
    const audio = new Audio();
    audio.srcObject = stream;
    audio.autoplay = true;
    audio.play().catch(() => {});
    return () => {
      audio.pause();
      audio.srcObject = null;
    };
  }, [local, stream]);

  return (
    <>
      {hasVideo && videoTexture && (
        <Billboard position={[0, 3.7, 0]}>
          <mesh>
            <planeGeometry args={[1.02 * aspectRatio, 1.02]} />
            <meshBasicMaterial map={videoTexture} side={DoubleSide} toneMapped={false} />
          </mesh>
        </Billboard>
      )}
      {hasAudio && !hasVideo && (
        <Text position={[0, 3.2, 0]} anchorX="center" anchorY="middle" fontSize={0.18} color="#26775b">
          VOICE
        </Text>
      )}
    </>
  );
}

export function Character({ position, direction, isMoving, isSitting = false, interaction = null, interactionAt = 0, name = '', remote = false, stream = null, hasVideo = false, hasAudio = false, avatar = DEFAULT_AVATAR, elevation = 0 }) {
  const rootRef = useRef();
  const bodyRef = useRef();
  const leftLegRef = useRef();
  const rightLegRef = useRef();
  const leftArmRef = useRef();
  const rightArmRef = useRef();

  useFrame(({ clock }) => {
    if (!bodyRef.current) return;
    if (rootRef.current) {
      rootRef.current.position.x = MathUtils.lerp(rootRef.current.position.x, position.x, remote ? 0.24 : 0.7);
      rootRef.current.position.z = MathUtils.lerp(rootRef.current.position.z, position.z, remote ? 0.24 : 0.7);
      rootRef.current.position.y = MathUtils.lerp(rootRef.current.position.y, 0.5 + (elevation || 0), remote ? 0.24 : 0.5);
    }
    const t = clock.getElapsedTime();
    const swing = isMoving ? Math.sin(t * 12) * 0.35 : 0;
    const interactionDuration = interaction === 'hug' ? 1000 : 480;
    const interactionProgress = interaction ? Math.min(1, Math.max(0, (Date.now() - interactionAt) / interactionDuration)) : 1;
    const interactionPulse = interaction ? Math.sin(interactionProgress * Math.PI) : 0;
    const isHugging = interaction === 'hug' && interactionProgress < 1;
    const isPunching = interaction === 'punch' && interactionProgress < 1;
    const isReacting = interaction === 'recoil' && interactionProgress < 1;
    const legAngle = isSitting ? -Math.PI / 2 : swing;
    const armAngle = isSitting ? -Math.PI / 4 : -swing;
    bodyRef.current.position.y = MathUtils.lerp(bodyRef.current.position.y, isSitting ? -0.25 : 0, 0.12);
    bodyRef.current.position.z = MathUtils.lerp(bodyRef.current.position.z, isReacting ? -interactionPulse * 0.16 : 0, 0.2);
    if (leftLegRef.current) leftLegRef.current.rotation.x = MathUtils.lerp(leftLegRef.current.rotation.x, legAngle, 0.12);
    if (rightLegRef.current) rightLegRef.current.rotation.x = MathUtils.lerp(rightLegRef.current.rotation.x, isSitting ? -Math.PI / 2 : -swing, 0.12);
    if (leftArmRef.current) {
      leftArmRef.current.rotation.x = MathUtils.lerp(leftArmRef.current.rotation.x, isHugging ? -interactionPulse * 0.9 : isReacting ? -interactionPulse * 0.9 : armAngle, 0.18);
      leftArmRef.current.rotation.z = MathUtils.lerp(leftArmRef.current.rotation.z, isHugging ? interactionPulse * 0.85 : 0, 0.18);
    }
    if (rightArmRef.current) {
      rightArmRef.current.rotation.x = MathUtils.lerp(rightArmRef.current.rotation.x, isPunching ? -interactionPulse * 1.45 : isHugging || isReacting ? -interactionPulse * 0.9 : armAngle, 0.24);
      rightArmRef.current.rotation.z = MathUtils.lerp(rightArmRef.current.rotation.z, isHugging ? -interactionPulse * 0.85 : 0, 0.18);
      rightArmRef.current.position.z = MathUtils.lerp(rightArmRef.current.position.z, isPunching ? interactionPulse * 0.32 : 0, 0.24);
    }

    const targetRotation = Math.atan2(direction.x, direction.z);
    bodyRef.current.rotation.y = MathUtils.lerp(bodyRef.current.rotation.y, targetRotation, 0.12);
  });

  return (
    <group ref={rootRef} position={[position.x, 0.5, position.z]}>
      <group ref={bodyRef}>
        <mesh castShadow position={[0, 0.8, 0]}>
          <boxGeometry args={[0.6, 0.9, 0.38]} />
          <meshStandardMaterial color={avatar.shirt} />
        </mesh>
        <mesh castShadow position={[0, 1.7, 0]}>
          <sphereGeometry args={[0.33, 12, 12]} />
          <meshStandardMaterial color={avatar.skin} />
        </mesh>
        {[-1, 1].map((side) => (
          <group key={side}>
            <mesh position={[side * 0.11, 1.75, 0.3]}>
              <sphereGeometry args={[0.045, 10, 8]} />
              <meshStandardMaterial color="#fffaf0" />
            </mesh>
            <mesh position={[side * 0.11, 1.75, 0.326]}>
              <sphereGeometry args={[0.028, 8, 8]} />
              <meshStandardMaterial color={avatar.eye} />
            </mesh>
            <mesh position={[side * 0.11, 1.75, 0.35]}>
              <sphereGeometry args={[0.012, 8, 8]} />
              <meshStandardMaterial color="#17232c" />
            </mesh>
          </group>
        ))}
        <mesh position={[0, 1.66, 0.326]}>
          <sphereGeometry args={[0.035, 8, 8]} />
          <meshStandardMaterial color="#d99f7f" />
        </mesh>
        <mesh position={[0, 1.56, 0.3]}>
          <boxGeometry args={[0.11, 0.022, 0.018]} />
          <meshStandardMaterial color={avatar.mouth} />
        </mesh>
        {avatar.hairstyle !== 'bald' && (
          <HairCap color={avatar.hair} />
        )}
        {avatar.hairstyle === 'spiky' && (
          <>
            {[-0.13, 0, 0.13].map((x) => (
              <mesh key={x} castShadow position={[x, 2.08, 0.19]} rotation={[0, 0, x * 2]}>
                <coneGeometry args={[0.09, 0.24, 5]} />
                <meshStandardMaterial color={avatar.hair} />
              </mesh>
            ))}
          </>
        )}
        {['long', 'bob'].includes(avatar.hairstyle) && (
          <>
            {[-1, 1].map((side) => (
              <mesh key={side} castShadow position={[side * 0.27, avatar.hairstyle === 'long' ? 1.57 : 1.68, 0]}>
                <boxGeometry args={[0.12, avatar.hairstyle === 'long' ? 0.72 : 0.48, 0.25]} />
                <meshStandardMaterial color={avatar.hair} />
              </mesh>
            ))}
          </>
        )}
        {avatar.hairstyle === 'curly' && [-0.2, -0.07, 0.07, 0.2].map((x) => (
          <mesh key={x} castShadow position={[x, 1.98, 0.06]}>
            <sphereGeometry args={[0.14, 8, 8]} />
            <meshStandardMaterial color={avatar.hair} />
          </mesh>
        ))}
        {avatar.hairstyle === 'ponytail' && (
          <>
            <mesh castShadow position={[0, 1.58, -0.2]} rotation={[0.2, 0, 0]}>
              <boxGeometry args={[0.16, 0.62, 0.18]} />
              <meshStandardMaterial color={avatar.hair} />
            </mesh>
          </>
        )}
        {avatar.accessory === 'glasses' && (
          <mesh castShadow position={[0, 1.78, 0.3]}>
            <boxGeometry args={[0.44, 0.12, 0.08]} />
            <meshStandardMaterial color="#17232c" />
          </mesh>
        )}
        {avatar.accessory === 'cap' && (
          <>
            <mesh castShadow position={[0, 2.04, 0.02]}>
              <boxGeometry args={[0.5, 0.14, 0.44]} />
              <meshStandardMaterial color={avatar.hair} />
            </mesh>
            <mesh castShadow position={[0, 2, 0.28]}>
              <boxGeometry args={[0.42, 0.05, 0.22]} />
              <meshStandardMaterial color={avatar.hair} />
            </mesh>
          </>
        )}
        {avatar.accessory === 'headphones' && (
          <>
            <mesh castShadow position={[0, 2.02, 0]}>
              <boxGeometry args={[0.42, 0.07, 0.1]} />
              <meshStandardMaterial color="#354b52" />
            </mesh>
            {[-1, 1].map((side) => (
              <mesh key={side} castShadow position={[side * 0.34, 1.72, 0]}>
                <boxGeometry args={[0.12, 0.28, 0.2]} />
                <meshStandardMaterial color="#d56f5e" />
              </mesh>
            ))}
          </>
        )}
        {avatar.accessory === 'crown' && (
          <>
            <mesh castShadow position={[0, 2.02, 0.02]}>
              <boxGeometry args={[0.42, 0.08, 0.3]} />
              <meshStandardMaterial color="#d5a52e" metalness={0.45} />
            </mesh>
            {[-0.14, 0, 0.14].map((x) => (
              <mesh key={x} castShadow position={[x, 2.15, 0.02]}>
                <coneGeometry args={[0.07, 0.2, 4]} />
                <meshStandardMaterial color="#d5a52e" metalness={0.45} />
              </mesh>
            ))}
          </>
        )}
        {avatar.accessory === 'bow' && (
          <>
            {[-1, 1].map((side) => (
              <mesh key={side} castShadow position={[side * 0.16, 2, 0.22]} rotation={[0, 0, side * 0.3]}>
                <sphereGeometry args={[0.12, 8, 8]} />
                <meshStandardMaterial color="#d56f5e" />
              </mesh>
            ))}
            <mesh castShadow position={[0, 2, 0.24]}>
              <sphereGeometry args={[0.07, 8, 8]} />
              <meshStandardMaterial color="#f0c7a3" />
            </mesh>
          </>
        )}
        <group ref={leftArmRef} position={[-0.42, 1.1, 0]}>
          <mesh castShadow position={[0, -0.42, 0]}>
            <boxGeometry args={[0.13, 0.75, 0.13]} />
            <meshStandardMaterial color={avatar.skin} />
          </mesh>
        </group>
        <group ref={rightArmRef} position={[0.42, 1.1, 0]}>
          <mesh castShadow position={[0, -0.42, 0]}>
            <boxGeometry args={[0.13, 0.75, 0.13]} />
            <meshStandardMaterial color={avatar.skin} />
          </mesh>
        </group>
        <group ref={leftLegRef} position={[-0.18, 0.1, 0]}>
          <mesh castShadow position={[0, -0.46, 0]}>
            <boxGeometry args={[0.16, 0.75, 0.16]} />
            <meshStandardMaterial color={avatar.pants} />
          </mesh>
        </group>
        <group ref={rightLegRef} position={[0.18, 0.1, 0]}>
          <mesh castShadow position={[0, -0.46, 0]}>
            <boxGeometry args={[0.16, 0.75, 0.16]} />
            <meshStandardMaterial color={avatar.pants} />
          </mesh>
        </group>
      </group>
      {name && (
        <Text
          position={[0, isSitting ? 2.4 : 2.65, 0]}
          anchorX="center"
          anchorY="middle"
          fontSize={0.22}
          outlineWidth={0.025}
          outlineColor={remote ? '#26775b' : '#18283b'}
          color="white"
        >
          {name}
        </Text>
      )}
      {stream && (
        <CharacterMedia stream={stream} hasVideo={hasVideo} hasAudio={hasAudio} local={!remote} />
      )}
    </group>
  );
}

export function AvatarPreview({ avatar = DEFAULT_AVATAR }) {
  return (
    <>
      <ambientLight intensity={1.1} />
      <directionalLight position={[3, 5, -4]} intensity={2} />
      <Character
        position={{ x: 0, z: 0 }}
        direction={{ x: 0, z: -1 }}
        isMoving={false}
        avatar={avatar}
      />
      <OrbitControls
        target={[0, 1.65, 0]}
        enablePan={false}
        enableZoom
        minDistance={3.5}
        maxDistance={9}
        minPolarAngle={0.65}
        maxPolarAngle={2.45}
      />
    </>
  );
}

export default function OfficeScene({
  roomType = 'office',
  debugMode = false,
  joystickInputRef: externalJoystickInputRef,
  playerName = 'Bạn',
  initialSpawn = null,
  resetPositionRequest = 0,
  teleportRequest = null,
  localMediaStream = null,
  localAudioEnabled = false,
  localVideoEnabled = false,
  localPeerId = null,
  localAvatar = DEFAULT_AVATAR,
  remotePlayers = [],
  werewolfCards = [],
  teamCards = [],
  isQuizEliminated = false,
  canManageQuiz = false,
  canManageLuckyNumber = false,
  onRitualRangeChange,
  onRitualInteract,
  onQuizRangeChange,
  onQuizInteract,
  onLuckyNumberRangeChange,
  onLuckyNumberInteract,
  onChessBotRangeChange,
  onChessBotOpen,
  onPlayerInteraction,
  onPlayerState,
  concertNight,
  concertView,
  onConcertViewChange,
  audioControlRef,
  onAudioStatusChange,
}) {
  const floorPlanConfig = getFloorPlanConfig(roomType);
  const [loadedFloorPlan, setLoadedFloorPlan] = useState(null);
  const floorPlan = loadedFloorPlan?.roomType === roomType ? loadedFloorPlan.plan : floorPlanConfig.definition;
  const workstations = useMemo(() => buildWorkstations(floorPlan), [floorPlan]);
  const obstacles = useMemo(() => getOfficeObstacles(floorPlan, workstations), [floorPlan, workstations]);
  const { minX, maxX, minZ, maxZ } = floorPlan.bounds;
  const debugCamera = floorPlan.layout?.debugCamera;
  // Larger rooms get a faster character so crossing them doesn't feel sluggish.
  // Scale the base speed by the room diagonal relative to a reference size,
  // clamped so small rooms stay at 1× and very large rooms cap out.
  const moveSpeedScale = useMemo(() => {
    const diagonal = Math.hypot(maxX - minX, maxZ - minZ);
    const REFERENCE_DIAGONAL = 24; // ~ the standard office size
    const scale = diagonal / REFERENCE_DIAGONAL;
    return clamp(scale, 1, 2.2);
  }, [minX, maxX, minZ, maxZ]);
  const theme = floorPlan.theme || {};
  const startingPosition = initialSpawn || getDefaultSpawn(floorPlan);
  const [target, setTarget] = useState(null);
  const [path, setPath] = useState([]);
  const [position, setPosition] = useState(() => ({ x: startingPosition.x, z: startingPosition.z }));
  const debugAltitudeRef = useRef(0);
  const debugCameraTargetRef = useRef({
    x: debugCamera?.x ?? (minX + maxX) / 2,
    z: debugCamera?.z ?? (minZ + maxZ) / 2,
  });
  const debugCameraHeightRef = useRef(
    debugCamera?.height ?? Math.max(maxX - minX, maxZ - minZ) * 1.8,
  );
  const [isMoving, setIsMoving] = useState(false);
  const [isSitting, setIsSitting] = useState(false);
  const [direction, setDirection] = useState({ x: 0, z: -1 });
  const keyState = useRef({});
  const internalJoystickInputRef = useRef({ x: 0, y: 0 });
  const joystickInputRef = externalJoystickInputRef ?? internalJoystickInputRef;
  const isSittingRef = useRef(isSitting);
  const positionRef = useRef(position);
  const floorPlanRef = useRef(floorPlan);
  const ritualRangeCallback = useRef(onRitualRangeChange);
  const ritualInteractCallback = useRef(onRitualInteract);
  const quizRangeCallback = useRef(onQuizRangeChange);
  const quizInteractCallback = useRef(onQuizInteract);
  const luckyRangeCallback = useRef(onLuckyNumberRangeChange);
  const luckyInteractCallback = useRef(onLuckyNumberInteract);
  const quizManagerRef = useRef(canManageQuiz);
  const luckyManagerRef = useRef(canManageLuckyNumber);
  const quizEliminatedRef = useRef(isQuizEliminated);
  const wasQuizEliminated = useRef(false);
  const remotePlayersRef = useRef(remotePlayers);
  const interactionCallbackRef = useRef(onPlayerInteraction);
  const interactionTriggerRef = useRef(null);
  const seatInteractionRef = useRef(null);
  const [interaction, setInteraction] = useState(null);
  const [interactionAt, setInteractionAt] = useState(0);
  const isConcert = roomType === 'concert';
  // Concert runs as a night show by default; users can switch to a daytime sky.
  // These can be driven by the parent (fixed DOM controls outside the 3D canvas).
  const [internalNightMode, setInternalNightMode] = useState(true);
  const isNightMode = concertNight ?? internalNightMode;
  // Camera modes: 'iso' (default follow), 'third' (behind player), 'first' (eye level).
  const [internalViewMode, setInternalViewMode] = useState('iso');
  const viewMode = concertView ?? internalViewMode;
  const viewModeRef = useRef(viewMode);
  viewModeRef.current = viewMode;

  useEffect(() => {
    debugCameraTargetRef.current = {
      x: debugCamera?.x ?? (minX + maxX) / 2,
      z: debugCamera?.z ?? (minZ + maxZ) / 2,
    };
    debugCameraHeightRef.current = debugCamera?.height
      ?? Math.max(maxX - minX, maxZ - minZ) * 1.8;
  }, [debugCamera?.height, debugCamera?.x, debugCamera?.z, maxX, maxZ, minX, minZ]);
  const [playerElevation, setPlayerElevation] = useState(0);
  const playerElevationRef = useRef(0);
  // First-person mouse-look state (pointer lock), used only in concert FP mode.
  const fpYawRef = useRef(0);
  const fpPitchRef = useRef(0);
  const fpLockedRef = useRef(false);
  const fpTouchLookRef = useRef(null);
  const debugViewWheelAtRef = useRef(0);
  const { gl } = useThree();
  const knockbackRef = useRef({ x: 0, z: 0, duration: 0.28, remaining: 0 });
  const handledInteractionRef = useRef(null);
  const wasInRitualRange = useRef(false);
  const wasInQuizChestRange = useRef(false);
  const wasInLuckyWheelRange = useRef(false);
  const [nearestChessTable, setNearestChessTable] = useState(null);
  const nearestChessTableRef = useRef(null);
  const wasInChessTableRange = useRef(null);
  const chessBotRangeCallback = useRef(onChessBotRangeChange);
  const chessBotOpenCallback = useRef(onChessBotOpen);
  const cameraGoal = useRef(new Vector3(12, 13, 12));
  const stateBroadcastTime = useRef(0);
  const lastHandledResetRequest = useRef(resetPositionRequest);
  const lastHandledTeleportRequest = useRef(teleportRequest?.requestId ?? 0);
  positionRef.current = position;
  isSittingRef.current = isSitting;
  floorPlanRef.current = floorPlan;
  ritualRangeCallback.current = onRitualRangeChange;
  ritualInteractCallback.current = onRitualInteract;
  quizRangeCallback.current = onQuizRangeChange;
  quizInteractCallback.current = onQuizInteract;
  quizManagerRef.current = canManageQuiz;
  luckyManagerRef.current = canManageLuckyNumber;
  luckyRangeCallback.current = onLuckyNumberRangeChange;
  luckyInteractCallback.current = onLuckyNumberInteract;
  chessBotRangeCallback.current = onChessBotRangeChange;
  chessBotOpenCallback.current = onChessBotOpen;
  quizEliminatedRef.current = isQuizEliminated;
  remotePlayersRef.current = remotePlayers;
  interactionCallbackRef.current = onPlayerInteraction;
  const nearbySeat = useMemo(() => {
    if (roomType !== 'office') return null;
    const closestSeat = workstations.reduce((closest, workstation) => {
      const seat = { x: workstation.x, z: workstation.chairZ, rotation: workstation.chairRotation };
      const distance = Math.hypot(position.x - seat.x, position.z - seat.z);
      return !closest || distance < closest.distance ? { ...seat, distance } : closest;
    }, null);
    return closestSeat?.distance <= 1.35 ? closestSeat : null;
  }, [position.x, position.z, roomType, workstations]);
  const toggleSeat = () => {
    if (roomType !== 'office') return false;
    if (isSittingRef.current) {
      setIsSitting(false);
      return true;
    }
    if (!nearbySeat) return false;
    setPosition({ x: nearbySeat.x, z: nearbySeat.z });
    setDirection({ x: Math.sin(nearbySeat.rotation), z: Math.cos(nearbySeat.rotation) });
    setIsMoving(false);
    setIsSitting(true);
    setTarget(null);
    setPath([]);
    return true;
  };
  seatInteractionRef.current = toggleSeat;
  const nearbyUser = useMemo(() => remotePlayers.reduce((closest, player) => {
    if (!Number.isFinite(player.position?.x) || !Number.isFinite(player.position?.z)) return closest;
    const distance = Math.hypot(position.x - player.position.x, position.z - player.position.z);
    return !closest || distance < closest.distance ? { player, distance } : closest;
  }, null), [position.x, position.z, remotePlayers]);
  const triggerNearbyInteraction = (action) => {
    if (!nearbyUser || nearbyUser.distance > 1.8) return false;
    const currentPosition = positionRef.current;
    const dx = nearbyUser.player.position.x - currentPosition.x;
    const dz = nearbyUser.player.position.z - currentPosition.z;
    const magnitude = Math.hypot(dx, dz) || 1;
    setDirection({ x: dx / magnitude, z: dz / magnitude });
    setInteraction(action);
    setInteractionAt(Date.now());
    interactionCallbackRef.current?.(action, nearbyUser.player.peerId);
    return true;
  };
  interactionTriggerRef.current = triggerNearbyInteraction;

  useEffect(() => {
    let active = true;
    fetch(floorPlanConfig.url)
      .then((response) => {
        if (!response.ok) throw new Error(`Floor plan request failed: ${response.status}`);
        return response.json();
      })
      .then((plan) => {
        if (active) setLoadedFloorPlan({ roomType, plan: validateFloorPlan(plan) });
      })
      .catch((error) => {
        console.warn(`Using the bundled ${roomType} floor plan fallback.`, error);
        if (active) setLoadedFloorPlan({ roomType, plan: floorPlanConfig.definition });
      });

    return () => {
      active = false;
    };
  }, [floorPlanConfig, roomType]);

  useEffect(() => {
    const spawn = initialSpawn || getDefaultSpawn(floorPlan);
    setPosition({ x: spawn.x, z: spawn.z });
    setPath([]);
    setTarget(null);
    setIsSitting(false);
  }, [initialSpawn?.x, initialSpawn?.z, roomType]);

  useEffect(() => {
    if (resetPositionRequest === lastHandledResetRequest.current) return;
    lastHandledResetRequest.current = resetPositionRequest;
    const spawn = getDefaultSpawn(floorPlan);
    setPosition({ x: spawn.x, z: spawn.z });
    setDirection({ x: 0, z: -1 });
    setPath([]);
    setTarget(null);
    setIsMoving(false);
    setIsSitting(false);
    keyState.current = {};
  }, [resetPositionRequest, floorPlan]);

  useEffect(() => {
    if (!teleportRequest || teleportRequest.requestId === lastHandledTeleportRequest.current) return;
    lastHandledTeleportRequest.current = teleportRequest.requestId;
    const destination = { x: teleportRequest.x, z: teleportRequest.z };
    positionRef.current = destination;
    setPosition(destination);
    setDirection({ x: 0, z: -1 });
    setPath([]);
    setTarget(null);
    setIsMoving(false);
    setIsSitting(false);
    keyState.current = {};
    knockbackRef.current.remaining = 0;
  }, [teleportRequest]);

  useEffect(() => {
    if (isQuizEliminated) {
      const spawn = floorPlan.layout?.pigPen?.spawn;
      if (spawn) {
        setPosition({ x: spawn.x, z: spawn.z });
        setPath([]);
        setTarget(null);
        setIsMoving(false);
        setIsSitting(false);
        keyState.current = {};
      }
    } else if (wasQuizEliminated.current && roomType === 'quiz') {
      const spawn = initialSpawn || getDefaultSpawn(floorPlan);
      setPosition({ x: spawn.x, z: spawn.z });
      setPath([]);
      setTarget(null);
      setIsMoving(false);
    }
    wasQuizEliminated.current = isQuizEliminated;
  }, [floorPlan, initialSpawn?.x, initialSpawn?.z, isQuizEliminated, roomType]);

  const moveWithKeyboard = (dt) => {
    if (quizEliminatedRef.current && !debugMode) {
      setIsMoving(false);
      return;
    }
    const keys = keyState.current;
    const joystick = joystickInputRef.current;
    if (debugMode) {
      const dx = (keys.ArrowRight || keys.KeyD ? 1 : 0) - (keys.ArrowLeft || keys.KeyA ? 1 : 0) + joystick.x;
      const dz = (keys.ArrowDown || keys.KeyS ? 1 : 0) - (keys.ArrowUp || keys.KeyW ? 1 : 0) - joystick.y;
      if (dx === 0 && dz === 0) {
        setIsMoving(false);
        return;
      }
      const magnitude = Math.hypot(dx, dz) || 1;
      const nextDirection = { x: dx / magnitude, z: dz / magnitude };
      setDirection(nextDirection);
      setPosition({
        x: position.x + nextDirection.x * dt * 24 * Math.min(1, magnitude),
        z: position.z + nextDirection.z * dt * 24 * Math.min(1, magnitude),
      });
      setIsMoving(true);
      return;
    }
    const firstPerson = isConcert && viewModeRef.current === 'first';
    if (firstPerson) {
      // Camera-relative movement: W/↑ forward, S/↓ back, A/← strafe left, D/→ right.
      const forward = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0) + joystick.y;
      const strafe = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0) + joystick.x;
      if (forward === 0 && strafe === 0) {
        setIsMoving(false);
        return;
      }
      const yaw = fpYawRef.current;
      // Forward is the direction the camera faces on the XZ plane.
      const fx = -Math.sin(yaw);
      const fz = -Math.cos(yaw);
      // Right vector (perpendicular to forward).
      const rx = Math.cos(yaw);
      const rz = -Math.sin(yaw);
      let mx = fx * forward + rx * strafe;
      let mz = fz * forward + rz * strafe;
      const len = Math.hypot(mx, mz) || 1;
      mx /= len;
      mz /= len;
      setDirection({ x: mx, z: mz });
      const next = {
        x: clamp(position.x + mx * dt * 2.4 * moveSpeedScale * Math.min(1, len), minX, maxX),
        z: clamp(position.z + mz * dt * 2.4 * moveSpeedScale * Math.min(1, len), minZ, maxZ),
      };
      if (!isBlocked(next, obstacles, 0.52)) {
        setPosition(next);
        setIsMoving(true);
      } else {
        setIsMoving(false);
      }
      return;
    }
    const dx = (keys.ArrowRight ? 1 : 0) - (keys.ArrowLeft ? 1 : 0)
      + (isConcert ? (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0) : 0) + joystick.x;
    const dz = (keys.ArrowDown ? 1 : 0) - (keys.ArrowUp ? 1 : 0)
      + (isConcert ? (keys.KeyS ? 1 : 0) - (keys.KeyW ? 1 : 0) : 0) - joystick.y;
    if (dx === 0 && dz === 0) {
      setIsMoving(false);
      return;
    }
    const magnitude = Math.hypot(dx, dz) || 1;
    const nextDirection = { x: dx / magnitude, z: dz / magnitude };
    setDirection(nextDirection);
    const next = {
      x: clamp(position.x + nextDirection.x * dt * 2.1 * moveSpeedScale * Math.min(1, magnitude), minX, maxX),
      z: clamp(position.z + nextDirection.z * dt * 2.1 * moveSpeedScale * Math.min(1, magnitude), minZ, maxZ),
    };

    if (!isBlocked(next, obstacles, 0.52)) {
      setPosition(next);
      setIsMoving(true);
    }
  };

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (debugMode && ['PageUp', 'PageDown'].includes(event.key)) {
        event.preventDefault();
        keyState.current[event.key] = true;
        return;
      }
      const actionKey = event.key.toLowerCase();
      const action = actionKey === 'f' ? 'hug' : actionKey === 'g' ? 'punch' : null;
      if (action && !event.repeat && interactionTriggerRef.current?.(action)) {
        event.preventDefault();
        return;
      }
      if (event.key.toLowerCase() === 'e') {
        if (event.repeat) return;
        if (seatInteractionRef.current?.()) {
          event.preventDefault();
          return;
        }
        const altar = floorPlanRef.current.layout?.altar;
        const currentPosition = positionRef.current;
        const chest = floorPlanRef.current.layout?.chest;
        const wheel = floorPlanRef.current.layout?.wheel;
        if (roomType === 'quiz' && quizManagerRef.current && chest
          && Math.hypot(currentPosition.x - chest.x, currentPosition.z - chest.z) <= 2.8) {
          event.preventDefault();
          quizInteractCallback.current?.();
          return;
        }
        if (roomType === 'lucky-number' && luckyManagerRef.current && wheel
          && Math.hypot(currentPosition.x - wheel.x, currentPosition.z - wheel.z) <= 3.4) {
          event.preventDefault();
          luckyInteractCallback.current?.();
          return;
        }
        if (altar && Math.hypot(currentPosition.x - altar.x, currentPosition.z - altar.z) <= 3.2) {
          event.preventDefault();
          ritualInteractCallback.current?.(currentPosition);
        }
      }
      if (event.key.startsWith('Arrow')) {
        if (quizEliminatedRef.current && !debugMode) return;
        event.preventDefault();
        keyState.current[event.key] = true;
      }
      // Concert rooms also accept WASD for movement (first-person friendly).
      if ((isConcert || debugMode) && ['w', 'a', 's', 'd'].includes(actionKey)) {
        if (quizEliminatedRef.current && !debugMode) return;
        event.preventDefault();
        keyState.current[`Key${actionKey.toUpperCase()}`] = true;
      }
    };

    const handleKeyUp = (event) => {
      if (event.key.startsWith('Arrow')) {
        keyState.current[event.key] = false;
      }
      if (debugMode && ['PageUp', 'PageDown'].includes(event.key)) {
        keyState.current[event.key] = false;
      }
      const upKey = event.key.toLowerCase();
      if ((isConcert || debugMode) && ['w', 'a', 's', 'd'].includes(upKey)) {
        keyState.current[`Key${upKey.toUpperCase()}`] = false;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [debugMode, roomType]);

  useEffect(() => {
    if (!debugMode || !onConcertViewChange) return undefined;

    const views = ['god', 'iso', 'third', 'first'];
    const onWheel = (event) => {
      event.preventDefault();
      const now = performance.now();
      if (now - debugViewWheelAtRef.current < 400) return;
      debugViewWheelAtRef.current = now;
      const currentIndex = Math.max(0, views.indexOf(viewModeRef.current));
      const direction = Math.sign(event.deltaY);
      if (!direction) return;
      const nextIndex = (currentIndex + direction + views.length) % views.length;
      onConcertViewChange(views[nextIndex]);
    };

    window.addEventListener('wheel', onWheel, { passive: false });
    return () => window.removeEventListener('wheel', onWheel);
  }, [debugMode, onConcertViewChange]);

  // Seed the first-person yaw from the player's current facing so entering
  // first-person doesn't snap the view to an unexpected heading.
  useEffect(() => {
    if (isConcert && viewMode === 'first') {
      fpYawRef.current = Math.atan2(-direction.x, -direction.z);
      fpPitchRef.current = 0;
    }
  }, [isConcert, viewMode]);

  // First-person look uses pointer lock for a mouse and drag gestures for touch.
  useEffect(() => {
    const canvas = gl?.domElement;
    if (!canvas || !isConcert || viewMode !== 'first') return undefined;
    const canvasContainer = canvas.closest('.game-canvas');

    const rotateView = (deltaX, deltaY) => {
      fpYawRef.current -= deltaX * 0.002;
      fpPitchRef.current -= deltaY * 0.002;
      fpPitchRef.current = clamp(fpPitchRef.current, -Math.PI / 2 + 0.1, Math.PI / 2 - 0.1);
    };
    const onPointerDown = (event) => {
      const isInteractiveTarget = event.target instanceof Element
        && event.target.closest('.movement-joystick, button, a, input, select, textarea, [role="button"]');
      const isSceneTarget = canvasContainer?.contains(event.target) && !isInteractiveTarget;
      const isSceneTouch = event.pointerType === 'touch' && isSceneTarget;
      if (event.pointerType === 'touch' && isSceneTouch) {
        if (fpTouchLookRef.current === null) {
          fpTouchLookRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            x: event.clientX,
            y: event.clientY,
            isDragging: false,
          };
        }
        return;
      }
      if (event.pointerType === 'mouse' && event.button === 0 && isSceneTarget && !fpLockedRef.current) {
        canvas.requestPointerLock?.();
      }
    };
    const onPointerMove = (event) => {
      const touchLook = fpTouchLookRef.current;
      if (!touchLook || touchLook.pointerId !== event.pointerId) return;
      const deltaX = event.clientX - touchLook.x;
      const deltaY = event.clientY - touchLook.y;
      if (!touchLook.isDragging) {
        const distance = Math.hypot(event.clientX - touchLook.startX, event.clientY - touchLook.startY);
        if (distance < 6) return;
        touchLook.isDragging = true;
        rotateView(event.clientX - touchLook.startX, event.clientY - touchLook.startY);
        touchLook.x = event.clientX;
        touchLook.y = event.clientY;
        if (event.cancelable) event.preventDefault();
        return;
      }
      event.preventDefault();
      rotateView(deltaX, deltaY);
      touchLook.x = event.clientX;
      touchLook.y = event.clientY;
    };
    const onPointerEnd = (event) => {
      if (fpTouchLookRef.current?.pointerId === event.pointerId) {
        fpTouchLookRef.current = null;
      }
    };
    const onLockChange = () => {
      fpLockedRef.current = document.pointerLockElement === canvas;
    };
    const onLockError = () => {
      fpLockedRef.current = false;
    };
    const onMouseMove = (event) => {
      if (!fpLockedRef.current) return;
      rotateView(event.movementX, event.movementY);
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('pointermove', onPointerMove, { passive: false });
    document.addEventListener('pointerup', onPointerEnd);
    document.addEventListener('pointercancel', onPointerEnd);
    document.addEventListener('pointerlockchange', onLockChange);
    document.addEventListener('pointerlockerror', onLockError);
    document.addEventListener('mousemove', onMouseMove);

    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerEnd);
      document.removeEventListener('pointercancel', onPointerEnd);
      document.removeEventListener('pointerlockchange', onLockChange);
      document.removeEventListener('pointerlockerror', onLockError);
      document.removeEventListener('mousemove', onMouseMove);
      if (document.pointerLockElement === canvas) document.exitPointerLock?.();
      fpLockedRef.current = false;
      fpTouchLookRef.current = null;
    };
  }, [gl, isConcert, viewMode]);

  useEffect(() => {
    if (!target) return;

    const route = buildPath(position, target, obstacles, {
      cellSize: 0.5,
      width: Math.ceil((maxX - minX) / 0.5),
      height: Math.ceil((maxZ - minZ) / 0.5),
      minX,
      minZ,
      clearance: 0.35,
    });
    setPath(route);
    setIsMoving(true);
  }, [target]);

  useEffect(() => {
    if (debugMode) return;
    if (position.x > maxX || position.x < minX) {
      setPosition((current) => ({ ...current, x: clamp(current.x, minX, maxX) }));
    }
    if (position.z > maxZ || position.z < minZ) {
      setPosition((current) => ({ ...current, z: clamp(current.z, minZ, maxZ) }));
    }
  }, [debugMode, maxX, maxZ, minX, minZ, position]);

  useEffect(() => {
    if (!debugMode) {
      debugAltitudeRef.current = 0;
    }
  }, [debugMode]);

  // The camera follows the player from a fixed isometric angle, while the character
  // keeps facing whichever direction is being moved. This creates a stable 2.5D office view.
  useFrame((state, delta) => {
    const isGodView = debugMode && viewModeRef.current === 'god';
    const joystick = joystickInputRef.current;
    const hasMovementInput = !isGodView && (debugMode || !isQuizEliminated)
      && (Object.values(keyState.current).some(Boolean) || Math.hypot(joystick.x, joystick.y) > 0.05);
    if (isSitting && hasMovementInput) setIsSitting(false);
    const knockback = knockbackRef.current;
    if (debugMode) {
      const verticalInput = (keyState.current.PageUp ? 1 : 0) - (keyState.current.PageDown ? 1 : 0);
      if (verticalInput) {
        if (isGodView) {
          debugCameraHeightRef.current = clamp(
            debugCameraHeightRef.current + verticalInput * delta * 180,
            80,
            900,
          );
        } else {
          debugAltitudeRef.current += verticalInput * delta * 16;
        }
      }
      if (isGodView) {
        const keys = keyState.current;
        const { x, y } = joystickInputRef.current;
        const dx = (keys.ArrowRight || keys.KeyD ? 1 : 0) - (keys.ArrowLeft || keys.KeyA ? 1 : 0) + x;
        const dz = (keys.ArrowDown || keys.KeyS ? 1 : 0) - (keys.ArrowUp || keys.KeyW ? 1 : 0) - y;
        const magnitude = Math.hypot(dx, dz) || 1;
        if (dx || dz) {
          const panSpeed = Math.max(50, debugCameraHeightRef.current * 0.25);
          debugCameraTargetRef.current.x += (dx / magnitude) * delta * panSpeed;
          debugCameraTargetRef.current.z += (dz / magnitude) * delta * panSpeed;
        }
      }
    }
    if (isGodView) {
      setIsMoving(false);
    } else if (isQuizEliminated && !debugMode) {
      const pigPen = floorPlan.layout?.pigPen;
      setIsMoving(false);
      setIsSitting(false);
      setPath([]);
      setTarget(null);
      knockback.remaining = 0;
      if (pigPen) {
        const penPosition = {
          x: clamp(position.x, pigPen.x - pigPen.width / 2 + 0.55, pigPen.x + pigPen.width / 2 - 0.55),
          z: clamp(position.z, pigPen.z - pigPen.depth / 2 + 0.55, pigPen.z + pigPen.depth / 2 - 0.55),
        };
        if (penPosition.x !== position.x || penPosition.z !== position.z) setPosition(penPosition);
      }
    } else if (knockback.remaining > 0) {
      const step = Math.min(delta, knockback.remaining);
      const strength = knockback.remaining / knockback.duration;
      const nextPosition = {
        x: clamp(position.x + knockback.x * step * 3.8 * strength, minX, maxX),
        z: clamp(position.z + knockback.z * step * 3.8 * strength, minZ, maxZ),
      };
      if (isBlocked(nextPosition, obstacles, 0.52)) {
        knockback.remaining = 0;
      } else {
        setPosition(nextPosition);
      }
      knockback.remaining = Math.max(0, knockback.remaining - delta);
      setIsMoving(false);
    } else if (isSitting) {
      setIsMoving(false);
    } else if (hasMovementInput) {
      moveWithKeyboard(delta);
    } else if (path.length > 1) {
      const currentWaypoint = path[1];
      const actualTarget = { x: currentWaypoint.x, z: currentWaypoint.z };
      const distance = Math.hypot(actualTarget.x - position.x, actualTarget.z - position.z);
      if (distance < 0.15) {
        setPath((previous) => previous.slice(1));
        if (path.length <= 2) {
          setIsMoving(false);
          setTarget(null);
        }
      } else {
        const dx = actualTarget.x - position.x;
        const dz = actualTarget.z - position.z;
        const angle = Math.hypot(dx, dz) || 1;
        const nextDirection = { x: dx / angle, z: dz / angle };
        const nextPosition = {
          x: clamp(position.x + nextDirection.x * delta * 2.4 * moveSpeedScale, minX, maxX),
          z: clamp(position.z + nextDirection.z * delta * 2.4 * moveSpeedScale, minZ, maxZ),
        };
        if (!isBlocked(nextPosition, obstacles, 0.52)) {
          setPosition(nextPosition);
          setDirection(nextDirection);
          setIsMoving(true);
        } else {
          setIsMoving(false);
          setPath([]);
        }
      }
    } else {
      setIsMoving(false);
    }

    const mode = viewModeRef.current;
    const ground = getConcertGroundHeight(floorPlan, position.x, position.z) + debugAltitudeRef.current;
    if (Math.abs(ground - playerElevationRef.current) > 0.01) {
      playerElevationRef.current = ground;
      setPlayerElevation(ground);
    }
    if (mode === 'god') {
      state.camera.up.set(0, 0, -1);
      const { x, z } = debugCameraTargetRef.current;
      const height = debugCameraHeightRef.current;
      cameraGoal.current.set(x, height, z);
      state.camera.position.lerp(cameraGoal.current, 0.18);
      state.camera.lookAt(x, 0, z);
    } else if (mode === 'first') {
      state.camera.up.set(0, 1, 0);
      // First-person: camera at eye level; look direction from mouse yaw/pitch.
      const yaw = fpYawRef.current;
      const pitch = fpPitchRef.current;
      cameraGoal.current.set(position.x, ground + 1.65, position.z);
      state.camera.position.lerp(cameraGoal.current, 0.5);
      const lookDist = 8;
      const cosPitch = Math.cos(pitch);
      state.camera.lookAt(
        position.x - Math.sin(yaw) * cosPitch * lookDist,
        ground + 1.65 + Math.sin(pitch) * lookDist,
        position.z - Math.cos(yaw) * cosPitch * lookDist,
      );
    } else if (mode === 'third') {
      state.camera.up.set(0, 1, 0);
      // Third-person: camera behind and above the player, following the heading.
      cameraGoal.current.set(
        position.x - direction.x * 9,
        ground + 5.2,
        position.z - direction.z * 9,
      );
      state.camera.position.lerp(cameraGoal.current, 0.12);
      state.camera.lookAt(position.x, ground + 1.6, position.z);
    } else {
      state.camera.up.set(0, 1, 0);
      // Default isometric follow from the floor plan camera offset.
      cameraGoal.current.set(
        position.x + floorPlan.camera.offsetX,
        floorPlan.camera.height + ground,
        position.z + floorPlan.camera.offsetZ,
      );
      state.camera.position.lerp(cameraGoal.current, 0.08);
      state.camera.lookAt(position.x, floorPlan.camera.lookY + ground, position.z);
    }

    const altar = floorPlan.layout?.altar;
    const inRitualRange = roomType === 'werewolf' && altar
      ? Math.hypot(position.x - altar.x, position.z - altar.z) <= 3.2
      : false;
    if (inRitualRange !== wasInRitualRange.current) {
      wasInRitualRange.current = inRitualRange;
      ritualRangeCallback.current?.(inRitualRange);
    }

    const chest = floorPlan.layout?.chest;
    const inQuizChestRange = roomType === 'quiz' && canManageQuiz && chest
      ? Math.hypot(position.x - chest.x, position.z - chest.z) <= 2.8
      : false;
    if (inQuizChestRange !== wasInQuizChestRange.current) {
      wasInQuizChestRange.current = inQuizChestRange;
      quizRangeCallback.current?.(inQuizChestRange);
    }

    const wheel = floorPlan.layout?.wheel;
    const inLuckyWheelRange = roomType === 'lucky-number' && canManageLuckyNumber && wheel
      ? Math.hypot(position.x - wheel.x, position.z - wheel.z) <= 3.4
      : false;
    if (inLuckyWheelRange !== wasInLuckyWheelRange.current) {
      wasInLuckyWheelRange.current = inLuckyWheelRange;
      luckyRangeCallback.current?.(inLuckyWheelRange);
    }

    const chessTables = floorPlan.layout?.tables ?? [];
    let nearestChessTable_ = null;
    let nearestDist_ = Infinity;
    for (const table of chessTables) {
      const dist = Math.hypot(position.x - table.x, position.z - table.z);
      if (dist < nearestDist_) {
        nearestDist_ = dist;
        nearestChessTable_ = table;
      }
    }
    const inChessRange = roomType === 'chess-room' && nearestDist_ <= 2.5 ? nearestChessTable_ : null;
    const prevChessId = wasInChessTableRange.current?.id ?? null;
    const nextChessId = inChessRange?.id ?? null;
    if (prevChessId !== nextChessId) {
      wasInChessTableRange.current = inChessRange;
      nearestChessTableRef.current = inChessRange;
      setNearestChessTable(inChessRange);
      chessBotRangeCallback.current?.(inChessRange);
    }

    stateBroadcastTime.current += delta;
    if (stateBroadcastTime.current >= 0.05) {
      stateBroadcastTime.current = 0;
      onPlayerState?.({ position, direction, isMoving, isSitting });
    }
  });

  const incomingInteraction = localPeerId
    ? remotePlayers.find((player) => player.interactionTargetId === localPeerId
      && Date.now() - player.interactionAt < 1000)
    : null;
  useEffect(() => {
    if (incomingInteraction?.interaction !== 'punch') return;
    const interactionKey = `${incomingInteraction.peerId}:${incomingInteraction.interactionAt}`;
    if (handledInteractionRef.current === interactionKey) return;
    handledInteractionRef.current = interactionKey;
    if (!Number.isFinite(incomingInteraction.position?.x) || !Number.isFinite(incomingInteraction.position?.z)) return;

    let dx = position.x - incomingInteraction.position.x;
    let dz = position.z - incomingInteraction.position.z;
    let distance = Math.hypot(dx, dz);
    if (distance > 2.2) return;
    if (distance < 0.01) {
      dx = -(incomingInteraction.direction?.x || 0);
      dz = -(incomingInteraction.direction?.z || -1);
      distance = Math.hypot(dx, dz) || 1;
    }

    const magnitude = distance;
    knockbackRef.current = { x: dx / magnitude, z: dz / magnitude, duration: 0.28, remaining: 0.28 };
    setDirection({ x: dx / magnitude, z: dz / magnitude });
    setIsSitting(false);
    setPath([]);
    setTarget(null);
  }, [incomingInteraction, position.x, position.z]);
  const localInteraction = incomingInteraction
    ? incomingInteraction.interaction === 'punch' ? 'recoil' : 'hug'
    : interaction;
  const localInteractionAt = incomingInteraction?.interactionAt || interactionAt;
  return (
    <>
      <color attach="background" args={[isConcert ? (isNightMode ? '#070a12' : '#6fb0ec') : (theme.background || '#dfe9f3')]} />
      {viewMode !== 'god' && (
        <fog attach="fog" args={[isConcert ? (isNightMode ? '#0a0e18' : '#add2f5') : (theme.fogColor || theme.background || '#dfe9f3'), theme.fogNear ?? 18, theme.fogFar ?? 36]} />
      )}
      <ambientLight
        color={isConcert ? (isNightMode ? '#5a6480' : '#eaf2ff') : (theme.ambientColor || '#ffffff')}
        intensity={isConcert ? (isNightMode ? 1.0 : 1.0) : (theme.ambientIntensity ?? 0.95)}
      />
      {isConcert && (
        <hemisphereLight
          color={isNightMode ? '#2a3350' : '#bfe0ff'}
          groundColor={isNightMode ? '#0a1020' : '#4a7a4a'}
          intensity={isNightMode ? 1.1 : 0.9}
        />
      )}
      <directionalLight
        castShadow
        color={isConcert ? (isNightMode ? '#9fb0e0' : '#fff4df') : (theme.directionalColor || '#ffffff')}
        intensity={isConcert ? (isNightMode ? 1.0 : 1.6) : (theme.directionalIntensity ?? 1.4)}
        position={theme.directionalPosition || [12, 16, 8]}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      {isConcert && viewMode !== 'god' && <ConcertSky night={isNightMode} />}
      <group>
        <mesh
          name="ground"
          rotation-x={-Math.PI / 2}
          position={[(minX + maxX) / 2, 0, (minZ + maxZ) / 2]}
        >
          <planeGeometry args={[floorPlan.bounds.maxX - minX, maxZ - minZ]} />
          <meshBasicMaterial transparent opacity={0} colorWrite={false} depthWrite={false} />
        </mesh>
        <RoomLayout
          plan={floorPlan}
          workstations={workstations}
          audioControlRef={audioControlRef}
          onAudioStatusChange={onAudioStatusChange}
        />
      </group>

      {roomType === 'werewolf' && <WerewolfCards cards={werewolfCards} />}
      {roomType === 'teams' && teamCards.map((card) => <FlyingTeamCard key={card.id} card={card} />)}

      {!debugMode && !(isConcert && viewMode === 'first') && (
      <Character
        name={playerName}
        position={position}
        direction={direction}
        isMoving={isMoving || getAvatarAnimation(isMoving) === 'walk'}
        isSitting={isSitting}
        interaction={localInteraction}
        interactionAt={localInteractionAt}
        stream={localMediaStream}
        hasAudio={localAudioEnabled}
        hasVideo={localVideoEnabled}
        avatar={localAvatar}
        elevation={playerElevation}
      />
      )}      {remotePlayers.map((player) => {
        const targetedInteraction = remotePlayers.find((source) => source.interactionTargetId === player.peerId
          && Date.now() - source.interactionAt < 1000);
        const remoteInteraction = targetedInteraction
          ? targetedInteraction.interaction === 'punch' ? 'recoil' : 'hug'
          : player.interaction;
        const remoteInteractionAt = targetedInteraction?.interactionAt || player.interactionAt;
        return (
          <Character
            key={player.peerId}
            name={player.name}
            position={player.position}
            direction={player.direction}
            isMoving={player.isMoving}
            isSitting={player.isSitting}
            interaction={remoteInteraction}
            interactionAt={remoteInteractionAt}
            stream={player.mediaStream}
            hasAudio={player.hasAudio}
            hasVideo={player.hasVideo}
            avatar={player.avatar}
            elevation={getConcertGroundHeight(floorPlan, player.position?.x ?? 0, player.position?.z ?? 0)}
            remote
          />
        );
      })}

      <Html fullscreen>
        {nearestChessTable && (
          <div className="chess-proximity-prompt">
            <button
              type="button"
              className="chess-proximity-button"
              onClick={() => chessBotOpenCallback.current?.(nearestChessTable.type, nearestChessTable.label)}
            >
              Chơi với Bot — {nearestChessTable.label}
            </button>
          </div>
        )}
      </Html>

      {path.length > 1 && (
        <group>
          {path.map((point, index) => (
            <mesh key={`${index}-${point.x}-${point.z}`} position={[point.x, 0.2, point.z]}>
              <sphereGeometry args={[index === path.length - 1 ? 0.15 : 0.09, 8, 8]} />
              <meshBasicMaterial color={index === path.length - 1 ? '#42d392' : '#8ad4ff'} />
            </mesh>
          ))}
        </group>
      )}
    </>
  );
}
