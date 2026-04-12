import { readFileSync } from "node:fs";
import { join } from "node:path";

const packageRoot = process.cwd();
const distTypesPath = join(packageRoot, "dist/index.d.ts");
const distJsPath = join(packageRoot, "dist/index.js");

const distTypes = readFileSync(distTypesPath, "utf8");
const distJs = readFileSync(distJsPath, "utf8");

const requiredTypeFragments = [
  "SeatmapEditor",
  "SeatmapEditorProps",
  "PanTool",
  "Toolbar",
  "PropertyPanel",
];

const requiredRuntimeFragments = [
  "SeatmapEditor",
  "PanTool",
  "Toolbar",
  "PropertyPanel",
];

const missingTypes = requiredTypeFragments.filter((fragment) => !distTypes.includes(fragment));
const missingRuntime = requiredRuntimeFragments.filter((fragment) => !distJs.includes(fragment));

if (missingTypes.length > 0 || missingRuntime.length > 0) {
  const lines: string[] = ["editor package export verification failed."];

  if (missingTypes.length > 0) {
    lines.push(`Missing in dist/index.d.ts: ${missingTypes.join(", ")}`);
  }

  if (missingRuntime.length > 0) {
    lines.push(`Missing in dist/index.js: ${missingRuntime.join(", ")}`);
  }

  throw new Error(lines.join("\n"));
}

console.log("editor package export verification passed.");
