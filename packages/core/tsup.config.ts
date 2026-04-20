import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  experimentalDts: true,
  sourcemap: true,
  treeshake: true,
  external: ["pixi.js"],
});
