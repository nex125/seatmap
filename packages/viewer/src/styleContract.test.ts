import { describe, expect, test } from "bun:test";
import {
  seatmapViewerCssVariables,
  seatmapViewerDefaultClassNames,
  seatmapViewerStyleContract,
  seatmapViewerStyleSlots,
} from "./styleContract";

describe("style contract", () => {
  const expectedCssVariables = [
    "--seatmap-surface",
    "--seatmap-surface-elevated",
    "--seatmap-surface-muted",
    "--seatmap-on-surface",
    "--seatmap-on-surface-variant",
    "--seatmap-outline",
    "--seatmap-outline-variant",
    "--seatmap-primary",
    "--seatmap-on-primary",
    "--seatmap-error",
    "--seatmap-on-error",
    "--seatmap-state-layer-hover",
    "--seatmap-state-layer-pressed",
    "--seatmap-focus-ring",
    "--seatmap-radius-sm",
    "--seatmap-radius-md",
    "--seatmap-radius-lg",
    "--seatmap-shadow-raised",
    "--seatmap-shadow-elevated",
    "--seatmap-shadow-floating",
    "--seatmap-viewer-surface",
    "--seatmap-viewer-surface-elevated",
    "--seatmap-viewer-surface-muted",
    "--seatmap-viewer-border",
    "--seatmap-viewer-border-subtle",
    "--seatmap-viewer-text",
    "--seatmap-viewer-text-muted",
    "--seatmap-viewer-accent",
    "--seatmap-viewer-accent-disabled",
    "--seatmap-viewer-accent-text",
    "--seatmap-viewer-danger",
    "--seatmap-viewer-danger-text",
    "--seatmap-viewer-state-layer-hover",
    "--seatmap-viewer-state-layer-pressed",
    "--seatmap-viewer-focus-ring",
    "--seatmap-viewer-radius-sm",
    "--seatmap-viewer-radius-md",
    "--seatmap-viewer-radius-lg",
    "--seatmap-viewer-shadow-raised",
    "--seatmap-viewer-shadow-elevated",
    "--seatmap-viewer-shadow-floating",
  ] as const;

  test("maps every style slot to a default class name", () => {
    for (const slot of seatmapViewerStyleSlots) {
      expect(seatmapViewerDefaultClassNames[slot]).toBe(`seatmap-viewer__${slot.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}`);
    }
  });

  test("defines unique slots and class names", () => {
    expect(new Set(seatmapViewerStyleSlots).size).toBe(seatmapViewerStyleSlots.length);
    expect(Object.keys(seatmapViewerDefaultClassNames).sort()).toEqual([...seatmapViewerStyleSlots].sort());

    const classNames = Object.values(seatmapViewerDefaultClassNames);
    expect(new Set(classNames).size).toBe(classNames.length);
  });

  test("publishes style slots and css variables through contract", () => {
    expect(seatmapViewerStyleContract.slots).toEqual(seatmapViewerStyleSlots);
    expect(seatmapViewerStyleContract.cssVariables).toEqual(seatmapViewerCssVariables);
    expect(seatmapViewerCssVariables).toEqual(expectedCssVariables);
  });

  test("defines unique css variables", () => {
    expect(new Set(seatmapViewerCssVariables).size).toBe(seatmapViewerCssVariables.length);
  });
});
