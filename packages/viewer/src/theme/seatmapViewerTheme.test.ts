import { describe, expect, test } from "bun:test";
import {
  getSeatmapViewerSharedThemeRootStyle,
  seatmapViewerSharedTheme,
  seatmapViewerSharedThemeClassNames,
  seatmapViewerSharedThemeRootClassName,
  seatmapViewerSharedThemeVariables,
} from "./seatmapViewerTheme";
import { seatmapViewerCssVariables, seatmapViewerDefaultClassNames } from "../styleContract";

describe("seatmap viewer shared theme", () => {
  const requiredNewVariables = [
    "--seatmap-viewer-state-layer-hover",
    "--seatmap-viewer-state-layer-pressed",
    "--seatmap-viewer-focus-ring",
    "--seatmap-viewer-radius-lg",
    "--seatmap-viewer-shadow-raised",
    "--seatmap-viewer-shadow-floating",
  ] as const;

  test("exposes stable shared theme contract", () => {
    expect(seatmapViewerSharedTheme.rootClassName).toBe(seatmapViewerSharedThemeRootClassName);
    expect(seatmapViewerSharedTheme.classNames).toEqual(seatmapViewerSharedThemeClassNames);
    expect(seatmapViewerSharedTheme.classNames).toEqual(seatmapViewerDefaultClassNames);
  });

  test("defines all newly added viewer theme variables", () => {
    for (const cssVar of requiredNewVariables) {
      expect(seatmapViewerSharedThemeVariables[cssVar]).toBeDefined();
    }
  });

  test("maps every contract css variable to a shared theme value", () => {
    const sharedThemeVariableKeys = Object.keys(seatmapViewerSharedThemeVariables).sort();
    expect(sharedThemeVariableKeys).toEqual([...seatmapViewerCssVariables].sort());
  });

  test("keeps ds token fallbacks for base semantic variables", () => {
    const baseVariableToDsToken: Record<string, string> = {
      "--seatmap-surface": "--ds-surface-container-low",
      "--seatmap-surface-elevated": "--ds-surface-container",
      "--seatmap-surface-muted": "--ds-surface-container-high",
      "--seatmap-on-surface": "--ds-on-surface",
      "--seatmap-on-surface-variant": "--ds-on-surface-variant",
      "--seatmap-outline": "--ds-input-border",
      "--seatmap-outline-variant": "--ds-border-subtle",
      "--seatmap-primary": "--ds-primary",
      "--seatmap-on-primary": "--ds-on-primary",
      "--seatmap-error": "--ds-error",
      "--seatmap-on-error": "--ds-on-error",
      "--seatmap-state-layer-hover": "--ds-primary-wash",
      "--seatmap-state-layer-pressed": "--ds-primary-wash-strong",
      "--seatmap-focus-ring": "--ds-primary-ring",
      "--seatmap-radius-sm": "--ds-radius-structural-sm",
      "--seatmap-radius-md": "--ds-radius-structural",
      "--seatmap-radius-lg": "--ds-radius-structural",
      "--seatmap-shadow-raised": "--ds-shadow-ambient-sm",
      "--seatmap-shadow-elevated": "--ds-shadow-ambient",
      "--seatmap-shadow-floating": "--ds-shadow-ambient-lg",
    };

    for (const [cssVariable, dsToken] of Object.entries(baseVariableToDsToken)) {
      const value = seatmapViewerSharedThemeVariables[cssVariable as keyof typeof seatmapViewerSharedThemeVariables];
      expect(value).toContain(`var(${dsToken}`);
    }
  });

  test("merges css variable overrides on top of defaults", () => {
    const style = getSeatmapViewerSharedThemeRootStyle({
      "--seatmap-viewer-accent": "#123456",
      "--seatmap-viewer-text": "#fafafa",
      "--seatmap-viewer-focus-ring": "rgba(255, 0, 0, 0.35)",
    });
    const styleVariables = style as Record<string, string | undefined>;

    expect(styleVariables["--seatmap-viewer-surface"]).toBe(seatmapViewerSharedThemeVariables["--seatmap-viewer-surface"]);
    expect(styleVariables["--seatmap-viewer-accent"]).toBe("#123456");
    expect(styleVariables["--seatmap-viewer-text"]).toBe("#fafafa");
    expect(styleVariables["--seatmap-viewer-focus-ring"]).toBe("rgba(255, 0, 0, 0.35)");
    expect(styleVariables["--seatmap-viewer-shadow-floating"]).toBe(
      seatmapViewerSharedThemeVariables["--seatmap-viewer-shadow-floating"],
    );
  });
});
