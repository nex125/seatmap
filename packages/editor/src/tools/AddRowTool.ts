import type { Viewport, SpatialIndex, CommandHistory } from "@nex125/seatmap-core";
import { generateId, isStageSection, pointInPolygon } from "@nex125/seatmap-core";
import type { Row, Seat, Section, Venue } from "@nex125/seatmap-core";
import type { SeatmapStore } from "@nex125/seatmap-react";
import { BaseTool, type ToolPointerEvent } from "./BaseTool";

const GRID = 20;
const ROW_GAP = GRID;

function snapToGrid(v: number): number {
  return Math.round(v / GRID) * GRID;
}

function rowLabelFromIndex(index: number): string {
  let n = index + 1;
  let label = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    label = String.fromCharCode(65 + rem) + label;
    n = Math.floor((n - 1) / 26);
  }
  return label;
}

export class AddRowTool extends BaseTool {
  readonly name = "add-row";
  readonly cursor = "cell";

  seatsPerRow = 10;
  rowsCount = 1;
  seatSpacing = 20;
  rowOrientationDeg = 0;

  getPlacementPreview(
    worldX: number,
    worldY: number,
    venue: Venue | null,
  ): { worldX: number; worldY: number; worldAngleRad: number } | null {
    if (!venue) return null;
    const section = this.findTargetSection(worldX, worldY, venue);
    if (!section) return null;
    const worldAngleRad = section.rotation + this.getFacingOrientationRad();
    return { worldX, worldY, worldAngleRad };
  }

  constructor(
    private history: CommandHistory,
    private spatialIndex: SpatialIndex,
  ) {
    super();
  }

  onPointerDown(e: ToolPointerEvent, _viewport: Viewport, store: SeatmapStore): void {
    const venue = store.getState().venue;
    if (!venue) return;
    const section = this.findTargetSection(e.worldX, e.worldY, venue);
    if (!section) return;

    // Convert click to section-local coordinates.
    const cos = Math.cos(-section.rotation);
    const sin = Math.sin(-section.rotation);
    const relX = e.worldX - section.position.x;
    const relY = e.worldY - section.position.y;
    const localX = relX * cos - relY * sin;
    const localY = relX * sin + relY * cos;

    // Row seats are placed along the row axis, which is perpendicular to the facing direction.
    const orientationRad = this.getRowAxisRad();
    const orientationCos = Math.cos(orientationRad);
    const orientationSin = Math.sin(orientationRad);
    const toOriented = (point: { x: number; y: number }) => ({
      u: point.x * orientationCos + point.y * orientationSin,
      v: -point.x * orientationSin + point.y * orientationCos,
    });
    const fromOriented = (u: number, v: number) => ({
      x: u * orientationCos - v * orientationSin,
      y: u * orientationSin + v * orientationCos,
    });

    const clickOriented = toOriented({ x: localX, y: localY });
    // Align row placement to the section snap grid so add-seat and drag snapping
    // use the same lattice inside this section.
    const startU = snapToGrid(clickOriented.u);
    const targetV = snapToGrid(clickOriented.v);

    // Collect existing row "depth" positions relative to current orientation and snap away from overlap.
    const existingVs = section.rows
      .map((row) => {
        if (row.seats.length === 0) return null;
        const projected = row.seats.map((seat) => toOriented(seat.position).v);
        return projected.reduce((sum, v) => sum + v, 0) / projected.length;
      })
      .filter((v): v is number => v !== null)
      .sort((a, b) => a - b);

    const hasOutline = section.outline.length >= 3;
    const rowsToAdd = Math.max(1, Math.floor(this.rowsCount));
    const occupiedVs = [...existingVs];
    const newRows: Row[] = [];

    for (let rowIndex = 0; rowIndex < rowsToAdd; rowIndex++) {
      let rowV = targetV + rowIndex * ROW_GAP;
      if (rowIndex > 0) {
        while (occupiedVs.some((v) => Math.abs(rowV - v) < ROW_GAP)) {
          rowV += ROW_GAP;
        }
      }
      occupiedVs.push(rowV);

      const seats: Seat[] = [];
      for (let i = 0; i < this.seatsPerRow; i++) {
        const pos = fromOriented(startU + i * this.seatSpacing, rowV);
        if (hasOutline && !pointInPolygon(pos, section.outline)) {
          // Keep placement consistent: fill from the first seat (pointer) to the right only.
          break;
        }
        seats.push({
          id: generateId(),
          label: `${seats.length + 1}`,
          position: pos,
          status: "available",
          categoryId: section.categoryId,
        });
      }

      if (seats.length === 0) continue;

      newRows.push({
        id: generateId(),
        label: rowLabelFromIndex(section.rows.length + newRows.length),
        seats,
      });
    }

    if (newRows.length === 0) return;

    const sectionId = section.id;
    const rowIds = newRows.map((r) => r.id);

    this.history.execute({
      description:
        newRows.length === 1
          ? `Add row ${newRows[0].label} to "${section.label}"`
          : `Add ${newRows.length} rows to "${section.label}"`,
      execute: () => {
        const v = store.getState().venue;
        if (!v) return;
        store.getState().setVenue({
          ...v,
          sections: v.sections.map((s) =>
            s.id === sectionId ? { ...s, rows: [...s.rows, ...newRows] } : s,
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
              ? { ...s, rows: s.rows.filter((r) => !rowIds.includes(r.id)) }
              : s,
          ),
        });
      },
    });
  }

  private findTargetSection(worldX: number, worldY: number, venue: Venue): Section | null {
    const hits = this.spatialIndex.queryPoint({ x: worldX, y: worldY }, 50);
    const sectionHits = hits.filter((h) => h.type === "section");
    if (sectionHits.length === 0) return null;

    const sectionIds = [...new Set(sectionHits.map((h) => h.sectionId))];
    const sections = sectionIds
      .map((id) => venue.sections.find((s) => s.id === id))
      .filter((s): s is Section => Boolean(s))
      .filter((section) => !isStageSection(section));
    if (sections.length === 0) return null;

    const containing = sections.find((section) => {
      if (section.outline.length < 3) return true;
      const cos = Math.cos(-section.rotation);
      const sin = Math.sin(-section.rotation);
      const relX = worldX - section.position.x;
      const relY = worldY - section.position.y;
      const local = {
        x: relX * cos - relY * sin,
        y: relX * sin + relY * cos,
      };
      return pointInPolygon(local, section.outline);
    });
    if (containing) return containing;

    return sections.sort(
      (a, b) =>
        Math.hypot(worldX - a.position.x, worldY - a.position.y) -
        Math.hypot(worldX - b.position.x, worldY - b.position.y),
    )[0] ?? null;
  }

  private getFacingOrientationRad(): number {
    // Facing direction: 0deg points up; 90deg points right.
    return ((this.rowOrientationDeg - 90) * Math.PI) / 180;
  }

  private getRowAxisRad(): number {
    return this.getFacingOrientationRad() + Math.PI / 2;
  }
}
