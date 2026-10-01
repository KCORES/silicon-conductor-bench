import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BUILDING_CATALOG } from "../apps/replay/src/scene/city/buildingCatalog.generated.js";
import { VEHICLE_CATALOG } from "../apps/replay/src/scene/vehicleCatalog.generated.js";

const root = process.cwd();
const releaseRoot = join(root, "assets", "replay-models");
const publicRoot = join(
  root,
  "apps",
  "replay",
  "public",
  "assets",
  "replay-models",
);
const runtimePrefix = "/assets/replay-models/";
const manifest = JSON.parse(
  readFileSync(join(releaseRoot, "manifest.json"), "utf8"),
) as {
  readonly modelCount: number;
  readonly fileCount: number;
  readonly files: readonly {
    readonly path: string;
    readonly bytes: number;
    readonly sha256: string;
  }[];
};

describe("replay release model bundle", () => {
  it("contains every catalog model under the release runtime prefix", () => {
    const specs = [...BUILDING_CATALOG, ...VEHICLE_CATALOG];
    expect(manifest.modelCount).toBeGreaterThanOrEqual(specs.length);
    for (const spec of specs) {
      expect(spec.assetPath).toMatch(/^\/assets\/replay-models\//u);
      const relativePath = spec.assetPath.slice(runtimePrefix.length);
      expect(existsSync(join(releaseRoot, relativePath))).toBe(true);
      expect(existsSync(join(publicRoot, relativePath))).toBe(true);
    }
  });

  it("has a complete checksummed publication manifest", () => {
    expect(manifest.files).toHaveLength(manifest.fileCount);
    for (const file of manifest.files) {
      const contents = readFileSync(join(releaseRoot, file.path));
      expect(contents.byteLength, file.path).toBe(file.bytes);
      expect(
        createHash("sha256").update(contents).digest("hex"),
        file.path,
      ).toBe(file.sha256);
    }
  });

  it("publishes the Quaternius animated character pack", () => {
    const characterFiles = manifest.files.filter((file) =>
      file.path.startsWith("characters/quaternius/"),
    );
    expect(characterFiles).toHaveLength(52);
    expect(
      characterFiles.some((file) => file.path.endsWith("/BaseCharacter.gltf")),
    ).toBe(true);
    for (const file of characterFiles) {
      expect(existsSync(join(publicRoot, file.path)), file.path).toBe(true);
    }
  });

  it("builds assets without depending on the source authoring packs", () => {
    const packageJson = JSON.parse(
      readFileSync(join(root, "package.json"), "utf8"),
    ) as { readonly scripts: Record<string, string> };
    expect(packageJson.scripts["replay:assets"]).toBe(
      "node scripts/copy-replay-assets.mjs",
    );
    expect(packageJson.scripts["replay:build"]).not.toContain("3d-models");
    expect(packageJson.scripts["replay:dev"]).not.toContain("3d-models");
  });
});
