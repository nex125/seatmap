import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  treeshake: true,
  external: ["react", "react-dom", "pixi.js", "@nex125/seatmap-core", "@nex125/seatmap-react"],
});
