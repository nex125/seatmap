import type { Viewport, CommandHistory, GeneralAdmissionArea } from "@nex22/seatmap-core";
import { generateId } from "@nex22/seatmap-core";
import type { SeatmapStore } from "@nex22/seatmap-react";
import { BaseTool, type ToolPointerEvent } from "./BaseTool";

export class DrawGATool extends BaseTool {
  readonly name = "draw-ga";
  readonly cursor = "crosshair";

  points: Array<{ x: number; y: number }> = [];
  capacity = 100;
  categoryId = "";

  constructor(private history: CommandHistory) {
    super();
  }

  onPointerDown(e: ToolPointerEvent, _viewport: Viewport, store: SeatmapStore): void {
    if (e.button !== 0) return;

    if (e.ctrlKey || e.metaKey) {
      this.finishPolygon(store);
      return;
    }

    this.points.push({ x: e.worldX, y: e.worldY });
  }

  finishPolygon(store: SeatmapStore): void {
    if (this.points.length < 3) {
      this.points = [];
      return;
    }

    const venue = store.getState().venue;
    if (!venue) return;

    const area: GeneralAdmissionArea = {
      id: generateId("ga"),
      label: `GA ${Date.now().toString(36).slice(-3).toUpperCase()}`,
      shape: [...this.points],
      capacity: this.capacity,
      categoryId: this.categoryId,
    };

    this.history.execute({
      description: `Add GA area "${area.label}"`,
      execute: () => {
        const v = store.getState().venue;
        if (!v) return;
        store.getState().setVenue({
          ...v,
          gaAreas: [...v.gaAreas, area],
        });
      },
      undo: () => {
        const v = store.getState().venue;
        if (!v) return;
        store.getState().setVenue({
          ...v,
          gaAreas: v.gaAreas.filter((a) => a.id !== area.id),
        });
      },
    });

    this.points = [];
  }

  onDeactivate(): void {
    this.points = [];
  }
}
