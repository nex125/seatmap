import { describe, expect, test } from "bun:test";
import {
  getSeatmapViewerSharedThemeRootStyle,
  seatmapViewerSharedTheme,
  seatmapViewerSharedThemeClassNames,
  seatmapViewerSharedThemeRootClassName,
  seatmapViewerSharedThemeVariables,
} from "./seatmapViewerTheme";
import { seatmapViewerDefaultClassNames } from "../styleContract";

describe("seatmap viewer shared theme", () => {
  test("exposes stable shared theme contract", () => {
    expect(seatmapViewerSharedTheme.rootClassName).toBe(seatmapViewerSharedThemeRootClassName);
    expect(seatmapViewerSharedTheme.classNames).toEqual(seatmapViewerSharedThemeClassNames);
    expect(seatmapViewerSharedTheme.classNames).toEqual(seatmapViewerDefaultClassNames);
  });

  test("merges css variable overrides on top of defaults", () => {
    const style = getSeatmapViewerSharedThemeRootStyle({
      "--seatmap-viewer-accent": "#123456",
      "--seatmap-viewer-text": "#fafafa",
    });
    const styleVariables = style as Record<string, string | undefined>;

    expect(styleVariables["--seatmap-viewer-surface"]).toBe(seatmapViewerSharedThemeVariables["--seatmap-viewer-surface"]);
    expect(styleVariables["--seatmap-viewer-accent"]).toBe("#123456");
    expect(styleVariables["--seatmap-viewer-text"]).toBe("#fafafa");
  });
});
