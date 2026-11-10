import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(scriptDirectory, '..');
const roomTypes = JSON.parse(
  readFileSync(path.join(projectDirectory, 'src', 'room-types.json'), 'utf8'),
);

function printUsage() {
  console.log([
    'Usage: npm run build:static -- --room-type <type> [--out-dir <directory>]',
    '',
    'Build a standalone static site that opens directly into the selected room.',
    'Static builds do not connect to signaling or use P2P.',
    '',
    `Room types: ${Object.keys(roomTypes).join(', ')}`,
  ].join('\n'));
}

function parseArguments(args) {
  const options = { roomType: '', outDir: 'dist-static' };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--help' || argument === '-h') {
      return { help: true };
    }

    if (argument !== '--room-type' && argument !== '--out-dir') {
      throw new Error(`Unknown option: ${argument}`);
    }

    const value = args[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for ${argument}`);
    }
    index += 1;

    if (argument === '--room-type') options.roomType = value;
    if (argument === '--out-dir') options.outDir = value;
  }

  if (!options.roomType) throw new Error('Specify a room type with --room-type.');
  if (!Object.hasOwn(roomTypes, options.roomType)) {
    throw new Error(`Unknown room type "${options.roomType}". Valid types: ${Object.keys(roomTypes).join(', ')}`);
  }

  return options;
}

let options;
try {
  options = parseArguments(process.argv.slice(2));
} catch (error) {
  console.error(`Error: ${error.message}`);
  printUsage();
  process.exitCode = 1;
}

if (options?.help) {
  printUsage();
} else if (options) {
  const outputDirectory = path.resolve(projectDirectory, options.outDir);
  const relativeProjectDirectory = path.relative(outputDirectory, projectDirectory);
  const outputContainsProjectDirectory = relativeProjectDirectory === ''
    || (!path.isAbsolute(relativeProjectDirectory)
      && relativeProjectDirectory !== '..'
      && !relativeProjectDirectory.startsWith(`..${path.sep}`));
  if (outputContainsProjectDirectory) {
    console.error(`Refusing to build into "${outputDirectory}" because it contains the project directory.`);
    console.error('Choose a dedicated output directory such as dist-static.');
    process.exitCode = 1;
  } else {
    for (const generatedPath of ['assets', 'office', 'index.html', 'style.css']) {
      rmSync(path.join(outputDirectory, generatedPath), { recursive: true, force: true });
    }

    const viteCli = path.join(projectDirectory, 'node_modules', 'vite', 'bin', 'vite.js');
    const build = spawnSync(
      process.execPath,
      [viteCli, 'build', '--outDir', options.outDir],
      {
        cwd: projectDirectory,
        stdio: 'inherit',
        env: {
          ...process.env,
          VITE_STATIC_ROOM_TYPE: options.roomType,
        },
      },
    );

    if (build.error) {
      console.error(`Unable to start Vite build: ${build.error.message}`);
      process.exitCode = 1;
    } else {
      process.exitCode = build.status ?? 1;
      if (process.exitCode === 0) {
        const officeDirectory = path.join(outputDirectory, 'office');
        mkdirSync(officeDirectory, { recursive: true });
        copyFileSync(
          path.join(outputDirectory, 'index.html'),
          path.join(officeDirectory, 'index.html'),
        );
        console.log(`Static Office route generated at ${path.join(officeDirectory, 'index.html')}`);
      }
    }
  }
}
