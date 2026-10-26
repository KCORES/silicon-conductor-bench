import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Benchmark snapshots are evidence, not additional source test suites.
    exclude: [...configDefaults.exclude, "logs/**"],
  },
});
