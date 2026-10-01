import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { runCatalogPlugin } from "./run-catalog-plugin.ts";

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root,
  plugins: [runCatalogPlugin(resolve(root, "../../logs"))],
  resolve: {
    alias: {
      "@replay": resolve(root, "../../src/replay"),
    },
  },
  server: {
    port: 4177,
    fs: {
      allow: [resolve(root, "../..")],
    },
  },
});
