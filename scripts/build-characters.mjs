import { inflateRawSync } from 'node:zlib';
import { mkdir, readFile, stat, writeFile, copyFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { NodeIO } from '@gltf-transform/core';
import { KHRDracoMeshCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { dedup, draco, prune, quantize, resample } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_DIR = join(PROJECT_ROOT, 'public', 'assets', 'characters');
const DRACO_OUTPUT_DIR = join(PROJECT_ROOT, 'public', 'assets', 'draco');

const PACKS = {
  men: 'C:/Users/nolan/Downloads/drive-download-20260905T104848Z-1-001.zip',
  women: 'C:/Users/nolan/Downloads/drive-download-20260905T101743Z-1-001.zip',
};

const CHARACTERS = [
  { pack: 'men', source: 'Casual_2', output: 'm_casual.glb' },
  { pack: 'men', source: 'Casual_Hoodie', output: 'm_hoodie.glb' },
  { pack: 'men', source: 'Suit', output: 'm_suit.glb' },
  { pack: 'men', source: 'Worker', output: 'm_worker.glb' },
  { pack: 'women', source: 'Casual', output: 'f_casual.glb' },
  { pack: 'women', source: 'Formal', output: 'f_formal.glb' },
  { pack: 'women', source: 'Suit', output: 'f_suit.glb' },
  { pack: 'women', source: 'Worker', output: 'f_worker.glb' },
];

const ANIMATION_SOURCE = CHARACTERS[0];
const ANIMATION_NAMES = new Set(['Idle', 'Idle_Neutral', 'Walk', 'Run', 'Wave']);
const DRACO_DECODER_FILES = [
  'draco_decoder.js',
  'draco_decoder.wasm',
  'draco_wasm_wrapper.js',
];

function findEndOfCentralDirectory(zip) {
  const minimumOffset = Math.max(0, zip.length - 0xffff - 22);
  for (let offset = zip.length - 22; offset >= minimumOffset; offset -= 1) {
    if (zip.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  throw new Error('Invalid ZIP: end-of-central-directory record not found.');
}

function readZipEntries(zip) {
  const endOffset = findEndOfCentralDirectory(zip);
  const entryCount = zip.readUInt16LE(endOffset + 10);
  let centralOffset = zip.readUInt32LE(endOffset + 16);
  const entries = new Map();

  for (let index = 0; index < entryCount; index += 1) {
    if (zip.readUInt32LE(centralOffset) !== 0x02014b50) {
      throw new Error(`Invalid ZIP: central directory entry ${index} is corrupt.`);
    }

    const method = zip.readUInt16LE(centralOffset + 10);
    const compressedSize = zip.readUInt32LE(centralOffset + 20);
    const uncompressedSize = zip.readUInt32LE(centralOffset + 24);
    const nameLength = zip.readUInt16LE(centralOffset + 28);
    const extraLength = zip.readUInt16LE(centralOffset + 30);
    const commentLength = zip.readUInt16LE(centralOffset + 32);
    const localOffset = zip.readUInt32LE(centralOffset + 42);
    const name = zip.subarray(centralOffset + 46, centralOffset + 46 + nameLength)
      .toString('utf8')
      .replaceAll('\\', '/');

    entries.set(name, { method, compressedSize, uncompressedSize, localOffset });
    centralOffset += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

function extractZipEntry(zip, entries, name) {
  const entry = entries.get(name);
  if (!entry) throw new Error(`ZIP entry not found: ${name}`);
  if (zip.readUInt32LE(entry.localOffset) !== 0x04034b50) {
    throw new Error(`Invalid ZIP local header: ${name}`);
  }

  const nameLength = zip.readUInt16LE(entry.localOffset + 26);
  const extraLength = zip.readUInt16LE(entry.localOffset + 28);
  const dataOffset = entry.localOffset + 30 + nameLength + extraLength;
  const compressed = zip.subarray(dataOffset, dataOffset + entry.compressedSize);
  let data;

  if (entry.method === 0) data = compressed;
  else if (entry.method === 8) data = inflateRawSync(compressed);
  else throw new Error(`Unsupported ZIP compression method ${entry.method}: ${name}`);

  if (data.length !== entry.uncompressedSize) {
    throw new Error(`ZIP size mismatch for ${name}: expected ${entry.uncompressedSize}, got ${data.length}.`);
  }
  return data;
}

async function loadPacks() {
  const packs = {};
  for (const [name, path] of Object.entries(PACKS)) {
    try {
      const zip = await readFile(path);
      packs[name] = { zip, entries: readZipEntries(zip) };
    } catch (error) {
      throw new Error(`Cannot read required ${name} source ZIP at ${path}: ${error.message}`);
    }
  }
  return packs;
}

function sourcePath(character) {
  return `Individual Characters/glTF/${character.source}.gltf`;
}

async function readCharacter(io, packs, character) {
  const { zip, entries } = packs[character.pack];
  const bytes = extractZipEntry(zip, entries, sourcePath(character));
  return io.readJSON({ json: JSON.parse(bytes.toString('utf8')), resources: {} });
}

function measureMeshBounds(document) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const accessorMin = [];
  const accessorMax = [];

  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const position = primitive.getAttribute('POSITION');
      if (!position) continue;
      position.getMin(accessorMin);
      position.getMax(accessorMax);
      for (let axis = 0; axis < 3; axis += 1) {
        min[axis] = Math.min(min[axis], accessorMin[axis]);
        max[axis] = Math.max(max[axis], accessorMax[axis]);
      }
    }
  }

  return { minY: min[1], maxY: max[1], height: max[1] - min[1] };
}

async function writeCharacter(io, packs, character) {
  const document = await readCharacter(io, packs, character);
  const bounds = measureMeshBounds(document);
  for (const animation of document.getRoot().listAnimations()) animation.dispose();
  await document.transform(prune(), dedup(), quantize(), draco());

  const outputPath = join(OUTPUT_DIR, character.output);
  await writeFile(outputPath, await io.writeBinary(document));
  return { outputPath, bounds };
}

async function writeAnimations(io, packs) {
  const document = await readCharacter(io, packs, ANIMATION_SOURCE);
  const root = document.getRoot();
  const foundNames = new Set(root.listAnimations().map((animation) => animation.getName()));
  const missingNames = [...ANIMATION_NAMES].filter((name) => !foundNames.has(name));
  if (missingNames.length) {
    throw new Error(`Animation source is missing required clips: ${missingNames.join(', ')}`);
  }

  for (const animation of root.listAnimations()) {
    if (!ANIMATION_NAMES.has(animation.getName())) animation.dispose();
  }
  for (const mesh of root.listMeshes()) mesh.dispose();
  for (const skin of root.listSkins()) skin.dispose();
  await document.transform(resample({ tolerance: 1e-3 }), dedup(), prune());

  const remainingNames = root.listAnimations().map((animation) => animation.getName()).sort();
  if (remainingNames.length !== ANIMATION_NAMES.size) {
    throw new Error(`Expected ${ANIMATION_NAMES.size} shared clips, found ${remainingNames.length}.`);
  }

  const outputPath = join(OUTPUT_DIR, 'animations.glb');
  await writeFile(outputPath, await io.writeBinary(document));
  return { outputPath, clipNames: remainingNames };
}

async function copyDracoDecoders() {
  const sourceDir = join(PROJECT_ROOT, 'node_modules', 'three', 'examples', 'jsm', 'libs', 'draco', 'gltf');
  await mkdir(DRACO_OUTPUT_DIR, { recursive: true });
  for (const filename of DRACO_DECODER_FILES) {
    await copyFile(join(sourceDir, filename), join(DRACO_OUTPUT_DIR, filename));
  }
}

function formatSize(bytes) {
  return `${(bytes / 1024).toFixed(1)} KiB (${bytes.toLocaleString('en-US')} bytes)`;
}

async function main() {
  const packs = await loadPacks();
  const encoder = await draco3d.createEncoderModule({});
  const decoder = await draco3d.createDecoderModule({});
  const io = new NodeIO()
    .registerExtensions([KHRDracoMeshCompression, KHRMeshQuantization])
    .registerDependencies({
      'draco3d.encoder': encoder,
      'draco3d.decoder': decoder,
    });

  await mkdir(OUTPUT_DIR, { recursive: true });
  const results = [];
  for (const character of CHARACTERS) {
    results.push(await writeCharacter(io, packs, character));
  }
  const animations = await writeAnimations(io, packs);
  await copyDracoDecoders();

  for (const { outputPath, bounds } of results) {
    const { size } = await stat(outputPath);
    console.log(`${outputPath}: ${formatSize(size)}; source mesh y=${bounds.minY.toFixed(3)}..${bounds.maxY.toFixed(3)} (h=${bounds.height.toFixed(3)})`);
  }
  const { size: animationSize } = await stat(animations.outputPath);
  console.log(`${animations.outputPath}: ${formatSize(animationSize)}; clips=${animations.clipNames.join(', ')}`);
  console.log(`Draco decoders: ${DRACO_DECODER_FILES.join(', ')}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
