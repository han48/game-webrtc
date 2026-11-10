import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicGameDirectory = path.join(projectDirectory, '132.one', 'public', 'office-game');
const entryPoint = path.join(publicGameDirectory, 'index.html');

if (!fs.existsSync(entryPoint)) {
  throw new Error('Laravel build output not found. Run npm run build:laravel to build the app.');
}

const floorPlanDirectory = path.join(publicGameDirectory, 'floor-plans');
fs.mkdirSync(floorPlanDirectory, { recursive: true });
for (const fileName of [
  'floor-plan.json',
  'werewolf-floor-plan.json',
  'quiz-floor-plan.json',
  'lucky-floor-plan.json',
  'teams-floor-plan.json',
  'chess-floor-plan.json',
  'concert-floor-plan.json',
]) {
  fs.copyFileSync(
    path.join(projectDirectory, 'src', fileName),
    path.join(floorPlanDirectory, fileName),
  );
}
console.log(`Published game build to ${path.relative(projectDirectory, publicGameDirectory)}`);
