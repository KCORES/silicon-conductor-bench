import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = join(root, "assets", "replay-models");
const destinationRoot = join(
  root,
  "apps",
  "replay",
  "public",
  "assets",
  "replay-models",
);
const manifestPath = join(sourceRoot, "manifest.json");
if (!existsSync(manifestPath)) {
  throw new Error(
    `Missing release model bundle at ${sourceRoot}. Run npm run replay:assets:prepare before removing source packs.`,
  );
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
for (const file of manifest.files ?? []) {
  const source = join(sourceRoot, ...file.path.split("/"));
  if (!existsSync(source)) {
    throw new Error(`Release model file is missing: ${file.path}`);
  }
  const digest = createHash("sha256")
    .update(readFileSync(source))
    .digest("hex");
  if (digest !== file.sha256) {
    throw new Error(`Release model checksum mismatch: ${file.path}`);
  }
}

rmSync(destinationRoot, { recursive: true, force: true });
mkdirSync(dirname(destinationRoot), { recursive: true });
cpSync(sourceRoot, destinationRoot, { recursive: true });

for (const catalogPath of [
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
]) {
  const catalog = readFileSync(catalogPath, "utf8");
  for (const match of catalog.matchAll(/"assetPath": "([^"]+)"/gu)) {
    const assetPath = match[1];
    const prefix = "/assets/replay-models/";
    if (assetPath === undefined || !assetPath.startsWith(prefix)) {
      throw new Error(`Catalog path is outside the release bundle: ${assetPath}`);
    }
    const destination = join(
      destinationRoot,
      ...assetPath.slice(prefix.length).split("/"),
    );
    if (!existsSync(destination)) {
      throw new Error(`Catalog asset was not copied: ${assetPath}`);
    }
  }
}

console.log(
  `Copied ${manifest.modelCount} release models (${manifest.fileCount} files) to ${destinationRoot}`,
);
