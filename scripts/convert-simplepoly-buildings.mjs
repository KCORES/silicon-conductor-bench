import { createRequire } from "node:module";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, parse, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO, getBounds } from "@gltf-transform/core";

const require = createRequire(import.meta.url);
const convertFbx = require("fbx2gltf");
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = join(
  root,
  "assets",
  "replay-models",
  "simplepoly",
);
const manifestPath = join(outputRoot, "catalog.json");
const parsedManifest = existsSync(manifestPath)
  ? JSON.parse(readFileSync(manifestPath, "utf8"))
  : { version: 0, buildings: [] };
const previousManifest =
  parsedManifest.version === 3 ? parsedManifest : { buildings: [] };
const previousById = new Map(
  previousManifest.buildings.map((building) => [building.id, building]),
);
const io = new NodeIO();

const sources = [
  {
    kit: "simplepoly-city",
    slug: "city",
    scale: 0.54,
    modelRoot: join(
      root,
      "assets",
      "3d-models",
      "SimplePoly City.FBX",
      "Models",
      "Buildings",
    ),
    textureRoot: join(
      root,
      "assets",
      "3d-models",
      "SimplePoly City.FBX",
      "Textures",
    ),
    include: () => true,
  },
  {
    kit: "simplepoly-urban",
    slug: "urban",
    scale: 0.45,
    modelRoot: join(
      root,
      "assets",
      "3d-models",
      "SimplePoly Urban.FBX",
      "Models",
      "Urban",
      "Buildings",
    ),
    textureRoot: join(
      root,
      "assets",
      "3d-models",
      "SimplePoly Urban.FBX",
      "Textures",
      "Urban",
    ),
    include: (path) =>
      !/(?:SPB_Prop_|Gas Station Prop)/iu.test(path),
  },
];

const jobs = [];
for (const source of sources) {
  const textures = walkFiles(source.textureRoot).filter((path) =>
    /\.png$/iu.test(path),
  );
  for (const modelPath of walkFiles(source.modelRoot)
    .filter((path) => /\.fbx$/iu.test(path))
    .filter(source.include)
    .sort()) {
    const modelId = parse(modelPath).name;
    const id = `${source.kit}:${modelId}`;
    const texturePath = resolveTexture(modelId, textures);
    if (texturePath === undefined) {
      throw new Error(`Missing SimplePoly texture for ${modelPath}`);
    }
    const fileName = `${slugify(modelId)}.glb`;
    const outputPath = join(outputRoot, source.slug, fileName);
    const signature = createSignature(modelPath, texturePath);
    jobs.push({
      ...source,
      id,
      modelId,
      modelPath,
      texturePath,
      outputPath,
      fileName,
      signature,
    });
  }
}

const buildings = [];
let convertedCount = 0;
let nextJob = 0;
await Promise.all(
  Array.from({ length: Math.min(4, jobs.length) }, async () => {
    while (nextJob < jobs.length) {
      const job = jobs[nextJob];
      nextJob += 1;
      if (job === undefined) {
        continue;
      }
      const previous = previousById.get(job.id);
      if (
        previous?.signature === job.signature &&
        existsSync(job.outputPath)
      ) {
        buildings.push(previous);
        continue;
      }
      buildings.push(await convertBuilding(job));
      convertedCount += 1;
    }
  }),
);

buildings.sort((left, right) => left.id.localeCompare(right.id));
mkdirSync(dirname(manifestPath), { recursive: true });
writeFileSync(
  manifestPath,
  `${JSON.stringify({ version: 3, buildings }, null, 2)}\n`,
);
console.log(
  `Prepared ${buildings.length} SimplePoly buildings (${convertedCount} converted, ${buildings.length - convertedCount} cached)`,
);

async function convertBuilding(job) {
  mkdirSync(dirname(job.outputPath), { recursive: true });
  await convertFbx(job.modelPath, job.outputPath, [
    "--compute-normals",
    "missing",
  ]);
  const document = await io.read(job.outputPath);
  const scene = document.getRoot().listScenes()[0];
  if (scene === undefined || document.getRoot().listMeshes().length === 0) {
    throw new Error(`Converted SimplePoly asset is empty: ${job.modelPath}`);
  }
  const texture = document
    .createTexture(`${job.modelId}-base-color`)
    .setImage(readFileSync(job.texturePath))
    .setMimeType("image/png");
  for (const material of document.getRoot().listMaterials()) {
    material
      .setBaseColorTexture(texture)
      .setMetallicFactor(0)
      .setRoughnessFactor(0.78);
  }
  const bounds = getBounds(scene);
  const width = round((bounds.max[0] - bounds.min[0]) * job.scale);
  const height = round((bounds.max[1] - bounds.min[1]) * job.scale);
  const depth = round((bounds.max[2] - bounds.min[2]) * job.scale);
  await io.write(job.outputPath, document);
  return {
    id: job.id,
    kit: job.kit,
    modelId: job.modelId,
    templateKey: `building:${job.kit}:${job.modelId}`,
    assetPath:
      `/assets/replay-models/simplepoly/${job.slug}/${job.fileName}`,
    sourcePath: relative(root, job.modelPath).replaceAll("\\", "/"),
    texturePath: relative(root, job.texturePath).replaceAll("\\", "/"),
    width,
    depth,
    height,
    preferredWidthTiles: preferredTiles(width),
    preferredDepthTiles: preferredTiles(depth),
    heightTier: height < 4 ? "low" : height < 8 ? "mid" : "high",
    targetScale: job.scale,
    modelQuarterTurns: 0,
    signature: job.signature,
  };
}

function resolveTexture(modelId, textures) {
  const normalized = modelId.toLowerCase();
  const names = [
    normalized,
    `${normalized}_color01`,
    `${normalized.replace(/_0[12]$/u, "")}_color01`,
  ];
  return textures.find((path) =>
    names.includes(parse(path).name.toLowerCase()),
  );
}

function walkFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walkFiles(path) : [path];
  });
}

function createSignature(modelPath, texturePath) {
  const model = statSync(modelPath);
  const texture = statSync(texturePath);
  return [
    model.size,
    Math.trunc(model.mtimeMs),
    texture.size,
    Math.trunc(texture.mtimeMs),
  ].join(":");
}

function preferredTiles(size) {
  return Math.max(1, Math.ceil((size + 0.35) / 2));
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "");
}

function round(value) {
  return Number(value.toFixed(4));
}
