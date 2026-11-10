// BattleshipScene3D.jsx
//
// Full-screen React Three Fiber scene for Battleship.
// Rendering only — all game state is passed in as props from BattleshipGamePanel.
//
// Coordinate system: cell (row, col) → local group position (col - 4.5, 0, row - 4.5).
// Grid surface y = 0.005. Ship hulls sit with bottom at y = 0.
//
// Exports: default BattleshipScene3D

import { useRef, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';

// ── Ship color palette ────────────────────────────────────────────────────────
// Each ship type has a distinct, saturated color that reads clearly against
// the dark ocean surface. Sunk ships use a uniform charred red-orange.
const SHIP_COLORS = {
  carrier:    { hull: '#c8a020', deck: '#e8c040' },   // gold/yellow — aircraft carrier
  battleship: { hull: '#708090', deck: '#a0b0c0' },   // steel grey — battleship
  cruiser:    { hull: '#2e7d32', deck: '#4caf50' },   // military green — cruiser
  submarine:  { hull: '#37474f', deck: '#78909c' },   // dark slate — submarine
  destroyer:  { hull: '#1565c0', deck: '#42a5f5' },   // bright navy blue — destroyer
};
const SUNK_COLOR = '#8a2010';

// ── Ship models (BoxGeometry / CylinderGeometry / SphereGeometry / ConeGeometry only) ─

// Carrier — size 5. Spans 4.8 world units along X.
export function ShipModel_carrier({ color, accentColor }) {
  const mat = <meshStandardMaterial color={color} roughness={0.5} metalness={0.25} />;
  const deck = <meshStandardMaterial color={accentColor || color} roughness={0.45} metalness={0.15} />;
  return (
    <group>
      {/* Main hull */}
      <mesh position={[0, 0.11, 0]} castShadow receiveShadow>
        <boxGeometry args={[4.8, 0.22, 0.85]} />
        {mat}
      </mesh>
      {/* Flight deck (lighter top) */}
      <mesh position={[0, 0.23, 0]} castShadow>
        <boxGeometry args={[4.6, 0.04, 0.75]} />
        {deck}
      </mesh>
      {/* Island superstructure */}
      <mesh position={[0.5, 0.38, -0.22]} castShadow>
        <boxGeometry args={[1.1, 0.42, 0.38]} />
        {mat}
      </mesh>
      {/* Superstructure top */}
      <mesh position={[0.5, 0.65, -0.22]} castShadow>
        <boxGeometry args={[0.8, 0.1, 0.32]} />
        {deck}
      </mesh>
      {/* Aircraft bumps on deck */}
      {[-1.2, 0, 1.2].map((bx, i) => (
        <mesh key={i} position={[bx, 0.27, 0.1]} castShadow>
          <boxGeometry args={[0.6, 0.05, 0.2]} />
          {deck}
        </mesh>
      ))}
      {/* Funnels */}
      {[0.2, 0.7].map((fx, i) => (
        <mesh key={i} position={[fx, 0.72, -0.22]} castShadow>
          <cylinderGeometry args={[0.06, 0.09, 0.22, 8]} />
          {mat}
        </mesh>
      ))}
    </group>
  );
}

// Battleship — size 4.
export function ShipModel_battleship({ color, accentColor }) {
  const mat = <meshStandardMaterial color={color} roughness={0.45} metalness={0.4} />;
  const acc = <meshStandardMaterial color={accentColor || color} roughness={0.4} metalness={0.35} />;
  return (
    <group>
      {/* Hull */}
      <mesh position={[0, 0.14, 0]} castShadow receiveShadow>
        <boxGeometry args={[3.8, 0.28, 0.75]} />
        {mat}
      </mesh>
      {/* Deck */}
      <mesh position={[0, 0.29, 0]} castShadow>
        <boxGeometry args={[3.6, 0.04, 0.6]} />
        {acc}
      </mesh>
      {/* Bridge tower */}
      <mesh position={[0.2, 0.5, 0]} castShadow>
        <boxGeometry args={[0.65, 0.45, 0.48]} />
        {mat}
      </mesh>
      <mesh position={[0.2, 0.8, 0]} castShadow>
        <boxGeometry args={[0.5, 0.2, 0.38]} />
        {acc}
      </mesh>
      {/* Gun turrets */}
      {[-1.1, 1.1].map((tx, i) => (
        <group key={i} position={[tx, 0.38, 0]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.22, 0.25, 0.2, 10]} />
            {mat}
          </mesh>
          {/* Gun barrel */}
          <mesh position={[0.38, 0.02, 0.06]} rotation={[0, -0.15, 0]} castShadow>
            <boxGeometry args={[0.52, 0.07, 0.07]} />
            {acc}
          </mesh>
          <mesh position={[0.38, 0.02, -0.06]} rotation={[0, 0.15, 0]} castShadow>
            <boxGeometry args={[0.52, 0.07, 0.07]} />
            {acc}
          </mesh>
        </group>
      ))}
    </group>
  );
}

// Cruiser — size 3.
export function ShipModel_cruiser({ color, accentColor }) {
  const mat = <meshStandardMaterial color={color} roughness={0.5} metalness={0.3} />;
  const acc = <meshStandardMaterial color={accentColor || color} roughness={0.45} metalness={0.25} />;
  return (
    <group>
      {/* Hull */}
      <mesh position={[0, 0.12, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.8, 0.24, 0.65]} />
        {mat}
      </mesh>
      {/* Deck stripe */}
      <mesh position={[0, 0.25, 0]} castShadow>
        <boxGeometry args={[2.6, 0.03, 0.52]} />
        {acc}
      </mesh>
      {/* Bridge */}
      <mesh position={[0.1, 0.42, 0]} castShadow>
        <boxGeometry args={[0.58, 0.36, 0.44]} />
        {mat}
      </mesh>
      <mesh position={[0.1, 0.67, 0]} castShadow>
        <boxGeometry args={[0.44, 0.16, 0.34]} />
        {acc}
      </mesh>
      {/* Turret */}
      <group position={[-0.7, 0.33, 0]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.18, 0.2, 0.16, 10]} />
          {mat}
        </mesh>
        <mesh position={[0.32, 0.01, 0]} castShadow>
          <boxGeometry args={[0.42, 0.06, 0.06]} />
          {acc}
        </mesh>
      </group>
    </group>
  );
}

// Submarine — size 3. Cylindrical hull.
export function ShipModel_submarine({ color, accentColor }) {
  const mat = <meshStandardMaterial color={color} roughness={0.55} metalness={0.3} />;
  const acc = <meshStandardMaterial color={accentColor || color} roughness={0.45} metalness={0.4} />;
  return (
    <group>
      {/* Main cylinder hull */}
      <mesh rotation={[0, 0, Math.PI / 2]} position={[0, 0.32, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.32, 0.32, 2.8, 14]} />
        {mat}
      </mesh>
      {/* Nose cap (pointy) */}
      <mesh rotation={[0, 0, Math.PI / 2]} position={[-1.55, 0.32, 0]} castShadow>
        <coneGeometry args={[0.32, 0.45, 14]} />
        {mat}
      </mesh>
      {/* Tail tapered */}
      <mesh rotation={[0, 0, -Math.PI / 2]} position={[1.55, 0.32, 0]} castShadow>
        <coneGeometry args={[0.28, 0.3, 10]} />
        {mat}
      </mesh>
      {/* Conning tower */}
      <mesh position={[0.1, 0.72, 0]} castShadow>
        <boxGeometry args={[0.38, 0.38, 0.3]} />
        {acc}
      </mesh>
      {/* Conning tower top rim */}
      <mesh position={[0.1, 0.94, 0]} castShadow>
        <cylinderGeometry args={[0.18, 0.18, 0.06, 10]} />
        {acc}
      </mesh>
      {/* Periscope */}
      <mesh position={[0.05, 1.12, 0]} castShadow>
        <cylinderGeometry args={[0.035, 0.035, 0.36, 6]} />
        {mat}
      </mesh>
      {/* Horizontal fins */}
      {[-1, 1].map((side, i) => (
        <mesh key={i} position={[1.2, 0.2, side * 0.42]} castShadow>
          <boxGeometry args={[0.35, 0.05, 0.28]} />
          {acc}
        </mesh>
      ))}
    </group>
  );
}

// Destroyer — size 2. Compact hull.
export function ShipModel_destroyer({ color, accentColor }) {
  const mat = <meshStandardMaterial color={color} roughness={0.5} metalness={0.3} />;
  const acc = <meshStandardMaterial color={accentColor || color} roughness={0.45} metalness={0.25} />;
  return (
    <group>
      {/* Hull */}
      <mesh position={[0, 0.1, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.8, 0.2, 0.55]} />
        {mat}
      </mesh>
      {/* Deck */}
      <mesh position={[0, 0.21, 0]} castShadow>
        <boxGeometry args={[1.65, 0.03, 0.44]} />
        {acc}
      </mesh>
      {/* Bridge */}
      <mesh position={[0.1, 0.36, 0]} castShadow>
        <boxGeometry args={[0.42, 0.3, 0.36]} />
        {mat}
      </mesh>
      <mesh position={[0.1, 0.56, 0]} castShadow>
        <boxGeometry args={[0.32, 0.14, 0.28]} />
        {acc}
      </mesh>
      {/* Funnel */}
      <mesh position={[-0.1, 0.56, 0]} castShadow>
        <cylinderGeometry args={[0.06, 0.08, 0.2, 8]} />
        {mat}
      </mesh>
    </group>
  );
}

// ── Ship model lookup ─────────────────────────────────────────────────────────

const SHIP_MODELS = {
  carrier: ShipModel_carrier,
  battleship: ShipModel_battleship,
  cruiser: ShipModel_cruiser,
  submarine: ShipModel_submarine,
  destroyer: ShipModel_destroyer,
};

// ── ShipOnGrid ─────────────────────────────────────────────────────────────────
// Scans grid cells for a given ship's cells, positions the model at the
// computed center, and orients it correctly.
//
// Props:
//   shipId   - e.g. 'carrier'
//   cells    - array of { row, col } belonging to this ship
//   isPlayer - true → player grid
//   isSunk   - true → render in sunk style even on enemy grid
function ShipOnGrid({ shipId, cells, isPlayer, isSunk }) {
  // Enemy ships are hidden unless sunk
  if (!isPlayer && !isSunk) return null;
  if (!cells || cells.length === 0) return null;

  const ModelComp = SHIP_MODELS[shipId];
  if (!ModelComp) return null;

  // Detect orientation: cells sorted — if all rows are equal → horizontal
  const sorted = [...cells].sort((a, b) => a.row - b.row || a.col - b.col);
  const isHorizontal = sorted.length < 2 || sorted[0].row === sorted[sorted.length - 1].row;

  // Center of occupied cells
  const avgCol = sorted.reduce((s, c) => s + c.col, 0) / sorted.length;
  const avgRow = sorted.reduce((s, c) => s + c.row, 0) / sorted.length;
  const posX = avgCol - 4.5;
  const posZ = avgRow - 4.5;

  // Color: each ship type gets its own palette; sunk ships turn charred
  const palette = SHIP_COLORS[shipId] || { hull: '#607080', deck: '#8090a0' };
  const hullColor  = isSunk ? SUNK_COLOR : palette.hull;
  const accentColor = isSunk ? '#6a1808' : palette.deck;

  // Sunk ships: sink below surface + tilt for dramatic effect
  const yOff = isSunk ? -0.18 : 0;
  const rotZ = isSunk ? 0.22 : 0;
  const rotX = isSunk ? 0.08 : 0;

  // Horizontal → model X axis lines up with grid cols (default authored orientation).
  // Vertical → rotate -90° around Y so hull runs along Z (rows).
  const rotY = isHorizontal ? 0 : -Math.PI / 2;

  return (
    <group position={[posX, yOff, posZ]} rotation={[rotX, rotY, rotZ]}>
      <ModelComp color={hullColor} accentColor={accentColor} />
    </group>
  );
}

// ── HitMarker ─────────────────────────────────────────────────────────────────
function HitMarker({ type, position }) {
  const coneRef = useRef();
  const baseY = position[1] + 0.08;

  useFrame(({ clock }) => {
    if (type === 'hit' && coneRef.current) {
      coneRef.current.position.y = baseY + Math.sin(clock.elapsedTime * 3.5) * 0.08;
    }
  });

  if (type === 'miss') {
    return (
      <group position={position}>
        {/* Torus ring */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
          <torusGeometry args={[0.28, 0.06, 8, 24]} />
          <meshStandardMaterial color="#a0c8e8" emissive="#204060" emissiveIntensity={0.5} />
        </mesh>
        {/* Water splash circle */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
          <circleGeometry args={[0.22, 16]} />
          <meshStandardMaterial color="#1a6aaa" transparent opacity={0.45} depthWrite={false} />
        </mesh>
      </group>
    );
  }

  // Hit — animated orange/red cone
  return (
    <mesh ref={coneRef} position={[position[0], baseY, position[2]]}>
      <coneGeometry args={[0.18, 0.55, 8]} />
      <meshStandardMaterial color="#ff4020" emissive="#ff2000" emissiveIntensity={1.2} />
    </mesh>
  );
}

// ── TargetReticle ─────────────────────────────────────────────────────────────
function TargetReticle({ col, row }) {
  const ringRef = useRef();

  useFrame((_, delta) => {
    if (ringRef.current) {
      ringRef.current.rotation.z += delta * 2.0;
    }
  });

  const cx = col - 4.5;
  const cz = row - 4.5;

  // Corner bracket half-size
  const bLen = 0.12;
  const bOff = 0.44; // distance from center to corner brackets

  return (
    <group>
      {/* Rotating ring */}
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[cx, 0.08, cz]}>
        <ringGeometry args={[0.38, 0.48, 32]} />
        <meshBasicMaterial color="#42d8ff" transparent opacity={0.85} />
      </mesh>
      {/* Four corner bracket meshes */}
      {[
        [cx - bOff, cz - bOff],
        [cx + bOff, cz - bOff],
        [cx - bOff, cz + bOff],
        [cx + bOff, cz + bOff],
      ].map(([bx, bz], i) => (
        <mesh key={i} position={[bx, 0.09, bz]}>
          <boxGeometry args={[bLen, 0.04, 0.04]} />
          <meshBasicMaterial color="#42d8ff" />
        </mesh>
      ))}
    </group>
  );
}

// ── PlacementPreview ──────────────────────────────────────────────────────────
function PlacementPreview({ cells, valid }) {
  if (!cells || cells.length === 0) return null;
  const color = valid ? '#42d392' : '#e63946';
  return (
    <group>
      {cells.map(({ row, col }, i) => (
        <mesh key={i} position={[col - 4.5, 0.12, row - 4.5]}>
          <boxGeometry args={[0.88, 0.12, 0.88]} />
          <meshStandardMaterial color={color} transparent opacity={0.45} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

// ── OceanGrid ─────────────────────────────────────────────────────────────────
const ROW_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

// Collect ship cells from grid: returns Map<shipId, [{row,col}]>
function collectShipCells(grid) {
  const map = new Map();
  if (!grid) return map;
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r];
    if (!row) continue;
    for (let c = 0; c < row.length; c++) {
      const cell = row[c];
      if (cell && cell.ship) {
        const id = cell.ship.id;
        if (!map.has(id)) map.set(id, []);
        map.get(id).push({ row: r, col: c });
      }
    }
  }
  return map;
}

function OceanGrid({
  grid,
  isPlayer,
  phase,
  isPlayerTurn,
  sunkSet,
  hoverCell,
  isHorizontal,
  currentShipSize,
  groupPosition,
  onCellClick,
  onCellHover,
  onCellLeave,
}) {
  // Grid lines: 11 lines in each axis
  const gridLines = [];
  for (let i = 0; i <= 10; i++) {
    const offset = i - 5; // -5 to +5
    // Horizontal line (along X)
    gridLines.push(
      <mesh key={`h-${i}`} position={[0, 0.006, offset]} receiveShadow>
        <boxGeometry args={[10, 0.008, 0.02]} />
        <meshStandardMaterial color="#1a5080" roughness={0.9} />
      </mesh>,
    );
    // Vertical line (along Z)
    gridLines.push(
      <mesh key={`v-${i}`} position={[offset, 0.006, 0]} receiveShadow>
        <boxGeometry args={[0.02, 0.008, 10]} />
        <meshStandardMaterial color="#1a5080" roughness={0.9} />
      </mesh>,
    );
  }

  // Click planes + hit/miss markers
  const cellPlanes = [];
  const markers = [];

  if (grid) {
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 10; c++) {
        const cell = grid[r] && grid[r][c];
        const cx = c - 4.5;
        const cz = r - 4.5;
        const key = `${r}-${c}`;

        // Transparent click plane
        cellPlanes.push(
          <mesh
            key={key}
            rotation={[-Math.PI / 2, 0, 0]}
            position={[cx, 0.01, cz]}
            onClick={(e) => { e.stopPropagation(); onCellClick && onCellClick(r, c); }}
            onPointerEnter={(e) => { e.stopPropagation(); onCellHover && onCellHover(r, c); }}
            onPointerLeave={(e) => { e.stopPropagation(); onCellLeave && onCellLeave(); }}
          >
            <planeGeometry args={[0.96, 0.96]} />
            <meshStandardMaterial transparent opacity={0} depthWrite={false} />
          </mesh>,
        );

        // Hit/miss markers
        if (cell && cell.hit && cell.ship) {
          markers.push(
            <HitMarker key={`hit-${key}`} type="hit" position={[cx, 0.005, cz]} />,
          );
        } else if (cell && cell.hit && !cell.ship) {
          markers.push(
            <HitMarker key={`miss-${key}`} type="miss" position={[cx, 0.005, cz]} />,
          );
        }
      }
    }
  }

  // Ships
  const shipCellMap = collectShipCells(grid);
  const shipNodes = [];
  for (const [shipId, cells] of shipCellMap) {
    const isSunk = sunkSet && sunkSet.has(shipId);
    shipNodes.push(
      <ShipOnGrid
        key={shipId}
        shipId={shipId}
        cells={cells}
        isPlayer={isPlayer}
        isSunk={isSunk}
      />,
    );
  }

  // Placement preview (player grid only, during placement phase)
  let placementPreview = null;
  if (isPlayer && phase === 'placement' && hoverCell) {
    const { row, col } = hoverCell;
    const previewCells = [];
    for (let i = 0; i < currentShipSize; i++) {
      const pr = isHorizontal ? row : row + i;
      const pc = isHorizontal ? col + i : col;
      if (pr >= 0 && pr < 10 && pc >= 0 && pc < 10) {
        previewCells.push({ row: pr, col: pc });
      }
    }
    // Validity: no overlap
    const valid = previewCells.length === currentShipSize && previewCells.every(({ row: pr, col: pc }) => {
      const cell = grid && grid[pr] && grid[pr][pc];
      return !cell || !cell.ship;
    });
    placementPreview = <PlacementPreview cells={previewCells} valid={valid} />;
  }

  // Target reticle (enemy grid only, during player's turn, when hovering)
  const showReticle = !isPlayer && isPlayerTurn && phase === 'battle' && hoverCell;

  // Row labels (A-J) at left side, col labels (1-10) at bottom
  const labelStyle = { color: '#4a88b8', fontSize: '11px', userSelect: 'none', pointerEvents: 'none' };
  const rowLabels = ROW_LABELS.map((letter, r) => (
    <Html key={`rl-${r}`} position={[-5.3, 0.1, r - 4.5]} distanceFactor={14} style={labelStyle}>
      {letter}
    </Html>
  ));
  const colLabels = Array.from({ length: 10 }, (_, c) => (
    <Html key={`cl-${c}`} position={[c - 4.5, 0.1, 5.3]} distanceFactor={14} style={labelStyle}>
      {c + 1}
    </Html>
  ));

  return (
    <group position={groupPosition}>
      {/* Base slab */}
      <mesh position={[0, -0.05, 0]} receiveShadow>
        <boxGeometry args={[11, 0.1, 11]} />
        <meshStandardMaterial color="#0a2040" roughness={0.9} />
      </mesh>
      {/* Ocean surface */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]} receiveShadow>
        <planeGeometry args={[10, 10]} />
        <meshStandardMaterial color="#0d3060" roughness={0.7} metalness={0.15} />
      </mesh>
      {/* Grid lines */}
      {gridLines}
      {/* Click planes */}
      {cellPlanes}
      {/* Hit/miss markers */}
      {markers}
      {/* Ships */}
      {shipNodes}
      {/* Placement preview */}
      {placementPreview}
      {/* Target reticle */}
      {showReticle && (
        <TargetReticle col={hoverCell.col} row={hoverCell.row} />
      )}
      {/* Row labels */}
      {rowLabels}
      {/* Col labels */}
      {colLabels}
    </group>
  );
}

// ── BattleshipScene3D ─────────────────────────────────────────────────────────
export default function BattleshipScene3D({
  phase,
  playerGrid,
  enemyGrid,
  isPlayerTurn,
  hoverCell,
  isHorizontal,
  currentShipSize,
  sunkByBot,
  sunkByPlayer,
  onPlayerCellClick,
  onPlayerCellHover,
  onPlayerCellLeave,
  onEnemyCellClick,
  onEnemyCellHover,
  onEnemyCellLeave,
}) {
  const sunkByBotSet = sunkByBot ? new Set(sunkByBot) : new Set();
  const sunkByPlayerSet = sunkByPlayer ? new Set(sunkByPlayer) : new Set();

  // hoverCell is keyed per-grid; when the enemy grid is hovered, pass it to enemy grid
  // and vice versa. The caller differentiates via the hover handler callbacks.
  // For simplicity we pass the same hoverCell to both grids — OceanGrid uses it
  // only when its own onCellHover is connected (which fires only on that grid's planes).
  // A dedicated per-grid hover state is managed in BattleshipGamePanel.

  const headingStyle = {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: '14px',
    userSelect: 'none',
    pointerEvents: 'none',
    textShadow: '0 1px 4px #000',
    whiteSpace: 'nowrap',
  };

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [0, 18, 14], fov: 42 }}
      style={{ width: '100%', height: '100%' }}
    >
      <color attach="background" args={['#060e18']} />

      {/* Lighting — brighter to show ship colors clearly */}
      <ambientLight intensity={0.85} />
      <directionalLight
        position={[8, 16, 10]}
        intensity={1.3}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-bias={-0.0004}
        shadow-camera-left={-15}
        shadow-camera-right={15}
        shadow-camera-top={15}
        shadow-camera-bottom={-15}
      />
      <directionalLight position={[-6, 8, -4]} intensity={0.5} />
      {/* Fill light from below-front so ship hulls aren't too dark */}
      <pointLight position={[0, 3, 12]} intensity={0.6} color="#a0c8f0" />

      {/* Wide ocean floor plane — gives the ocean-floor feeling */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color="#040e1c" roughness={1} />
      </mesh>

      <Suspense fallback={null}>
        {/* Grid headings */}
        <Html position={[-6, 2, -5.5]} distanceFactor={14} style={headingStyle}>
          Của bạn
        </Html>
        <Html position={[6, 2, -5.5]} distanceFactor={14} style={headingStyle}>
          Đối phương
        </Html>

        {/* Player grid */}
        <OceanGrid
          grid={playerGrid}
          isPlayer
          phase={phase}
          isPlayerTurn={isPlayerTurn}
          sunkSet={sunkByBotSet}
          hoverCell={phase === 'placement' ? hoverCell : null}
          isHorizontal={isHorizontal}
          currentShipSize={currentShipSize}
          groupPosition={[-6, 0, 0]}
          onCellClick={onPlayerCellClick}
          onCellHover={phase === 'placement' ? onPlayerCellHover : null}
          onCellLeave={phase === 'placement' ? onPlayerCellLeave : null}
        />

        {/* Enemy grid */}
        <OceanGrid
          grid={enemyGrid}
          isPlayer={false}
          phase={phase}
          isPlayerTurn={isPlayerTurn}
          sunkSet={sunkByPlayerSet}
          hoverCell={phase === 'battle' ? hoverCell : null}
          isHorizontal={isHorizontal}
          currentShipSize={currentShipSize}
          groupPosition={[6, 0, 0]}
          onCellClick={onEnemyCellClick}
          onCellHover={onEnemyCellHover}
          onCellLeave={onEnemyCellLeave}
        />
      </Suspense>

      <OrbitControls
        enablePan={false}
        minDistance={8}
        maxDistance={30}
        maxPolarAngle={Math.PI / 2.1}
        target={[0, 0, 0]}
      />
    </Canvas>
  );
}
