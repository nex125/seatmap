import type { Viewport, SpatialIndex, CommandHistory } from "@nex125/seatmap-core";
import { generateId, isDancefloorSection, isStageSection, pointInPolygon } from "@nex125/seatmap-core";
import type { Row, Section, Venue } from "@nex125/seatmap-core";
import type { SeatmapStore } from "@nex125/seatmap-react";
import { BaseTool, type ToolPointerEvent } from "./BaseTool";

const GRID = 20;
const ROW_GAP = GRID;
const ROW_MERGE_THRESHOLD = GRID * 0.5;
const MIN_SEAT_DIST = 16;

function snapToGrid(v: number): number {
  return Math.round(v / GRID) * GRID;
}

function rowLabelFromIndex(index: number): string {
  return `${index + 1}`;
}

function computeRowDepthV(
  row: Row,
  toOriented: (point: { x: number; y: number }) => { u: number; v: number },
): number | null {
  if (row.seats.length === 0) return null;
  const projected = row.seats.map((seat) => toOriented(seat.position).v);
  return projected.reduce((sum, v) => sum + v, 0) / projected.length;
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

    const hasOutline = section.outline.length >= 3;
    const rowsToAdd = Math.max(1, Math.floor(this.rowsCount));
    const workingRows = section.rows.map((row) => ({
      ...row,
      seats: row.seats.map((seat) => ({ ...seat })),
    }));
    const rowDepths = new Map<string, number>();
    for (const row of workingRows) {
      const depth = computeRowDepthV(row, toOriented);
      if (depth !== null) {
        rowDepths.set(row.id, depth);
      }
    }
    const createdRowIds: string[] = [];
    let didChange = false;

    for (let rowIndex = 0; rowIndex < rowsToAdd; rowIndex++) {
      const desiredV = targetV + rowIndex * ROW_GAP;
      let targetRow = workingRows.find((row) => {
        const depth = rowDepths.get(row.id);
        return depth !== undefined && Math.abs(depth - desiredV) <= ROW_MERGE_THRESHOLD;
      });

      let rowV = desiredV;
      if (!targetRow) {
        while ([...rowDepths.values()].some((v) => Math.abs(rowV - v) < ROW_GAP)) {
          rowV += ROW_GAP;
        }
        targetRow = {
          id: generateId(),
          label: rowLabelFromIndex(workingRows.length),
          seats: [],
        };
        workingRows.push(targetRow);
        rowDepths.set(targetRow.id, rowV);
        createdRowIds.push(targetRow.id);
      } else {
        rowV = rowDepths.get(targetRow.id) ?? rowV;
      }

      for (let i = 0; i < this.seatsPerRow; i++) {
        const pos = fromOriented(startU + i * this.seatSpacing, rowV);
        if (hasOutline && !pointInPolygon(pos, section.outline)) {
          // Keep placement consistent: fill from the first seat (pointer) to the right only.
          break;
        }
        const overlaps = targetRow.seats.some(
          (seat) => Math.hypot(seat.position.x - pos.x, seat.position.y - pos.y) < MIN_SEAT_DIST,
        );
        if (overlaps) {
          continue;
        }
        targetRow.seats.push({
          id: generateId(),
          label: `${targetRow.seats.length + 1}`,
          position: pos,
          status: "available",
          categoryId: section.categoryId,
        });
        didChange = true;
      }
    }

    if (!didChange) {
      return;
    }

    const finalRows = workingRows.filter((row) => row.seats.length > 0);
    if (finalRows.length === 0) {
      return;
    }

    const sectionId = section.id;

    this.history.execute({
      description:
        createdRowIds.length === 1
          ? `Add row ${finalRows.find((row) => row.id === createdRowIds[0])?.label ?? "?"} to "${section.label}"`
          : createdRowIds.length > 1
            ? `Add ${createdRowIds.length} rows to "${section.label}"`
            : `Extend rows in "${section.label}"`,
      execute: () => {
        const v = store.getState().venue;
        if (!v) return;
        store.getState().setVenue({
          ...v,
          sections: v.sections.map((s) =>
            s.id === sectionId ? { ...s, rows: finalRows } : s,
          ),
        });
      },
      undo: () => {
        const v = store.getState().venue;
        if (!v) return;
        store.getState().setVenue({
          ...v,
          sections: v.sections.map((s) =>
            s.id === sectionId ? { ...s, rows: section.rows } : s,
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
      .filter((section) => !isStageSection(section) && !isDancefloorSection(section));
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
