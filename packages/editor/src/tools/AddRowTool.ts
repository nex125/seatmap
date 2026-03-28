import type { Viewport, SpatialIndex, CommandHistory } from "@nex125/seatmap-core";
import { generateId, pointInPolygon } from "@nex125/seatmap-core";
import type { Row, Seat } from "@nex125/seatmap-core";
import type { SeatmapStore } from "@nex125/seatmap-react";
import { BaseTool, type ToolPointerEvent } from "./BaseTool";

const ROW_GAP = 22;

export class AddRowTool extends BaseTool {
  readonly name = "add-row";
  readonly cursor = "cell";

  seatsPerRow = 10;
  seatSpacing = 20;

  constructor(
    private history: CommandHistory,
    private spatialIndex: SpatialIndex,
  ) {
    super();
  }

  onPointerDown(e: ToolPointerEvent, _viewport: Viewport, store: SeatmapStore): void {
    const hits = this.spatialIndex.queryPoint({ x: e.worldX, y: e.worldY }, 50);

    const venue = store.getState().venue;
    if (!venue) return;

    const sectionHits = hits.filter((h) => h.type === "section");
    if (sectionHits.length === 0) return;

    const sectionIds = [...new Set(sectionHits.map((h) => h.sectionId))];
    let section = sectionIds
      .map((id) => venue.sections.find((s) => s.id === id))
      .filter((s): s is NonNullable<typeof s> => Boolean(s))
      .find((s) => {
        if (s.outline.length < 3) return true;
        const cos = Math.cos(-s.rotation);
        const sin = Math.sin(-s.rotation);
        const relX = e.worldX - s.position.x;
        const relY = e.worldY - s.position.y;
        const local = {
          x: relX * cos - relY * sin,
          y: relX * sin + relY * cos,
        };
        return pointInPolygon(local, s.outline);
      });

    if (!section) {
      section = sectionIds
        .map((id) => venue.sections.find((s) => s.id === id))
        .filter((s): s is NonNullable<typeof s> => Boolean(s))
        .sort(
          (a, b) =>
            Math.hypot(e.worldX - a.position.x, e.worldY - a.position.y) -
            Math.hypot(e.worldX - b.position.x, e.worldY - b.position.y),
        )[0];
    }
    if (!section) return;

    // Convert click to section-local coordinates
    const cos = Math.cos(-section.rotation);
    const sin = Math.sin(-section.rotation);
    const relX = e.worldX - section.position.x;
    const relY = e.worldY - section.position.y;
    let targetY = relX * sin + relY * cos;

    // Collect existing row Y positions and snap away from them to avoid overlap
    const existingYs = section.rows
      .flatMap((r) => r.seats.map((s) => s.position.y))
      .filter((y, i, arr) => arr.indexOf(y) === i)
      .sort((a, b) => a - b);

    for (const ey of existingYs) {
      if (Math.abs(targetY - ey) < ROW_GAP) {
        targetY = ey + ROW_GAP;
      }
    }

    const hasOutline = section.outline.length >= 3;
    const allSeats: Seat[] = [];
    const startX = -((this.seatsPerRow - 1) * this.seatSpacing) / 2;
    for (let i = 0; i < this.seatsPerRow; i++) {
      const pos = { x: startX + i * this.seatSpacing, y: targetY };
      if (hasOutline && !pointInPolygon(pos, section.outline)) continue;
      allSeats.push({
        id: generateId("seat"),
        label: `${allSeats.length + 1}`,
        position: pos,
        status: "available",
        categoryId: section.categoryId,
      });
    }
    const seats = allSeats;
    if (seats.length === 0) return;

    const rowLabel = String.fromCharCode(65 + section.rows.length);
    const newRow: Row = {
      id: generateId("row"),
      label: rowLabel,
      seats,
    };

    const sectionId = section.id;

    this.history.execute({
      description: `Add row ${rowLabel} to "${section.label}"`,
      execute: () => {
        const v = store.getState().venue;
        if (!v) return;
        store.getState().setVenue({
          ...v,
          sections: v.sections.map((s) =>
            s.id === sectionId ? { ...s, rows: [...s.rows, newRow] } : s,
          ),
        });
      },
      undo: () => {
        const v = store.getState().venue;
        if (!v) return;
        store.getState().setVenue({
          ...v,
          sections: v.sections.map((s) =>
            s.id === sectionId
              ? { ...s, rows: s.rows.filter((r) => r.id !== newRow.id) }
              : s,
          ),
        });
      },
    });
  }
}
