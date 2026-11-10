// 3D chess/board models for the 2.5D office scene.
//
// These are simple hand-built models composed from Three.js primitive geometries
// (no external asset files) so they stay lightweight and have no load step, yet
// read clearly as 3D pieces from the overhead office camera. Extracted from
// OfficeScene so the 3D object definitions live on their own.
//
// Exports:
//   • StonePiece, DiscPiece, ChessPiece3D   — individual 3D piece models
//   • CaroBoardSurface, XiangqiBoardSurface, ChessBoardSurface, DongtayBoardSurface
//       — board tops with the pieces placed at a standard opening setup

import { useMemo } from 'react';
import { Vector2 } from 'three';

// Build a lathe profile (array of Vector2) from [radius, y] pairs. Turning this
// silhouette around the Y axis is exactly how real chess pieces are made, so it
// yields authentic, recognisable 3D shapes.
function latheProfile(pairs) {
  return pairs.map(([r, y]) => new Vector2(r, y));
}

// ── Individual 3D piece models ───────────────────────────────────────────────

// A domed go/caro stone — a smooth convex lens (lathed profile).
export function StonePiece({ x, z, color, size = 0.06 }) {
  const profile = useMemo(() => latheProfile([
    [0.00, 0.0], [size * 0.6, 0.0], [size * 0.95, 0.008],
    [size * 0.95, 0.016], [size * 0.7, 0.03], [size * 0.4, 0.038], [0.0, 0.042],
  ]), [size]);
  return (
    <mesh castShadow receiveShadow position={[x, 0, z]}>
      <latheGeometry args={[profile, 28]} />
      <meshStandardMaterial color={color} roughness={0.28} metalness={0.12} />
    </mesh>
  );
}

// A turned disc piece (xiangqi / đông-tây eastern style) with a beveled rim and
// an inlaid engraved face cap.
export function DiscPiece({ x, z, color, top = '#ffe8c0', r = 0.055 }) {
  const profile = useMemo(() => latheProfile([
    [0.00, 0.00], [r * 0.9, 0.00], [r, 0.012], [r, 0.05], [r * 0.9, 0.066],
    [r * 0.78, 0.07], [0.0, 0.07],
  ]), [r]);
  return (
    <group position={[x, 0, z]}>
      <mesh castShadow receiveShadow>
        <latheGeometry args={[profile, 28]} />
        <meshStandardMaterial color={color} roughness={0.45} metalness={0.08} />
      </mesh>
      {/* inlaid face cap */}
      <mesh position={[0, 0.072, 0]}>
        <cylinderGeometry args={[r * 0.72, r * 0.72, 0.004, 24]} />
        <meshStandardMaterial color={top} roughness={0.5} />
      </mesh>
    </group>
  );
}

// Per-kind lathe silhouette profiles (radius, height) — authentic turned shapes.
// Heights are in local units; a full piece is ~0.26–0.34 tall before scaling.
const CHESS_PROFILES = {
  p: [ // Pawn: wide base, slim neck, round head
    [0.00, 0.00], [0.058, 0.00], [0.058, 0.018], [0.040, 0.03], [0.046, 0.045],
    [0.030, 0.06], [0.020, 0.10], [0.024, 0.12], [0.014, 0.135],
    [0.040, 0.16], [0.040, 0.175], [0.028, 0.195], [0.000, 0.205],
  ],
  r: [ // Rook: cylindrical tower
    [0.00, 0.00], [0.062, 0.00], [0.062, 0.02], [0.044, 0.035], [0.048, 0.055],
    [0.036, 0.08], [0.036, 0.16], [0.050, 0.175], [0.050, 0.205], [0.046, 0.205], [0.000, 0.205],
  ],
  n: [ // Knight base (horse head added separately)
    [0.00, 0.00], [0.064, 0.00], [0.064, 0.02], [0.046, 0.035], [0.050, 0.055],
    [0.036, 0.085], [0.034, 0.13], [0.040, 0.15], [0.030, 0.16], [0.000, 0.16],
  ],
  b: [ // Bishop: tall, tapered mitre with a ball finial
    [0.00, 0.00], [0.062, 0.00], [0.062, 0.02], [0.044, 0.035], [0.048, 0.055],
    [0.032, 0.085], [0.026, 0.14], [0.040, 0.17], [0.034, 0.19],
    [0.028, 0.205], [0.016, 0.235], [0.022, 0.25], [0.000, 0.27],
  ],
  q: [ // Queen: tall elegant body with a collar (crown added separately)
    [0.00, 0.00], [0.066, 0.00], [0.066, 0.022], [0.046, 0.04], [0.052, 0.06],
    [0.034, 0.095], [0.026, 0.17], [0.034, 0.2], [0.046, 0.225], [0.040, 0.245], [0.000, 0.245],
  ],
  k: [ // King: tallest body with a collar (cross added separately)
    [0.00, 0.00], [0.068, 0.00], [0.068, 0.022], [0.048, 0.04], [0.054, 0.06],
    [0.036, 0.095], [0.028, 0.185], [0.036, 0.215], [0.048, 0.24], [0.042, 0.26], [0.000, 0.26],
  ],
};

// A proper turned chess piece: a lathed body plus a kind-specific crown detail.
export function ChessPiece3D({ x, z, color, kind = 'p', scale = 1 }) {
  const bodyColor = color;
  const profile = useMemo(() => latheProfile(CHESS_PROFILES[kind] || CHESS_PROFILES.p), [kind]);
  const mat = <meshStandardMaterial color={bodyColor} roughness={0.38} metalness={0.1} />;

  return (
    <group position={[x, 0, z]} scale={[scale, scale, scale]}>
      {/* Lathed body */}
      <mesh castShadow receiveShadow>
        <latheGeometry args={[profile, 32]} />
        {mat}
      </mesh>

      {/* Rook battlements — four notched blocks around the rim */}
      {kind === 'r' && [0, 1, 2, 3].map((i) => {
        const a = (i * Math.PI) / 2;
        return (
          <mesh key={i} castShadow position={[Math.cos(a) * 0.036, 0.218, Math.sin(a) * 0.036]}>
            <boxGeometry args={[0.022, 0.026, 0.022]} />
            {mat}
          </mesh>
        );
      })}

      {/* Bishop mitre slit */}
      {kind === 'b' && (
        <mesh position={[0, 0.235, 0]} rotation={[0, 0, Math.PI / 2]}>
          <boxGeometry args={[0.05, 0.07, 0.012]} />
          <meshStandardMaterial color="#000" roughness={0.6} opacity={0.5} transparent />
        </mesh>
      )}

      {/* Knight — stylised horse head (angled box + snout + ears) */}
      {kind === 'n' && (
        <group position={[0, 0.17, 0]}>
          <mesh castShadow rotation={[0.5, 0, 0]} position={[0, 0.03, -0.01]}>
            <boxGeometry args={[0.05, 0.1, 0.07]} />
            {mat}
          </mesh>
          <mesh castShadow rotation={[0.95, 0, 0]} position={[0, 0.07, 0.045]}>
            <boxGeometry args={[0.044, 0.075, 0.05]} />
            {mat}
          </mesh>
          {/* ears */}
          <mesh castShadow position={[-0.016, 0.095, -0.03]}>
            <coneGeometry args={[0.012, 0.03, 8]} />
            {mat}
          </mesh>
          <mesh castShadow position={[0.016, 0.095, -0.03]}>
            <coneGeometry args={[0.012, 0.03, 8]} />
            {mat}
          </mesh>
        </group>
      )}

      {/* Queen — crown of points around a torus collar */}
      {kind === 'q' && (
        <group position={[0, 0.245, 0]}>
          <mesh castShadow>
            <torusGeometry args={[0.03, 0.009, 10, 20]} />
            {mat}
          </mesh>
          {[0, 1, 2, 3, 4, 5, 6].map((i) => {
            const a = (i * Math.PI * 2) / 7;
            return (
              <mesh key={i} castShadow position={[Math.cos(a) * 0.03, 0.022, Math.sin(a) * 0.03]}>
                <sphereGeometry args={[0.011, 8, 8]} />
                {mat}
              </mesh>
            );
          })}
        </group>
      )}

      {/* King — cross finial */}
      {kind === 'k' && (
        <group position={[0, 0.265, 0]}>
          <mesh castShadow position={[0, 0.03, 0]}>
            <boxGeometry args={[0.014, 0.06, 0.014]} />
            {mat}
          </mesh>
          <mesh castShadow position={[0, 0.04, 0]}>
            <boxGeometry args={[0.04, 0.014, 0.014]} />
            {mat}
          </mesh>
        </group>
      )}
    </group>
  );
}

// ── Board surfaces (board top + pieces at a standard opening) ─────────────────

export function CaroBoardSurface() {
  // 15×15 grid, alternating light/dark cells rendered as a flat texture via instancing
  const cellSize = 0.072;
  const gridCount = 15;
  const boardSize = cellSize * gridCount;
  const cells = useMemo(() => {
    const list = [];
    for (let r = 0; r < gridCount; r += 1) {
      for (let c = 0; c < gridCount; c += 1) {
        list.push({
          x: (c - (gridCount - 1) / 2) * cellSize,
          z: (r - (gridCount - 1) / 2) * cellSize,
          dark: (r + c) % 2 === 1,
        });
      }
    }
    return list;
  }, []);
  return (
    <group>
      {/* board base */}
      <mesh receiveShadow rotation-x={-Math.PI / 2} position={[0, 0.001, 0]}>
        <planeGeometry args={[boardSize + 0.04, boardSize + 0.04]} />
        <meshStandardMaterial color="#f0e6c8" roughness={0.9} />
      </mesh>
      {/* grid lines */}
      {cells.filter((cell) => cell.dark).map((cell, i) => (
        <mesh key={i} receiveShadow rotation-x={-Math.PI / 2} position={[cell.x, 0.002, cell.z]}>
          <planeGeometry args={[cellSize - 0.003, cellSize - 0.003]} />
          <meshStandardMaterial color="#8b6914" roughness={0.85} />
        </mesh>
      ))}
      {/* 3D stones — a small sample opening so the board reads as a live game */}
      {[
        { r: 7, c: 7, black: true }, { r: 7, c: 8, black: false },
        { r: 8, c: 7, black: false }, { r: 6, c: 7, black: true },
        { r: 8, c: 8, black: true }, { r: 6, c: 6, black: false },
      ].map((st, i) => (
        <StonePiece
          key={`stone-${i}`}
          x={(st.c - (gridCount - 1) / 2) * cellSize}
          z={(st.r - (gridCount - 1) / 2) * cellSize}
          color={st.black ? '#1a1a1a' : '#f4f4f0'}
        />
      ))}
    </group>
  );
}

export function XiangqiBoardSurface() {
  // River + grid lines drawn as thin box planes
  const w = 0.9;
  const d = 1.0;
  return (
    <group>
      <mesh receiveShadow rotation-x={-Math.PI / 2} position={[0, 0.001, 0]}>
        <planeGeometry args={[w + 0.04, d + 0.04]} />
        <meshStandardMaterial color="#e8d48a" roughness={0.88} />
      </mesh>
      {/* horizontal lines */}
      {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((row) => (
        <mesh key={`xh-${row}`} receiveShadow rotation-x={-Math.PI / 2}
          position={[0, 0.003, -d / 2 + (row / 9) * d]}>
          <planeGeometry args={[w, 0.006]} />
          <meshStandardMaterial color="#7a5c1e" roughness={0.9} />
        </mesh>
      ))}
      {/* vertical lines */}
      {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((col) => (
        <mesh key={`xv-${col}`} receiveShadow rotation-x={-Math.PI / 2}
          position={[-w / 2 + (col / 8) * w, 0.003, 0]}>
          <planeGeometry args={[0.006, d]} />
          <meshStandardMaterial color="#7a5c1e" roughness={0.9} />
        </mesh>
      ))}
      {/* river band */}
      <mesh receiveShadow rotation-x={-Math.PI / 2} position={[0, 0.002, 0]}>
        <planeGeometry args={[w - 0.006, d * 0.08]} />
        <meshStandardMaterial color="#5a8a6a" transparent opacity={0.35} />
      </mesh>
      {/* 3D disc pieces at the standard opening setup */}
      {(() => {
        const px = (col) => -w / 2 + (col / 8) * w;
        const pz = (row) => -d / 2 + (row / 9) * d;
        const red = '#c0392b';
        const black = '#2c3e50';
        const spots = [];
        // Back ranks
        for (let c = 0; c <= 8; c += 1) {
          spots.push({ r: 0, c, color: black });
          spots.push({ r: 9, c, color: red });
        }
        // Cannons
        spots.push({ r: 2, c: 1, color: black }, { r: 2, c: 7, color: black });
        spots.push({ r: 7, c: 1, color: red }, { r: 7, c: 7, color: red });
        // Soldiers
        for (const c of [0, 2, 4, 6, 8]) {
          spots.push({ r: 3, c, color: black });
          spots.push({ r: 6, c, color: red });
        }
        return spots.map((spot, i) => (
          <DiscPiece key={`xq-${i}`} x={px(spot.c)} z={pz(spot.r)} color={spot.color} top="#ffe8c0" r={0.045} />
        ));
      })()}
    </group>
  );
}

export function ChessBoardSurface() {
  const cellSize = 0.108;
  const gridCount = 8;
  const cells = useMemo(() => {
    const list = [];
    for (let r = 0; r < gridCount; r += 1) {
      for (let c = 0; c < gridCount; c += 1) {
        list.push({
          x: (c - (gridCount - 1) / 2) * cellSize,
          z: (r - (gridCount - 1) / 2) * cellSize,
          dark: (r + c) % 2 === 1,
        });
      }
    }
    return list;
  }, []);
  const boardSize = cellSize * gridCount;
  return (
    <group>
      <mesh receiveShadow rotation-x={-Math.PI / 2} position={[0, 0.001, 0]}>
        <planeGeometry args={[boardSize + 0.05, boardSize + 0.05]} />
        <meshStandardMaterial color="#f5deb3" roughness={0.88} />
      </mesh>
      {cells.filter((c) => c.dark).map((cell, i) => (
        <mesh key={i} receiveShadow rotation-x={-Math.PI / 2} position={[cell.x, 0.002, cell.z]}>
          <planeGeometry args={[cellSize - 0.004, cellSize - 0.004]} />
          <meshStandardMaterial color="#4a2c0a" roughness={0.82} />
        </mesh>
      ))}
      {/* 3D chess pieces at the standard starting position */}
      {(() => {
        const px = (c) => (c - (gridCount - 1) / 2) * cellSize;
        const pz = (r) => (r - (gridCount - 1) / 2) * cellSize;
        const backRank = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
        const white = '#f2ead8';
        const black = '#2b2b2b';
        const pieces = [];
        for (let c = 0; c < 8; c += 1) {
          pieces.push({ r: 0, c, kind: backRank[c], color: black });
          pieces.push({ r: 1, c, kind: 'p', color: black });
          pieces.push({ r: 6, c, kind: 'p', color: white });
          pieces.push({ r: 7, c, kind: backRank[c], color: white });
        }
        return pieces.map((p, i) => (
          <ChessPiece3D key={`cp-${i}`} x={px(p.c)} z={pz(p.r)} kind={p.kind} color={p.color} scale={0.78} />
        ));
      })()}
    </group>
  );
}

export function DongtayBoardSurface() {
  // Neutral two-tone surface: East half (green) and West half (cream), with a river strip
  return (
    <group>
      {/* West side — cream background */}
      <mesh receiveShadow rotation-x={-Math.PI / 2} position={[0, 0.001, 0.21]}>
        <planeGeometry args={[0.88, 0.42]} />
        <meshStandardMaterial color="#f5deb3" roughness={0.88} />
      </mesh>
      {/* East side — green background */}
      <mesh receiveShadow rotation-x={-Math.PI / 2} position={[0, 0.001, -0.21]}>
        <planeGeometry args={[0.88, 0.42]} />
        <meshStandardMaterial color="#2d5a3a" roughness={0.85} />
      </mesh>
      {/* River strip in the middle */}
      <mesh receiveShadow rotation-x={-Math.PI / 2} position={[0, 0.002, 0]}>
        <planeGeometry args={[0.88, 0.04]} />
        <meshStandardMaterial color="#1a4a6a" roughness={0.80} />
      </mesh>
      {/* 3D pieces: West = chess pieces (cream), East = eastern discs (green/gold) */}
      {(() => {
        const cols = 9;
        const px = (c) => -0.44 + (c / (cols - 1)) * 0.88;
        const west = '#f2ead8';
        const nodes = [];
        // West back rank near +z edge
        const westBack = ['r', null, 'n', 'q', 'k', 'b', 'n', null, 'r'];
        for (let c = 0; c < cols; c += 1) {
          if (westBack[c]) nodes.push({ kind: 'cp', x: px(c), z: 0.37, piece: westBack[c], color: west });
          nodes.push({ kind: 'cp', x: px(c), z: 0.26, piece: 'p', color: west }); // pawns
        }
        // East discs near -z edge
        for (let c = 0; c < cols; c += 1) {
          nodes.push({ kind: 'disc', x: px(c), z: -0.37 });
        }
        for (const c of [1, 7]) nodes.push({ kind: 'disc', x: px(c), z: -0.2 });  // cannons
        for (const c of [0, 2, 4, 6, 8]) nodes.push({ kind: 'disc', x: px(c), z: -0.12 }); // soldiers
        return nodes.map((n, i) => (n.kind === 'cp'
          ? <ChessPiece3D key={`dt-w-${i}`} x={n.x} z={n.z} kind={n.piece} color={n.color} scale={0.6} />
          : <DiscPiece key={`dt-e-${i}`} x={n.x} z={n.z} color="#1a5c2a" top="#ffe066" r={0.04} />
        ));
      })()}
    </group>
  );
}
