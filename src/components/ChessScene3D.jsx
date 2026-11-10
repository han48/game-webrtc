// Full-screen Three.js board renderer for the chess games.
//
// Rendering only — all rules/state live in ChessGamePanel. This component takes a
// normalised description of the board and pieces and draws them in 3D using the
// lathe-turned models in chess-pieces-3d.jsx, with:
//   • click-to-select / move via raycast planes (one per square)
//   • selection, legal-destination and check highlights
//   • smooth animated piece movement (arc glide) whenever `lastMove` changes
//
// Coordinate model: logical (row, col). We map to world (x, z) with the human's
// pieces toward the camera (front). The caller supplies `flip` for orientation.

import { useRef, useMemo, useEffect, useState, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { CanvasTexture } from 'three';
import { StonePiece, DiscPiece, ChessPiece3D } from './chess-pieces-3d.jsx';

const CELL = 1; // world units per square

// Build a CanvasTexture of a (CJK) glyph. The browser's system fonts cover the
// Chinese characters that drei's default (Latin) font would render as blanks.
function makeGlyphTexture(label, color) {
  if (!label || typeof document === 'undefined') return null;
  const size = 128;
  const cv = document.createElement('canvas');
  cv.width = size; cv.height = size;
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = color || '#222';
  ctx.font = '700 92px "Microsoft YaHei", "PingFang SC", "Noto Sans SC", "SimHei", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, size / 2, size / 2 + 4);
  const tex = new CanvasTexture(cv);
  tex.anisotropy = 4;
  return tex;
}

// Map logical (row, col) → world (x, z). Larger row = further from the human
// unless flipped. We centre the board at the origin.
function cellToWorld(row, col, cols, rows, flip) {
  const r = flip ? rows - 1 - row : row;
  const c = flip ? cols - 1 - col : col;
  // Human side (row 0 area, or flipped) sits at +z (near camera).
  const x = (c - (cols - 1) / 2) * CELL;
  const z = ((rows - 1) / 2 - r) * CELL;
  return [x, z];
}

// ── A single animated piece ───────────────────────────────────────────────────
function AnimatedPiece({ piece, cols, rows, flip, animating }) {
  const groupRef = useRef();
  const [done, setDone] = useState(false);
  const [tx, tz] = cellToWorld(piece.row, piece.col, cols, rows, flip);

  // If this piece is the one moving, start from its previous square and glide.
  const fromWorld = animating ? cellToWorld(animating.from.row, animating.from.col, cols, rows, flip) : null;
  const progress = useRef(animating ? 0 : 1);

  useEffect(() => {
    progress.current = animating ? 0 : 1;
    setDone(!animating);
  }, [animating, piece.row, piece.col]);

  useFrame((_, delta) => {
    const g = groupRef.current;
    if (!g) return;
    if (progress.current < 1) {
      progress.current = Math.min(1, progress.current + delta / 0.32); // ~320ms
      const t = progress.current;
      const ease = t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;
      const sx = fromWorld ? fromWorld[0] : tx;
      const sz = fromWorld ? fromWorld[1] : tz;
      g.position.x = sx + (tx - sx) * ease;
      g.position.z = sz + (tz - sz) * ease;
      g.position.y = Math.sin(ease * Math.PI) * 0.5; // arc hop
      if (progress.current >= 1 && !done) { g.position.y = 0; setDone(true); }
    } else {
      g.position.x = tx; g.position.z = tz; g.position.y = 0;
    }
  });

  const scale = piece.scale || 1;
  const glyphTex = useMemo(
    () => (piece.model === 'disc' && piece.label ? makeGlyphTexture(piece.label, piece.labelColor) : null),
    [piece.model, piece.label, piece.labelColor],
  );
  let model = null;
  if (piece.model === 'stone') {
    model = <StonePiece x={0} z={0} color={piece.color} size={0.42} />;
  } else if (piece.model === 'disc') {
    const discH = 2.4; // vertical scale → a chunkier, more piece-like disc
    const capY = 0.072 * discH;
    model = (
      <>
        <group scale={[1, discH, 1]}>
          <DiscPiece x={0} z={0} color={piece.color} top={piece.top} r={0.4} />
        </group>
        {glyphTex && (
          // Sit the glyph right on the disc's (scaled) top face.
          <mesh position={[0, capY + 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.5, 0.5]} />
            <meshBasicMaterial map={glyphTex} transparent polygonOffset polygonOffsetFactor={-2} />
          </mesh>
        )}
      </>
    );
  } else {
    // Larger, clearly readable chess pieces.
    model = <ChessPiece3D x={0} z={0} kind={piece.kind} color={piece.color} scale={4.2 * scale} />;
  }

  return (
    <group ref={groupRef} position={[tx, 0, tz]}>
      {model}
      {/* Royal highlight — a glowing gold ring marks the King / General. */}
      {piece.royal && <RoyalRing />}
    </group>
  );
}

// A pulsing gold ring + soft disc under the King / General so it stands out.
function RoyalRing() {
  const ref = useRef();
  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    const s = 1 + Math.sin(t * 3) * 0.08;
    ref.current.scale.set(s, 1, s);
  });
  return (
    <group>
      <mesh ref={ref} position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.34, 0.46, 32]} />
        <meshBasicMaterial color="#ffd23f" transparent opacity={0.9} />
      </mesh>
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.44, 32]} />
        <meshBasicMaterial color="#ffd23f" transparent opacity={0.18} />
      </mesh>
    </group>
  );
}

// ── Board + squares ───────────────────────────────────────────────────────────
// `palaces` — optional array of { r0, r1, c0, c1 } logical regions to outline
// as "kinh thành" (palace borders). Each entry draws a raised gold frame around
// the 3×3 area (r0..r1, c0..c1). Only the East palace in Đông Tây is passed here.
function BoardAndSquares({
  cols, rows, flip, boardStyle, selected, legalSet, lastMove, checkLines, onSquareClick,
  palaces,
}) {
  const squares = [];
  const highlights = [];
  const width = cols * CELL;
  const depth = rows * CELL;

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const [x, z] = cellToWorld(row, col, cols, rows, flip);
      const key = `${row}-${col}`;
      const isLight = (row + col) % 2 === 0;
      const isSel = selected && selected.row === row && selected.col === col;
      const isLegal = legalSet.has(key);

      // Checkerboard tiles for chess-style; plain for xiangqi/caro grids.
      if (boardStyle === 'cells') {
        squares.push(
          <mesh key={`t-${key}`} position={[x, 0, z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow
            onClick={(e) => { e.stopPropagation(); onSquareClick(row, col); }}>
            <planeGeometry args={[CELL, CELL]} />
            <meshStandardMaterial color={isLight ? '#efe0c0' : '#9c6b36'} roughness={0.8} />
          </mesh>,
        );
      } else {
        // grid: invisible click plane over each intersection/cell
        squares.push(
          <mesh key={`t-${key}`} position={[x, 0.02, z]} rotation={[-Math.PI / 2, 0, 0]}
            onClick={(e) => { e.stopPropagation(); onSquareClick(row, col); }}>
            <planeGeometry args={[CELL * 0.96, CELL * 0.96]} />
            <meshStandardMaterial transparent opacity={0} depthWrite={false} />
          </mesh>,
        );
      }

      if (isSel) {
        highlights.push(
          <mesh key={`s-${key}`} position={[x, 0.04, z]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[CELL * 0.92, CELL * 0.92]} />
            <meshBasicMaterial color="#42d392" transparent opacity={0.5} />
          </mesh>,
        );
      }
      if (isLegal) {
        highlights.push(
          <mesh key={`l-${key}`} position={[x, 0.05, z]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.18, 20]} />
            <meshBasicMaterial color="#42d392" transparent opacity={0.75} />
          </mesh>,
        );
      }
    }
  }

  // Last-move trail markers
  if (lastMove && lastMove.from && lastMove.to) {
    for (const p of [lastMove.from, lastMove.to]) {
      const [x, z] = cellToWorld(p.row, p.col, cols, rows, flip);
      highlights.push(
        <mesh key={`m-${p.row}-${p.col}`} position={[x, 0.03, z]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[CELL * 0.9, CELL * 0.9]} />
          <meshBasicMaterial color="#ffd27a" transparent opacity={0.28} />
        </mesh>,
      );
    }
  }

  // Check beams: a glowing line from each attacker to the king.
  const beams = [];
  if (checkLines && checkLines.king && checkLines.attackers) {
    const [kx, kz] = cellToWorld(checkLines.king.row, checkLines.king.col, cols, rows, flip);
    checkLines.attackers.forEach((a, i) => {
      const [ax, az] = cellToWorld(a.row, a.col, cols, rows, flip);
      const dx = kx - ax; const dz = kz - az;
      const len = Math.hypot(dx, dz);
      const angle = Math.atan2(dz, dx);
      beams.push(
        <mesh key={`beam-${i}`} position={[(ax + kx) / 2, 0.3, (az + kz) / 2]} rotation={[0, -angle, 0]}>
          <boxGeometry args={[len, 0.05, 0.05]} />
          <meshStandardMaterial color="#ff4040" emissive="#ff2020" emissiveIntensity={1.4} />
        </mesh>,
      );
    });
  }

  // Grid lines for intersection boards (xiangqi/dongtay river, caro grid).
  const gridLines = [];
  if (boardStyle === 'river' || boardStyle === 'grid') {
    const LINE_Y = 0.016;
    const LINE_W = 0.03;
    const lineBetween = (a, b, key) => {
      const [ax, az] = cellToWorld(a.row, a.col, cols, rows, flip);
      const [bx, bz] = cellToWorld(b.row, b.col, cols, rows, flip);
      const len = Math.hypot(bx - ax, bz - az);
      const angle = Math.atan2(bz - az, bx - ax);
      gridLines.push(
        <mesh key={key} position={[(ax + bx) / 2, LINE_Y, (az + bz) / 2]} rotation={[0, -angle, 0]}>
          <boxGeometry args={[len, 0.006, LINE_W]} />
          <meshStandardMaterial color="#5a3d0a" roughness={0.8} />
        </mesh>,
      );
    };
    const isXiangqi = boardStyle === 'river';
    const riverGapRow = (rows - 1) / 2; // central gap for xiangqi (rows=10 → 4.5)

    // Horizontal lines (every row)
    for (let r = 0; r < rows; r += 1) {
      lineBetween({ row: r, col: 0 }, { row: r, col: cols - 1 }, `h-${r}`);
    }
    // Vertical lines
    for (let c = 0; c < cols; c += 1) {
      if (isXiangqi && c !== 0 && c !== cols - 1) {
        // Break at the central river: top half + bottom half.
        lineBetween({ row: 0, col: c }, { row: Math.floor(riverGapRow), col: c }, `v-top-${c}`);
        lineBetween({ row: Math.ceil(riverGapRow), col: c }, { row: rows - 1, col: c }, `v-bot-${c}`);
      } else {
        lineBetween({ row: 0, col: c }, { row: rows - 1, col: c }, `v-${c}`);
      }
    }
    // Palaces (xiangqi/dongtay): diagonals at cols 3–5, rows 0–2 and rows 7–9.
    if (isXiangqi) {
      const palaces = [[0, 2], [rows - 3, rows - 1]];
      palaces.forEach(([r0, r1], pi) => {
        lineBetween({ row: r0, col: 3 }, { row: r1, col: 5 }, `pal-${pi}-a`);
        lineBetween({ row: r0, col: 5 }, { row: r1, col: 3 }, `pal-${pi}-b`);
      });
    }
  }

  // ── Palace city walls ("Kinh thành") ─────────────────────────────────────────
  // For each palace region we build a 3D fortress wall:
  //   • A continuous stone-coloured box wall running along all four sides
  //   • Evenly-spaced battlements (merlons) on top — the classic 凸 silhouette
  //   • Solid square towers at each corner
  // The wall sits just outside the cell boundaries so pieces move freely inside.
  const palaceFrames = [];
  if (palaces && palaces.length > 0) {
    palaces.forEach(({ r0, r1, c0, c1 }, pi) => {
      const [x0, z0] = cellToWorld(r0, c0, cols, rows, flip);
      const [x1, z1] = cellToWorld(r1, c1, cols, rows, flip);

      // Outer edge of the wall: half a cell outside the extreme piece positions.
      const MARGIN = CELL * 0.52; // slightly more than half so wall clears pieces
      const minX = Math.min(x0, x1) - MARGIN;
      const maxX = Math.max(x0, x1) + MARGIN;
      const minZ = Math.min(z0, z1) - MARGIN;
      const maxZ = Math.max(z0, z1) + MARGIN;
      const W = maxX - minX; // total outer width
      const D = maxZ - minZ; // total outer depth

      // Wall proportions
      const WALL_T  = 0.13;  // wall thickness
      const WALL_H  = 0.22;  // wall base height (from board surface)
      const WALL_Y  = WALL_H / 2; // centre Y of the wall body

      // Merlon (battlement) proportions
      const M_W    = 0.10;  // merlon width
      const M_H    = 0.10;  // merlon height above wall top
      const M_D    = WALL_T; // merlon depth = same as wall
      const M_GAP  = 0.10;  // gap between merlons
      const M_STEP = M_W + M_GAP;

      // Tower proportions (at each corner)
      const TWR_W  = WALL_T * 2.2; // tower footprint (square)
      const TWR_H  = WALL_H + M_H + 0.04; // taller than wall + merlons

      // Materials — stone-grey wall body, slightly lighter cap
      const wallMat = (
        <meshStandardMaterial
          color="#8a7a6a"
          roughness={0.88}
          metalness={0.04}
          envMapIntensity={0.3}
        />
      );
      const capMat = (
        <meshStandardMaterial
          color="#a09080"
          roughness={0.75}
          metalness={0.06}
        />
      );
      const towerMat = (
        <meshStandardMaterial
          color="#7a6a5a"
          roughness={0.9}
          metalness={0.03}
        />
      );

      // Helper: one wall segment (box) + merlons evenly spaced along its length.
      // `cx,cy,cz` = centre of the wall body. `len` = wall length. `axis` = 'x'|'z'.
      const wallSegment = (segKey, cx, cz, len, axis) => {
        const segs = [];
        // Wall body
        const boxW = axis === 'x' ? len : WALL_T;
        const boxD = axis === 'x' ? WALL_T : len;
        segs.push(
          <mesh key={`${segKey}-body`} position={[cx, WALL_Y, cz]} castShadow receiveShadow>
            <boxGeometry args={[boxW, WALL_H, boxD]} />
            {wallMat}
          </mesh>,
        );
        // Merlons — placed along the top of the wall
        const mCount = Math.floor((len - M_GAP) / M_STEP);
        const totalMerlon = mCount * M_STEP - M_GAP;
        const mStart = -totalMerlon / 2;
        for (let m = 0; m < mCount; m++) {
          const off = mStart + m * M_STEP + M_W / 2;
          const mx = axis === 'x' ? cx + off : cx;
          const mz = axis === 'x' ? cz : cz + off;
          segs.push(
            <mesh key={`${segKey}-m${m}`} position={[mx, WALL_H + M_H / 2, mz]} castShadow>
              <boxGeometry args={[axis === 'x' ? M_W : M_D, M_H, axis === 'x' ? M_D : M_W]} />
              {capMat}
            </mesh>,
          );
        }
        return segs;
      };

      // Helper: corner tower (square pillar, taller than wall)
      const cornerTower = (tKey, tx, tz) => (
        <mesh key={tKey} position={[tx, TWR_H / 2, tz]} castShadow receiveShadow>
          <boxGeometry args={[TWR_W, TWR_H, TWR_W]} />
          {towerMat}
        </mesh>
      );

      // Four wall segments — each runs between the two corner towers on that side.
      // The towers occupy TWR_W/2 at each end, so the clear span is reduced.
      const innerLen_X = W - TWR_W; // span between tower centres along X
      const innerLen_Z = D - TWR_W; // span between tower centres along Z
      const cx = (minX + maxX) / 2;
      const cz = (minZ + maxZ) / 2;

      // Near wall  (z = minZ)
      palaceFrames.push(...wallSegment(`${pi}-near`, cx, minZ + WALL_T / 2, innerLen_X, 'x'));
      // Far wall   (z = maxZ)
      palaceFrames.push(...wallSegment(`${pi}-far`,  cx, maxZ - WALL_T / 2, innerLen_X, 'x'));
      // Left wall  (x = minX)
      palaceFrames.push(...wallSegment(`${pi}-left`, minX + WALL_T / 2, cz, innerLen_Z, 'z'));
      // Right wall (x = maxX)
      palaceFrames.push(...wallSegment(`${pi}-right`, maxX - WALL_T / 2, cz, innerLen_Z, 'z'));

      // Four corner towers
      palaceFrames.push(cornerTower(`${pi}-tNL`, minX + TWR_W / 2, minZ + TWR_W / 2));
      palaceFrames.push(cornerTower(`${pi}-tNR`, maxX - TWR_W / 2, minZ + TWR_W / 2));
      palaceFrames.push(cornerTower(`${pi}-tFL`, minX + TWR_W / 2, maxZ - TWR_W / 2));
      palaceFrames.push(cornerTower(`${pi}-tFR`, maxX - TWR_W / 2, maxZ - TWR_W / 2));
    });
  }

  return (
    <group>
      {/* board base slab — its top sits clearly below the playing surface so it
          never z-fights with the tiles / board top (that caused the dark stripes). */}
      <mesh position={[0, -0.3, 0]} receiveShadow>
        <boxGeometry args={[width + 0.6, 0.5, depth + 0.6]} />
        <meshStandardMaterial color="#3a2a18" roughness={0.7} />
      </mesh>
      {/* xiangqi/caro board top (plain) */}
      {boardStyle !== 'cells' && (
        <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[width, depth]} />
          <meshStandardMaterial color={boardStyle === 'river' ? '#e8d48a' : '#f0e6c8'} roughness={0.85} />
        </mesh>
      )}
      {/* river band for xiangqi/dongtay */}
      {boardStyle === 'river' && (
        <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[width, CELL * (rows % 2 === 0 ? 2 : 1)]} />
          <meshStandardMaterial color="#2f8fc0" transparent opacity={0.5} roughness={0.4} />
        </mesh>
      )}
      {gridLines}
      {squares}
      {highlights}
      {beams}
      {palaceFrames}
    </group>
  );
}

// Ctrl + wheel → tilt the camera (change the viewing angle / polar angle) while a
// plain wheel keeps zooming via OrbitControls. Attaches to the canvas DOM element.
function TiltRig({ controlsRef }) {
  const { gl } = useThree();
  useEffect(() => {
    const el = gl.domElement;
    const onWheel = (e) => {
      if (!e.ctrlKey) return; // plain wheel = zoom (OrbitControls)
      e.preventDefault();
      const controls = controlsRef.current;
      if (!controls) return;
      const delta = (e.deltaY > 0 ? 1 : -1) * 0.08;
      const next = controls.getPolarAngle() + delta;
      const min = 0.15;
      const max = Math.PI / 2.1;
      controls.minPolarAngle = Math.min(Math.max(next, min), max);
      controls.maxPolarAngle = controls.minPolarAngle;
      controls.update();
      // Release the clamp on the next frame so normal rotation stays free.
      requestAnimationFrame(() => {
        controls.minPolarAngle = min;
        controls.maxPolarAngle = max;
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [gl, controlsRef]);
  return null;
}

export default function ChessScene3D({
  pieces, cols, rows, flip = false, boardStyle = 'cells',
  selected = null, legalDests = [], lastMove = null, animating = null,
  checkLines = null, onSquareClick,
  palaces = null,
}) {
  const legalSet = useMemo(() => new Set(legalDests.map((d) => `${d.row}-${d.col}`)), [legalDests]);
  const maxDim = Math.max(cols, rows);
  const controlsRef = useRef();

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [0, maxDim * 1.15, maxDim * 1.05], fov: 42 }}
      style={{ width: '100%', height: '100%' }}
    >
      <color attach="background" args={['#10171c']} />
      <ambientLight intensity={0.6} />
      <directionalLight
        position={[maxDim * 0.6, maxDim * 1.6, maxDim * 0.6]}
        intensity={1.05}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-bias={-0.0004}
        shadow-normalBias={0.05}
        shadow-camera-near={0.5}
        shadow-camera-far={maxDim * 5}
        shadow-camera-left={-maxDim}
        shadow-camera-right={maxDim}
        shadow-camera-top={maxDim}
        shadow-camera-bottom={-maxDim}
      />
      <directionalLight position={[-6, 8, -4]} intensity={0.35} />
      <Suspense fallback={null}>
        <BoardAndSquares
          cols={cols} rows={rows} flip={flip} boardStyle={boardStyle}
          selected={selected} legalSet={legalSet} lastMove={lastMove}
          checkLines={checkLines} onSquareClick={onSquareClick}
          palaces={palaces}
        />
        {pieces.map((p) => (
          <AnimatedPiece
            key={p.id}
            piece={p}
            cols={cols}
            rows={rows}
            flip={flip}
            animating={animating && animating.id === p.id ? animating : null}
          />
        ))}
      </Suspense>
      <TiltRig controlsRef={controlsRef} />
      <OrbitControls
        ref={controlsRef}
        enablePan={false}
        minDistance={maxDim * 0.5}
        maxDistance={maxDim * 3}
        maxPolarAngle={Math.PI / 2.1}
        minPolarAngle={0.15}
        target={[0, 0, 0]}
      />
    </Canvas>
  );
}
