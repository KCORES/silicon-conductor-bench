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
import { NodeIO } from "@gltf-transform/core";

const require = createRequire(import.meta.url);
const convertFbx = require("fbx2gltf");
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = join(
  root,
  "assets",
  "replay-models",
  "simplepoly-vehicles",
);
const manifestPath = join(outputRoot, "catalog.json");
const parsedManifest = existsSync(manifestPath)
  ? JSON.parse(readFileSync(manifestPath, "utf8"))
  : { version: 0, vehicles: [] };
const previousManifest =
  parsedManifest.version === 1 ? parsedManifest : { vehicles: [] };
const previousById = new Map(
  previousManifest.vehicles.map((vehicle) => [vehicle.id, vehicle]),
);
const io = new NodeIO();

const sources = [
  {
    kit: "simplepoly-city",
    slug: "city",
    modelRoot: join(
      root,
      "assets",
      "3d-models",
      "SimplePoly City.FBX",
      "Models",
      "Vehicles",
      "Vehicle with Separated Wheels",
    ),
    textureRoot: join(
      root,
      "assets",
      "3d-models",
      "SimplePoly City.FBX",
      "Textures",
      "Vehicle",
    ),
  },
  {
    kit: "simplepoly-urban",
    slug: "urban",
    modelRoot: join(
      root,
      "assets",
      "3d-models",
      "SimplePoly Urban.FBX",
      "Models",
      "Urban",
      "Vehicles",
      "Land",
      "Separated Wheels",
    ),
    textureRoot: join(
      root,
      "assets",
      "3d-models",
      "SimplePoly Urban.FBX",
      "Textures",
      "Urban",
    ),
  },
];

const jobs = [];
for (const source of sources) {
  const textures = readdirSync(source.textureRoot)
    .filter((name) => /\.png$/iu.test(name))
    .sort((left, right) => left.localeCompare(right));
  for (const fileName of readdirSync(source.modelRoot)
    .filter((name) => /\.fbx$/iu.test(name))
    .sort((left, right) => left.localeCompare(right))) {
    const modelId = parse(fileName).name;
    const textureName = resolveTexture(source.kit, modelId, textures);
    if (textureName === undefined) {
      throw new Error(`Missing default texture for ${modelId}`);
    }
    const modelPath = join(source.modelRoot, fileName);
    const texturePath = join(source.textureRoot, textureName);
    const outputName = `${slugify(modelId)}.glb`;
    const outputPath = join(outputRoot, source.slug, outputName);
    jobs.push({
      ...source,
      id: `${source.kit}:${modelId}`,
      modelId,
      modelPath,
      texturePath,
      outputPath,
      assetPath:
        `/assets/replay-models/simplepoly-vehicles/${source.slug}/${outputName}`,
      signature: createSignature(modelPath, texturePath),
    });
  }
}

const vehicles = [];
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
        vehicles.push(previous);
        continue;
      }
      vehicles.push(await convertVehicle(job));
      convertedCount += 1;
    }
  }),
);

vehicles.sort((left, right) => left.id.localeCompare(right.id));
mkdirSync(dirname(manifestPath), { recursive: true });
writeFileSync(
  manifestPath,
  `${JSON.stringify({ version: 1, vehicles }, null, 2)}\n`,
);
console.log(
  `Prepared ${vehicles.length} SimplePoly vehicles (${convertedCount} converted, ${vehicles.length - convertedCount} cached)`,
);

async function convertVehicle(job) {
  mkdirSync(dirname(job.outputPath), { recursive: true });
  await convertFbx(job.modelPath, job.outputPath, [
    "--compute-normals",
    "missing",
  ]);
  const document = await io.read(job.outputPath);
  const rootNode = document.getRoot();
  if (
    rootNode.listScenes()[0] === undefined ||
    rootNode.listMeshes().length === 0
  ) {
    throw new Error(`Converted SimplePoly vehicle is empty: ${job.modelPath}`);
  }
  const texture = document
    .createTexture(`${job.modelId}-base-color`)
    .setImage(readFileSync(job.texturePath))
    .setMimeType("image/png");
  for (const material of rootNode.listMaterials()) {
    material
      .setBaseColorTexture(texture)
      .setMetallicFactor(0)
      .setRoughnessFactor(0.72);
  }
  await io.write(job.outputPath, document);
  return {
    id: job.id,
    kit: job.kit,
    modelId: job.modelId,
    assetPath: job.assetPath,
    sourcePath: relative(root, job.modelPath).replaceAll("\\", "/"),
    texturePath: relative(root, job.texturePath).replaceAll("\\", "/"),
    signature: job.signature,
  };
}

function resolveTexture(kit, modelId, textures) {
  const normalizedModel = modelId.toLowerCase();
  const base =
    kit === "simplepoly-urban"
      ? normalizedModel
      : normalizedModel.replace(/^spw_vehicle_land_/u, "");
  const rankedNames =
    kit === "simplepoly-urban"
      ? [base, `${base}_color01`]
      : [base, `${base}_1`];
  return rankedNames
    .map((candidate) =>
      textures.find(
        (texture) => parse(texture).name.toLowerCase() === candidate,
      ),
    )
    .find((texture) => texture !== undefined);
}

function createSignature(modelPath, texturePath) {
  return [modelPath, texturePath]
    .flatMap((path) => {
      const stat = statSync(path);
      return [stat.size, Math.trunc(stat.mtimeMs)];
    })
    .join(":");
}

function slugify(value) {
  return value
    .replace(/^SPW_Vehicle_Land_/u, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "");
}
