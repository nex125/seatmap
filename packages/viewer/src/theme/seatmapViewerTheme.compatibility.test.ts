import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { seatmapViewerSharedThemeVariables } from "./seatmapViewerTheme";

function extractDesignSystemTokens(content: string): Set<string> {
  return new Set(Array.from(content.matchAll(/(--ds-[a-z0-9-]+)/g)).map((match) => match[1]));
}

describe("seatmap viewer shared theme frontend compatibility", () => {
  const dsTokensUsedByViewerTheme = extractDesignSystemTokens(
    JSON.stringify(seatmapViewerSharedThemeVariables),
  );
  const frontendTokensPath =
    process.env.SEATMAP_CONSUMER_TOKENS_PATH ?? "/app/src/design-system/styles/tokens.css";
  const frontendGlobalsPath = process.env.SEATMAP_CONSUMER_GLOBALS_PATH ?? "/app/src/app/globals.css";

  test("consuming frontends define every --ds-* token referenced by viewer shared theme", () => {
    const frontendTokens = extractDesignSystemTokens(readFileSync(frontendTokensPath, "utf8"));

    for (const dsToken of dsTokensUsedByViewerTheme) {
      expect(frontendTokens.has(dsToken)).toBeTrue();
    }
  });

  test("consumer app imports the shared viewer theme stylesheet", () => {
    const globalsCssContent = readFileSync(frontendGlobalsPath, "utf8");
    expect(globalsCssContent).toContain('@import "@nex125/seatmap-viewer/theme.css";');
  });
});
