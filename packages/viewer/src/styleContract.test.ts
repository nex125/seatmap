import { describe, expect, test } from "bun:test";
import {
  seatmapViewerCssVariables,
  seatmapViewerDefaultClassNames,
  seatmapViewerStyleContract,
  seatmapViewerStyleSlots,
} from "./styleContract";

describe("style contract", () => {
  test("maps every style slot to a default class name", () => {
    for (const slot of seatmapViewerStyleSlots) {
      expect(seatmapViewerDefaultClassNames[slot]).toBe(`seatmap-viewer__${slot.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}`);
    }
  });

  test("publishes style slots and css variables through contract", () => {
    expect(seatmapViewerStyleContract.slots).toEqual(seatmapViewerStyleSlots);
    expect(seatmapViewerStyleContract.cssVariables).toEqual(seatmapViewerCssVariables);
    expect(seatmapViewerCssVariables.length).toBeGreaterThan(5);
  });
});
