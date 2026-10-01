import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { dirname, extname, join, posix, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const publicAssetsRoot = join(root, "apps", "replay", "public", "assets");
const releaseRoot = join(root, "assets", "replay-models");
const quaterniusCharacterRoot = join(
  root,
  "assets",
  "3d-models",
  "quaternius-Ultimate-Animated-Character-Pack",
  "glTF",
);
const quaterniusRuntimeDirectory = "characters/quaternius";
const catalogPaths = [
  join(
    root,
    "apps",
    "replay",
    "src",
    "scene",
    "city",
    "buildingCatalog.generated.ts",
  ),
  join(
    root,
    "apps",
    "replay",
    "src",
    "scene",
    "vehicleCatalog.generated.ts",
  ),
];
const generatedRuntimePathFiles = [
  ...catalogPaths,
  join(root, "docs", "replay-vehicle-assets.md"),
];
const staticModelPaths = [
  "cars/kart-oobi.glb",
  "cars/sedan.glb",
  "city-builder/gltf/dumpster.gltf",
  "city-builder/gltf/firehydrant.gltf",
  "city-builder/gltf/road_corner_curved.gltf",
  "city-builder/gltf/road_junction.gltf",
  "city-builder/gltf/road_straight.gltf",
  "city-builder/gltf/road_straight_crossing.gltf",
  "city-builder/gltf/road_tsplit.gltf",
  "city-builder/gltf/streetlight.gltf",
  "city-builder/gltf/trafficlight_C.gltf",
];
const supportPaths = [
  "simplepoly/catalog.json",
  "simplepoly-vehicles/catalog.json",
];

const modelPaths = new Set(staticModelPaths);
for (const fileName of readdirSync(quaterniusCharacterRoot)
  .filter((fileName) => extname(fileName).toLowerCase() === ".gltf")
  .sort()) {
  modelPaths.add(posix.join(quaterniusRuntimeDirectory, fileName));
}
for (const catalogPath of catalogPaths) {
  const catalog = readFileSync(catalogPath, "utf8");
  for (const match of catalog.matchAll(/"assetPath": "([^"]+)"/gu)) {
    const assetPath = match[1];
    if (assetPath !== undefined) {
      modelPaths.add(stripRuntimePrefix(assetPath));
    }
  }
}

rmSync(releaseRoot, { recursive: true, force: true });
mkdirSync(releaseRoot, { recursive: true });

const copiedFiles = new Set();
for (const modelPath of [...modelPaths].sort()) {
  copyRuntimeFile(modelPath);
  if (extname(modelPath).toLowerCase() === ".gltf") {
    const gltf = JSON.parse(readFileSync(resolvePublicSource(modelPath), "utf8"));
    for (const dependency of [
      ...(gltf.buffers ?? []),
      ...(gltf.images ?? []),
    ]) {
      if (
        typeof dependency.uri === "string" &&
        !dependency.uri.startsWith("data:")
      ) {
        copyRuntimeFile(
          posix.normalize(posix.join(posix.dirname(modelPath), dependency.uri)),
        );
      }
    }
  }
  if (modelPath.startsWith("cars/")) {
    copyRuntimeFile("cars/Textures/colormap.png");
  }
  const cityKit = /^city-kits\/([^/]+)\//u.exec(modelPath)?.[1];
  if (cityKit !== undefined) {
    copyRuntimeFile(`city-kits/${cityKit}/Textures/colormap.png`);
  }
}
for (const supportPath of supportPaths) {
  copyRuntimeFile(supportPath);
  const absolutePath = join(releaseRoot, ...supportPath.split("/"));
  writeFileSync(
    absolutePath,
    readFileSync(absolutePath, "utf8").replace(
      /\/assets\/(?!replay-models\/)/gu,
      "/assets/replay-models/",
    ),
  );
}

const files = [...copiedFiles].sort().map((filePath) => {
  const absolutePath = join(releaseRoot, ...filePath.split("/"));
  const contents = readFileSync(absolutePath);
  return {
    path: filePath,
    bytes: contents.byteLength,
    sha256: createHash("sha256").update(contents).digest("hex"),
  };
});
const manifest = {
  version: 1,
  runtimeBaseUrl: "/assets/replay-models",
  modelCount: modelPaths.size,
  fileCount: files.length,
  files,
};
writeFileSync(
  join(releaseRoot, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
writeFileSync(
  join(releaseRoot, "README.md"),
  `# Replay release models

This directory is the self-contained model bundle used by the replay viewer.
It contains ${modelPaths.size} catalog or scene models and ${files.length} files including required texture and glTF sidecars.

- Runtime base URL: \`/assets/replay-models/\`
- Generated manifest: \`manifest.json\`
- Source authoring packs under \`assets/3d-models/\` are not required for build or release.

Regenerate this directory only while the generated public assets are available:

\`\`\`sh
npm run replay:assets:prepare
\`\`\`
`,
);
for (const filePath of generatedRuntimePathFiles) {
  const contents = readFileSync(filePath, "utf8");
  writeFileSync(
    filePath,
    contents.replace(
      /\/assets\/(?!replay-models\/)/gu,
      "/assets/replay-models/",
    ),
  );
}

console.log(
  `Prepared ${modelPaths.size} release models (${files.length} files) at ${releaseRoot}`,
);

function stripRuntimePrefix(assetPath) {
  return assetPath
    .replace(/^\/assets\/replay-models\//u, "")
    .replace(/^\/assets\//u, "");
}

function resolvePublicSource(filePath) {
  if (filePath.startsWith(`${quaterniusRuntimeDirectory}/`)) {
    const source = join(
      quaterniusCharacterRoot,
      filePath.slice(quaterniusRuntimeDirectory.length + 1),
    );
    if (existsSync(source)) {
      return source;
    }
  }
  const releaseCandidate = join(
    publicAssetsRoot,
    "replay-models",
    ...filePath.split("/"),
  );
  if (existsSync(releaseCandidate)) {
    return releaseCandidate;
  }
  const legacyCandidate = join(publicAssetsRoot, ...filePath.split("/"));
  if (existsSync(legacyCandidate)) {
    return legacyCandidate;
  }
  throw new Error(`Missing generated runtime asset: ${filePath}`);
}

function copyRuntimeFile(filePath) {
  if (copiedFiles.has(filePath)) {
    return;
  }
  const source = resolvePublicSource(filePath);
  const destination = join(releaseRoot, ...filePath.split("/"));
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(source, destination);
  copiedFiles.add(
    relative(releaseRoot, destination).replaceAll("\\", "/"),
  );
}
