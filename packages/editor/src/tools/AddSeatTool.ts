import type { Viewport, SpatialIndex, CommandHistory } from "@nex125/seatmap-core";
import { generateId, pointInPolygon } from "@nex125/seatmap-core";
import type { Seat, Row } from "@nex125/seatmap-core";
import type { SeatmapStore } from "@nex125/seatmap-react";
import { BaseTool, type ToolPointerEvent } from "./BaseTool";

const GRID = 20;
const MIN_SEAT_DIST = 16;

function snapToGrid(v: number): number {
  return Math.round(v / GRID) * GRID;
}

export class AddSeatTool extends BaseTool {
  readonly name = "add-seat";
  readonly cursor = "crosshair";

  constructor(
    private history: CommandHistory,
    private spatialIndex: SpatialIndex,
  ) {
    super();
  }

  onPointerDown(e: ToolPointerEvent, _viewport: Viewport, store: SeatmapStore): void {
    const hits = this.spatialIndex.queryPoint({ x: e.worldX, y: e.worldY }, 50);
    const sectionHit = hits.find((h) => h.type === "section");
    if (!sectionHit) return;

    const venue = store.getState().venue;
    if (!venue) return;

    const section = venue.sections.find((s) => s.id === sectionHit.sectionId);
    if (!section) return;

    const relX = e.worldX - section.position.x;
    const relY = e.worldY - section.position.y;
    const c = Math.cos(-section.rotation);
    const s2 = Math.sin(-section.rotation);
    let lx = snapToGrid(relX * c - relY * s2);
    let ly = snapToGrid(relX * s2 + relY * c);

    if (section.outline.length >= 3 && !pointInPolygon({ x: lx, y: ly }, section.outline)) {
      return;
    }

    // Collect all existing seat positions in this section
    const existing: Array<{ x: number; y: number }> = [];
    for (const row of section.rows) {
      for (const seat of row.seats) {
        existing.push(seat.position);
      }
    }

    // Nudge away from overlapping seats
    lx = this.findNonOverlapping(lx, ly, existing);

    // Find the nearest existing row by Y, or create a new one
    let bestRow: Row | null = null;
    let bestDist = Infinity;
    for (const row of section.rows) {
      if (row.seats.length === 0) continue;
      const rowY = row.seats[0].position.y;
      const dist = Math.abs(ly - rowY);
      if (dist < MIN_SEAT_DIST && dist < bestDist) {
        bestDist = dist;
        bestRow = row;
      }
    }

    const sectionId = section.id;

    if (bestRow) {
      const rowId = bestRow.id;
      const snappedY = bestRow.seats[0].position.y;
      const existingInRow = bestRow.seats.map((s) => s.position);
      const finalX = this.findNonOverlapping(lx, snappedY, existingInRow);

      const newSeat: Seat = {
        id: generateId("seat"),
        label: `${bestRow.seats.length + 1}`,
        position: { x: finalX, y: snappedY },
        status: "available",
        categoryId: section.categoryId,
      };

      this.history.execute({
        description: `Add seat to row "${bestRow.label}"`,
        execute: () => {
          const v = store.getState().venue;
          if (!v) return;
          store.getState().setVenue({
            ...v,
            sections: v.sections.map((sec) =>
              sec.id === sectionId
                ? { ...sec, rows: sec.rows.map((r) => r.id === rowId ? { ...r, seats: [...r.seats, newSeat] } : r) }
                : sec,
            ),
          });
        },
        undo: () => {
          const v = store.getState().venue;
          if (!v) return;
          store.getState().setVenue({
            ...v,
            sections: v.sections.map((sec) =>
              sec.id === sectionId
                ? { ...sec, rows: sec.rows.map((r) => r.id === rowId ? { ...r, seats: r.seats.filter((st) => st.id !== newSeat.id) } : r) }
                : sec,
            ),
          });
        },
      });
    } else {
      const rowLabel = String.fromCharCode(65 + section.rows.length);
      const newSeat: Seat = {
        id: generateId("seat"),
        label: "1",
        position: { x: lx, y: ly },
        status: "available",
        categoryId: section.categoryId,
      };
      const newRow: Row = { id: generateId("row"), label: rowLabel, seats: [newSeat] };

      this.history.execute({
        description: `Add seat in new row ${rowLabel}`,
        execute: () => {
          const v = store.getState().venue;
          if (!v) return;
          store.getState().setVenue({
            ...v,
            sections: v.sections.map((sec) =>
              sec.id === sectionId ? { ...sec, rows: [...sec.rows, newRow] } : sec,
            ),
          });
        },
        undo: () => {
          const v = store.getState().venue;
          if (!v) return;
          store.getState().setVenue({
            ...v,
            sections: v.sections.map((sec) =>
              sec.id === sectionId ? { ...sec, rows: sec.rows.filter((r) => r.id !== newRow.id) } : sec,
            ),
          });
        },
      });
    }
  }

  private findNonOverlapping(x: number, y: number, existing: Array<{ x: number; y: number }>): number {
    let candidate = snapToGrid(x);
    for (let attempt = 0; attempt < 20; attempt++) {
      const overlaps = existing.some(
        (p) => Math.hypot(p.x - candidate, p.y - y) < MIN_SEAT_DIST,
      );
      if (!overlaps) return candidate;
      candidate += GRID;
    }
    return candidate;
  }
}
