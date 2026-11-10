import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const floorPlanFiles = {
  office: 'floor-plan.json',
  werewolf: 'werewolf-floor-plan.json',
  quiz: 'quiz-floor-plan.json',
  'lucky-number': 'lucky-floor-plan.json',
  teams: 'teams-floor-plan.json',
  'chess-room': 'chess-floor-plan.json',
  sabitech: 'sabitech-floor-plan.json',
  concert: 'concert-floor-plan.json',
};

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

function getPathValue(target, path) {
  return path.reduce((value, key) => value?.[key], target);
}

function readObjectColor(object) {
  let color = null;
  object.traverse((child) => {
    if (color || !child.isMesh) return;
    const material = Array.isArray(child.material) ? child.material[0] : child.material;
    if (material?.color) color = `#${material.color.getHexString()}`;
  });
  return color;
}

function applyBinding(plan, object) {
  const binding = object.userData?.floorPlanBinding;
  if (!binding?.path || !binding.fields) return false;
  const target = getPathValue(plan, binding.path);
  if (!target || typeof target !== 'object') {
    throw new Error(`Bound floor-plan object "${object.name}" points to missing data: ${binding.path.join('.')}`);
  }
  const {
    fields,
    baseScale = [1, 1, 1],
    baseValues = {},
    baseRotationY = 0,
    baseFootprint,
  } = binding;

  for (const [axis, property] of Object.entries(fields.position || {})) {
    target[property] = object.position[axis];
  }
  if (fields.rotationY) {
    const rotation = typeof fields.rotationY === 'string'
      ? { property: fields.rotationY, offset: 0 }
      : fields.rotationY;
    target[rotation.property] = object.rotation.y - (rotation.offset ?? baseRotationY);
  }

  const scaleRatios = {};
  for (const [axis, property] of Object.entries(fields.scale || {})) {
    const initial = baseValues[property];
    const initialScale = baseScale[{ x: 0, y: 1, z: 2 }[axis]];
    if (!Number.isFinite(initial) || !Number.isFinite(initialScale) || initialScale === 0) continue;
    scaleRatios[axis] = object.scale[axis] / initialScale;
    target[property] = initial * scaleRatios[axis];
  }

  for (const [axis, [minProperty, maxProperty]] of Object.entries(fields.range || {})) {
    const initialMin = baseValues[minProperty];
    const initialMax = baseValues[maxProperty];
    const initialScale = baseScale[{ x: 0, y: 1, z: 2 }[axis]];
    if (!Number.isFinite(initialMin) || !Number.isFinite(initialMax)
      || !Number.isFinite(initialScale) || initialScale === 0) continue;
    const size = (initialMax - initialMin) * object.scale[axis] / initialScale;
    const center = object.position[axis];
    target[minProperty] = center - size / 2;
    target[maxProperty] = center + size / 2;
  }

  if (fields.footprint && Array.isArray(baseFootprint)) {
    const scaleX = scaleRatios.x ?? 1;
    const scaleZ = scaleRatios.z ?? 1;
    target[fields.footprint] = baseFootprint.map(([x, z]) => [x * scaleX, z * scaleZ]);
  }

  if (fields.color) {
    const color = readObjectColor(object);
    if (color) target[fields.color] = color;
  }

  return true;
}

export function updateFloorPlanFromScene(plan, scene) {
  const updated = JSON.parse(JSON.stringify(plan));
  let bindingCount = 0;
  scene.traverse((object) => {
    if (applyBinding(updated, object)) bindingCount += 1;
  });
  return { plan: updated, bindingCount };
}

function parseArguments(args) {
  let inputPath = null;
  let outputPath = null;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--help' || argument === '-h') {
      console.log('Usage: npm run import:floor -- <input.glb> --output <floor-plan.json>');
      console.log(`Floor-plan files: ${Object.keys(floorPlanFiles).join(', ')}`);
      process.exit(0);
    }
    if (argument === '--output' || argument === '-o') {
      const value = args[index + 1];
      if (!value || value.startsWith('-')) throw new Error(`${argument} requires a JSON output path.`);
      outputPath = resolve(process.cwd(), value);
      index += 1;
      continue;
    }
    if (argument.startsWith('-')) throw new Error(`Unknown argument: ${argument}`);
    if (inputPath) throw new Error('Specify one input GLB file.');
    inputPath = resolve(process.cwd(), argument);
  }
  if (!inputPath) throw new Error('Specify an input GLB file.');
  if (!outputPath) throw new Error('Specify --output to avoid overwriting a floor-plan source file accidentally.');
  return { inputPath, outputPath };
}

async function loadGlb(path) {
  const buffer = readFileSync(path);
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  return new Promise((resolveScene, reject) => {
    new GLTFLoader().parse(arrayBuffer, '', (gltf) => resolveScene(gltf.scene), reject);
  });
}

function getRoundTripMetadata(scene) {
  let metadata = scene.userData?.floorPlanRoundTrip;
  scene.traverse((object) => {
    if (!metadata && object.userData?.floorPlanRoundTrip) {
      metadata = object.userData.floorPlanRoundTrip;
    }
  });
  return metadata;
}

async function main() {
  const { inputPath, outputPath } = parseArguments(process.argv.slice(2));
  const scene = await loadGlb(inputPath);
  const metadata = getRoundTripMetadata(scene);
  if (metadata?.version !== 1 || !metadata.plan || !floorPlanFiles[metadata.floorName]) {
    throw new Error('This GLB has no supported floor-plan metadata. Re-export it with the project exporter first.');
  }
  const { plan, bindingCount } = updateFloorPlanFromScene(metadata.plan, scene);
  if (bindingCount === 0) {
    throw new Error('No editable floor-plan objects were found. Check that the GLB was re-exported from Blender with custom properties preserved.');
  }
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
  console.log(`Imported ${bindingCount} named object bindings from ${inputPath}`);
  console.log(`Wrote ${metadata.floorName} floor plan to ${outputPath}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`Floor plan GLB import failed: ${error.message}`);
    process.exitCode = 1;
  });
}
