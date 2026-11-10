// Export the chess/board 3D piece models to standalone .glb files you can open
// in any glTF viewer (Blender, VS Code glTF Tools, https://gltf-viewer.donmccurdy.com,
// Windows 3D Viewer, etc.).
//
//   node scripts/export-chess-models.js
//
// Output: public/models/*.glb  (also copied to 132.one/public/models by the
// Laravel build if present). Pure Node + three ESM; no browser/DOM needed.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LatheGeometry, Vector2, BoxGeometry, SphereGeometry, ConeGeometry,
  CylinderGeometry, TorusGeometry, Matrix4, Euler,
} from 'three';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '../public/models');

// ── Piece silhouette profiles (radius, height), identical to the runtime models ─
const CHESS_PROFILES = {
  p: [[0.00,0.00],[0.058,0.00],[0.058,0.018],[0.040,0.03],[0.046,0.045],[0.030,0.06],[0.020,0.10],[0.024,0.12],[0.014,0.135],[0.040,0.16],[0.040,0.175],[0.028,0.195],[0.000,0.205]],
  r: [[0.00,0.00],[0.062,0.00],[0.062,0.02],[0.044,0.035],[0.048,0.055],[0.036,0.08],[0.036,0.16],[0.050,0.175],[0.050,0.205],[0.046,0.205],[0.000,0.205]],
  n: [[0.00,0.00],[0.064,0.00],[0.064,0.02],[0.046,0.035],[0.050,0.055],[0.036,0.085],[0.034,0.13],[0.040,0.15],[0.030,0.16],[0.000,0.16]],
  b: [[0.00,0.00],[0.062,0.00],[0.062,0.02],[0.044,0.035],[0.048,0.055],[0.032,0.085],[0.026,0.14],[0.040,0.17],[0.034,0.19],[0.028,0.205],[0.016,0.235],[0.022,0.25],[0.000,0.27]],
  q: [[0.00,0.00],[0.066,0.00],[0.066,0.022],[0.046,0.04],[0.052,0.06],[0.034,0.095],[0.026,0.17],[0.034,0.2],[0.046,0.225],[0.040,0.245],[0.000,0.245]],
  k: [[0.00,0.00],[0.068,0.00],[0.068,0.022],[0.048,0.04],[0.054,0.06],[0.036,0.095],[0.028,0.185],[0.036,0.215],[0.048,0.24],[0.042,0.26],[0.000,0.26]],
};

function profileGeom(kind) {
  return new LatheGeometry(CHESS_PROFILES[kind].map(([r, y]) => new Vector2(r, y)), 48);
}

function placed(geom, { pos = [0, 0, 0], rot = [0, 0, 0] } = {}) {
  const m = new Matrix4().makeRotationFromEuler(new Euler(rot[0], rot[1], rot[2]));
  m.setPosition(pos[0], pos[1], pos[2]);
  geom.applyMatrix4(m);
  return geom;
}

// Build the list of sub-geometries that make up a chess piece (body + crown).
function buildChessParts(kind) {
  const parts = [profileGeom(kind)];
  if (kind === 'r') {
    for (let i = 0; i < 4; i += 1) {
      const a = (i * Math.PI) / 2;
      parts.push(placed(new BoxGeometry(0.022, 0.026, 0.022), { pos: [Math.cos(a) * 0.036, 0.218, Math.sin(a) * 0.036] }));
    }
  }
  if (kind === 'n') {
    parts.push(placed(new BoxGeometry(0.05, 0.1, 0.07), { pos: [0, 0.2, -0.01], rot: [0.5, 0, 0] }));
    parts.push(placed(new BoxGeometry(0.044, 0.075, 0.05), { pos: [0, 0.24, 0.045], rot: [0.95, 0, 0] }));
    parts.push(placed(new ConeGeometry(0.012, 0.03, 8), { pos: [-0.016, 0.265, -0.03] }));
    parts.push(placed(new ConeGeometry(0.012, 0.03, 8), { pos: [0.016, 0.265, -0.03] }));
  }
  if (kind === 'q') {
    parts.push(placed(new TorusGeometry(0.03, 0.009, 10, 24), { pos: [0, 0.245, 0], rot: [Math.PI / 2, 0, 0] }));
    for (let i = 0; i < 7; i += 1) {
      const a = (i * Math.PI * 2) / 7;
      parts.push(placed(new SphereGeometry(0.011, 10, 10), { pos: [Math.cos(a) * 0.03, 0.267, Math.sin(a) * 0.03] }));
    }
  }
  if (kind === 'k') {
    parts.push(placed(new BoxGeometry(0.014, 0.06, 0.014), { pos: [0, 0.295, 0] }));
    parts.push(placed(new BoxGeometry(0.04, 0.014, 0.014), { pos: [0, 0.305, 0] }));
  }
  if (kind === 'b') {
    // ball finial already in profile; add a slit marker as a thin box
    parts.push(placed(new BoxGeometry(0.05, 0.07, 0.012), { pos: [0, 0.235, 0], rot: [0, 0, Math.PI / 2] }));
  }
  return parts;
}

function discParts(r = 0.055) {
  const profile = [[0.00,0.00],[r*0.9,0.00],[r,0.012],[r,0.05],[r*0.9,0.066],[r*0.78,0.07],[0.0,0.07]];
  const body = new LatheGeometry(profile.map(([rr, y]) => new Vector2(rr, y)), 40);
  const cap = placed(new CylinderGeometry(r * 0.72, r * 0.72, 0.004, 32), { pos: [0, 0.072, 0] });
  return [body, cap];
}

function stoneParts(size = 0.06) {
  const profile = [[0.0,0.0],[size*0.6,0.0],[size*0.95,0.008],[size*0.95,0.016],[size*0.7,0.03],[size*0.4,0.038],[0.0,0.042]];
  return [new LatheGeometry(profile.map(([r, y]) => new Vector2(r, y)), 36)];
}

// ── Minimal GLB writer ───────────────────────────────────────────────────────
// Serialises an array of geometries as glTF mesh primitives into a single binary
// .glb buffer. Each geometry becomes one primitive (triangles, POSITION+NORMAL).

function alignTo4(n) { return (n + 3) & ~3; }

function geometriesToGLB(geometries) {
  const bin = [];           // Uint8Array chunks for the BIN
  let binLength = 0;
  const bufferViews = [];
  const accessors = [];
  const meshPrimitives = [];

  const pushView = (typedArray, target) => {
    const bytes = new Uint8Array(typedArray.buffer, typedArray.byteOffset, typedArray.byteLength);
    const padded = alignTo4(bytes.length);
    const view = { buffer: 0, byteOffset: binLength, byteLength: bytes.length };
    if (target) view.target = target;
    bufferViews.push(view);
    bin.push(bytes);
    if (padded > bytes.length) bin.push(new Uint8Array(padded - bytes.length));
    binLength += padded;
    return bufferViews.length - 1;
  };

  for (const geom of geometries) {
    const nonIndexed = geom.index ? geom.toNonIndexed() : geom;
    nonIndexed.computeVertexNormals();
    const pos = nonIndexed.attributes.position.array; // Float32Array
    const nrm = nonIndexed.attributes.normal.array;
    const count = nonIndexed.attributes.position.count;

    // bounds for POSITION accessor (required by glTF)
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < count; i += 1) {
      for (let k = 0; k < 3; k += 1) {
        const v = pos[i * 3 + k];
        if (v < min[k]) min[k] = v;
        if (v > max[k]) max[k] = v;
      }
    }

    const posView = pushView(new Float32Array(pos), 34962);
    const posAccessor = accessors.length;
    accessors.push({ bufferView: posView, componentType: 5126, count, type: 'VEC3', min, max });

    const nrmView = pushView(new Float32Array(nrm), 34962);
    const nrmAccessor = accessors.length;
    accessors.push({ bufferView: nrmView, componentType: 5126, count, type: 'VEC3' });

    meshPrimitives.push({ attributes: { POSITION: posAccessor, NORMAL: nrmAccessor }, mode: 4 });
  }

  const gltf = {
    asset: { version: '2.0', generator: 'export-chess-models.js' },
    scenes: [{ nodes: [0] }],
    scene: 0,
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: meshPrimitives }],
    accessors,
    bufferViews,
    buffers: [{ byteLength: binLength }],
  };

  // Assemble BIN
  const binBuffer = new Uint8Array(binLength);
  let off = 0;
  for (const chunk of bin) { binBuffer.set(chunk, off); off += chunk.length; }

  // JSON chunk
  const jsonText = JSON.stringify(gltf);
  const jsonBytes = new TextEncoder().encode(jsonText);
  const jsonPadded = alignTo4(jsonBytes.length);
  const jsonChunk = new Uint8Array(jsonPadded).fill(0x20);
  jsonChunk.set(jsonBytes);

  const totalLength = 12 + 8 + jsonPadded + 8 + binLength;
  const out = new Uint8Array(totalLength);
  const dv = new DataView(out.buffer);
  let p = 0;
  dv.setUint32(p, 0x46546c67, true); p += 4; // 'glTF'
  dv.setUint32(p, 2, true); p += 4;          // version
  dv.setUint32(p, totalLength, true); p += 4; // total length
  dv.setUint32(p, jsonPadded, true); p += 4;  // JSON chunk length
  dv.setUint32(p, 0x4e4f534a, true); p += 4;  // 'JSON'
  out.set(jsonChunk, p); p += jsonPadded;
  dv.setUint32(p, binLength, true); p += 4;    // BIN chunk length
  dv.setUint32(p, 0x004e4942, true); p += 4;   // 'BIN\0'
  out.set(binBuffer, p);
  return Buffer.from(out);
}

// ── Run ──────────────────────────────────────────────────────────────────────
mkdirSync(OUT_DIR, { recursive: true });

const models = {
  'chess-pawn': buildChessParts('p'),
  'chess-rook': buildChessParts('r'),
  'chess-knight': buildChessParts('n'),
  'chess-bishop': buildChessParts('b'),
  'chess-queen': buildChessParts('q'),
  'chess-king': buildChessParts('k'),
  'xiangqi-disc': discParts(0.055),
  'caro-stone': stoneParts(0.06),
};

for (const [name, parts] of Object.entries(models)) {
  const glb = geometriesToGLB(parts);
  const file = resolve(OUT_DIR, `${name}.glb`);
  writeFileSync(file, glb);
  console.log(`✓ ${name}.glb  (${(glb.length / 1024).toFixed(1)} KB, ${parts.length} part${parts.length > 1 ? 's' : ''})`);
}

console.log(`\nExported ${Object.keys(models).length} models to ${OUT_DIR}`);
