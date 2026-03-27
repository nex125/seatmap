import type { Viewport } from "@ticketok/seatmap-core";
import { generateId } from "@ticketok/seatmap-core";
import type { CommandHistory, Section, Vec2 } from "@ticketok/seatmap-core";
import type { SeatmapStore } from "@ticketok/seatmap-react";
import { BaseTool, type ToolPointerEvent } from "./BaseTool";

const CLOSE_THRESHOLD = 15;

export class AddSectionTool extends BaseTool {
  readonly name = "add-section";
  readonly cursor = "crosshair";

  points: Vec2[] = [];
  onPointsChange?: (points: Vec2[], closeable: boolean) => void;

  constructor(
    private history: CommandHistory,
    private categoryId: string = "",
  ) {
    super();
  }

  setCategoryId(id: string): void {
    this.categoryId = id;
  }

  onPointerDown(e: ToolPointerEvent, _viewport: Viewport, store: SeatmapStore): void {
    // If 3+ points and click is near the first point, close the polygon
    if (this.points.length >= 3) {
      const first = this.points[0];
      const dist = Math.hypot(e.worldX - first.x, e.worldY - first.y);
      if (dist < CLOSE_THRESHOLD) {
        this.finishPolygon(store);
        return;
      }
    }

    this.points.push({ x: e.worldX, y: e.worldY });
    this.notifyChange();
  }

  onPointerMove(e: ToolPointerEvent): void {
    if (this.points.length === 0) return;
    const closeable =
      this.points.length >= 3 &&
      Math.hypot(e.worldX - this.points[0].x, e.worldY - this.points[0].y) < CLOSE_THRESHOLD;
    this.onPointsChange?.(this.points, closeable);
  }

  private finishPolygon(store: SeatmapStore): void {
    if (this.points.length < 3) {
      this.points = [];
      this.notifyChange();
      return;
    }

    // Compute centroid
    let cx = 0, cy = 0;
    for (const p of this.points) { cx += p.x; cy += p.y; }
    cx /= this.points.length;
    cy /= this.points.length;

    const outline: Vec2[] = this.points.map((p) => ({
      x: p.x - cx,
      y: p.y - cy,
    }));

    const newSection: Section = {
      id: generateId("sec"),
      label: `Section ${Date.now().toString(36).slice(-3).toUpperCase()}`,
      position: { x: cx, y: cy },
      rotation: 0,
      categoryId: this.categoryId,
      rows: [],
      outline,
    };

    this.history.execute({
      description: `Add section "${newSection.label}"`,
      execute: () => {
        const v = store.getState().venue;
        if (!v) return;
        store.getState().setVenue({ ...v, sections: [...v.sections, newSection] });
      },
      undo: () => {
        const v = store.getState().venue;
        if (!v) return;
        store.getState().setVenue({
          ...v,
          sections: v.sections.filter((s) => s.id !== newSection.id),
        });
      },
    });

    this.points = [];
    this.notifyChange();
  }

  private notifyChange(): void {
    this.onPointsChange?.(this.points, false);
  }

  onDeactivate(): void {
    this.points = [];
    this.notifyChange();
  }
}
