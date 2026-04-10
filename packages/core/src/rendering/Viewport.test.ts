import { describe, expect, test } from "bun:test";
import { Viewport } from "./Viewport";

describe("Viewport", () => {
  test("screen/world conversions are inverse operations", () => {
    const viewport = new Viewport();
    viewport.x = 20;
    viewport.y = -10;
    viewport.setZoom(2);

    const screen = viewport.worldToScreen(30, 40);
    const world = viewport.screenToWorld(screen.x, screen.y);

    expect(world.x).toBeCloseTo(30);
    expect(world.y).toBeCloseTo(40);
  });

  test("zoomAt keeps cursor-anchored world point stable", () => {
    const viewport = new Viewport();
    viewport.x = 15;
    viewport.y = -8;
    viewport.setZoom(1);
    const anchor = { x: 320, y: 240 };
    const before = viewport.screenToWorld(anchor.x, anchor.y);

    viewport.zoomAt(anchor, 1.75);
    const after = viewport.screenToWorld(anchor.x, anchor.y);

    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  test("fitBounds centers content inside the screen", () => {
    const viewport = new Viewport();
    viewport.setScreenSize(1000, 800);
    viewport.fitBounds({ minX: 100, minY: 200, maxX: 300, maxY: 400 }, 40);

    const centerScreen = viewport.worldToScreen(200, 300);
    expect(centerScreen.x).toBeCloseTo(500);
    expect(centerScreen.y).toBeCloseTo(400);
    expect(viewport.zoom).toBeGreaterThan(0.05);
    expect(viewport.zoom).toBeLessThanOrEqual(4);
  });
});
