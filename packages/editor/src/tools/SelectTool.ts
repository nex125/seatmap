import type { Viewport, SpatialIndex, CommandHistory } from "@nex125/seatmap-core";
import { pointInPolygon } from "@nex125/seatmap-core";
import type { Vec2 } from "@nex125/seatmap-core";
import type { SeatmapStore } from "@nex125/seatmap-react";
import { BaseTool, type ToolPointerEvent } from "./BaseTool";

const GRID = 20;
const MIN_SEAT_DISTANCE = 16;

function snapToGrid(v: number): number {
  return Math.round(v / GRID) * GRID;
}

type DragMode =
  | { type: "none" }
  | { type: "seats"; sectionId: string; originals: Map<string, { rowId: string; pos: Vec2 }>; delta: Vec2 }
  | { type: "section"; sectionId: string; origPos: Vec2; delta: Vec2 }
  | { type: "rect" };

export class SelectTool extends BaseTool {
  readonly name = "select";
  readonly cursor = "default";

  private isDragging = false;
  private dragStartWorld = { x: 0, y: 0 };
  private hasDragged = false;
  private dragMode: DragMode = { type: "none" };

  selectionRect: { x: number; y: number; width: number; height: number } | null = null;

  constructor(
    private spatialIndex: SpatialIndex,
    private history: CommandHistory,
  ) {
    super();
  }

  onPointerDown(e: ToolPointerEvent, _viewport: Viewport, store: SeatmapStore): void {
    this.isDragging = true;
    this.hasDragged = false;
    this.dragStartWorld = { x: e.worldX, y: e.worldY };
    this.selectionRect = null;
    this.dragMode = { type: "none" };

    const hits = this.spatialIndex.queryPoint({ x: e.worldX, y: e.worldY }, 12);
    const seatHit = hits.find((h) => h.type === "seat" && h.seatId);
    const sectionHit = hits.find((h) => h.type === "section");

    const venue = store.getState().venue;
    if (!venue) return;

    // Mode 1: Dragging selected seats (clicked on one of them)
    if (seatHit?.seatId && store.getState().selectedSeatIds.has(seatHit.seatId)) {
      const selectedIds = store.getState().selectedSeatIds;
      const sectionId = seatHit.sectionId;
      const originals = new Map<string, { rowId: string; pos: Vec2 }>();

      const section = venue.sections.find((s) => s.id === sectionId);
      if (section) {
        for (const row of section.rows) {
          for (const seat of row.seats) {
            if (selectedIds.has(seat.id)) {
              originals.set(seat.id, { rowId: row.id, pos: { ...seat.position } });
            }
          }
        }
      }

      if (originals.size > 0) {
        this.dragMode = { type: "seats", sectionId, originals, delta: { x: 0, y: 0 } };
        return;
      }
    }

    // Mode 2: Dragging a section (clicked on section background, not a seat)
    if (sectionHit && !seatHit) {
      const section = venue.sections.find((s) => s.id === sectionHit.sectionId);
      if (section) {
        this.dragMode = {
          type: "section",
          sectionId: section.id,
          origPos: { ...section.position },
          delta: { x: 0, y: 0 },
        };
        return;
      }
    }

    // Mode 3 will be rect selection (set in onPointerMove once dragging starts)
  }

  onPointerMove(e: ToolPointerEvent, _viewport: Viewport, store: SeatmapStore): void {
    if (!this.isDragging) return;

    const dx = e.worldX - this.dragStartWorld.x;
    const dy = e.worldY - this.dragStartWorld.y;
    if (!this.hasDragged && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
      this.hasDragged = true;
      if (this.dragMode.type === "none") {
        this.dragMode = { type: "rect" };
      }
    }
    if (!this.hasDragged) return;

    const venue = store.getState().venue;
    if (!venue) return;

    if (this.dragMode.type === "seats") {
      const { sectionId, originals } = this.dragMode;
      const section = venue.sections.find((s) => s.id === sectionId);
      if (!section) return;

      const c = Math.cos(-section.rotation);
      const s2 = Math.sin(-section.rotation);
      const localDx = dx * c - dy * s2;
      const localDy = dx * s2 + dy * c;

      const constrained = this.constrainSeatGroupDelta(section, originals, localDx, localDy);
      if (this.dragMode.delta.x === constrained.x && this.dragMode.delta.y === constrained.y) {
        return;
      }
      this.dragMode = {
        type: "seats",
        sectionId,
        originals,
        delta: constrained,
      };
      return;
    }

    if (this.dragMode.type === "section") {
      const { sectionId, origPos } = this.dragMode;
      const section = venue.sections.find((sec) => sec.id === sectionId);
      if (!section) return;
      const nextX = origPos.x + dx;
      const nextY = origPos.y + dy;
      if (this.dragMode.delta.x === dx && this.dragMode.delta.y === dy) {
        return;
      }
      this.dragMode = {
        type: "section",
        sectionId,
        origPos,
        delta: { x: nextX - origPos.x, y: nextY - origPos.y },
      };
      return;
    }

    if (this.dragMode.type === "rect") {
      const x = Math.min(this.dragStartWorld.x, e.worldX);
      const y = Math.min(this.dragStartWorld.y, e.worldY);
      const width = Math.abs(dx);
      const height = Math.abs(dy);
      this.selectionRect = { x, y, width, height };

      const items = this.spatialIndex.queryRect({
        minX: x, minY: y, maxX: x + width, maxY: y + height,
      });
      const seatIds = items
        .filter((item) => item.type === "seat" && item.seatId)
        .map((item) => item.seatId!);
      store.getState().setSelection(seatIds);
    }
  }

  onPointerUp(e: ToolPointerEvent, _viewport: Viewport, store: SeatmapStore): void {
    if (this.hasDragged) {
      this.commitDrag(store);
    } else {
      // Click without drag — select/deselect
      const hits = this.spatialIndex.queryPoint({ x: e.worldX, y: e.worldY }, 12);
      const seatHit = hits.find((h) => h.type === "seat" && h.seatId);
      if (seatHit?.seatId) {
        if (e.shiftKey || e.ctrlKey || e.metaKey) {
          store.getState().toggleSeat(seatHit.seatId);
        } else {
          store.getState().setSelection([seatHit.seatId]);
        }
      } else if (!e.shiftKey && !e.ctrlKey && !e.metaKey) {
        store.getState().clearSelection();
      }
    }

    this.reset();
  }

  private commitDrag(store: SeatmapStore): void {
    const venue = store.getState().venue;
    if (!venue) return;

    if (this.dragMode.type === "seats") {
      const { sectionId, originals, delta } = this.dragMode;
      const section = venue.sections.find((s) => s.id === sectionId);
      if (!section) return;
      if (delta.x === 0 && delta.y === 0) return;

      // Snap movement to grid while preserving section constraints.
      const snappedDelta = this.snapSeatGroupDelta(section, originals, delta.x, delta.y);

      // Snap final positions to grid on commit
      const finals = new Map<string, Vec2>();
      for (const [seatId, orig] of originals.entries()) {
        finals.set(seatId, {
          x: orig.pos.x + snappedDelta.x,
          y: orig.pos.y + snappedDelta.y,
        });
      }

      // Apply snapped positions immediately so the user sees the snap
      store.getState().setVenue({
        ...venue,
        sections: venue.sections.map((sec) =>
          sec.id === sectionId
            ? {
                ...sec,
                rows: sec.rows.map((r) => ({
                  ...r,
                  seats: r.seats.map((st) => {
                    const fp = finals.get(st.id);
                    return fp ? { ...st, position: fp } : st;
                  }),
                })),
              }
            : sec,
        ),
      });

      this.history.execute({
        description: `Move ${originals.size} seat(s)`,
        execute: () => {
          const v = store.getState().venue;
          if (!v) return;
          store.getState().setVenue({
            ...v,
            sections: v.sections.map((sec) =>
              sec.id === sectionId
                ? {
                    ...sec,
                    rows: sec.rows.map((r) => ({
                      ...r,
                      seats: r.seats.map((st) => {
                        const fp = finals.get(st.id);
                        return fp ? { ...st, position: fp } : st;
                      }),
                    })),
                  }
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
                ? {
                    ...sec,
                    rows: sec.rows.map((r) => ({
                      ...r,
                      seats: r.seats.map((st) => {
                        const op = originals.get(st.id);
                        return op ? { ...st, position: op.pos } : st;
                      }),
                    })),
                  }
                : sec,
            ),
          });
        },
      });
    }

    if (this.dragMode.type === "section") {
      const { sectionId, origPos, delta } = this.dragMode;
      const finalPos = { x: origPos.x + delta.x, y: origPos.y + delta.y };
      if (finalPos.x === origPos.x && finalPos.y === origPos.y) return;

      this.history.execute({
        description: `Move section`,
        execute: () => {
          const v = store.getState().venue;
          if (!v) return;
          store.getState().setVenue({
            ...v,
            sections: v.sections.map((s) =>
              s.id === sectionId ? { ...s, position: finalPos } : s,
            ),
          });
        },
        undo: () => {
          const v = store.getState().venue;
          if (!v) return;
          store.getState().setVenue({
            ...v,
            sections: v.sections.map((s) =>
              s.id === sectionId ? { ...s, position: origPos } : s,
            ),
          });
        },
      });
    }
  }

  private reset(): void {
    this.isDragging = false;
    this.hasDragged = false;
    this.selectionRect = null;
    this.dragMode = { type: "none" };
  }

  onDeactivate(): void {
    this.reset();
  }

  getSectionDragPreview(
    venue: { sections: Array<{ id: string; position: Vec2; rotation: number; outline: Vec2[] }> } | null,
  ): Vec2[] | null {
    const drag = this.dragMode;
    if (!venue || drag.type !== "section") return null;
    const section = venue.sections.find((s) => s.id === drag.sectionId);
    if (!section || section.outline.length < 3) return null;
    const pos = {
      x: drag.origPos.x + drag.delta.x,
      y: drag.origPos.y + drag.delta.y,
    };
    const c = Math.cos(section.rotation);
    const s = Math.sin(section.rotation);
    return section.outline.map((p) => ({
      x: pos.x + p.x * c - p.y * s,
      y: pos.y + p.x * s + p.y * c,
    }));
  }

  getSeatDragPreview(
    venue: { sections: Array<{ id: string; position: Vec2; rotation: number }> } | null,
  ): Vec2[] {
    const drag = this.dragMode;
    if (!venue || drag.type !== "seats") return [];
    const section = venue.sections.find((s) => s.id === drag.sectionId);
    if (!section) return [];
    const c = Math.cos(section.rotation);
    const s = Math.sin(section.rotation);
    return [...drag.originals.values()].map((orig) => {
      const localX = orig.pos.x + drag.delta.x;
      const localY = orig.pos.y + drag.delta.y;
      return {
        x: section.position.x + localX * c - localY * s,
        y: section.position.y + localX * s + localY * c,
      };
    });
  }

  private constrainSeatGroupDelta(
    section: { outline: Vec2[]; rows: Array<{ seats: Array<{ id: string; position: Vec2 }> }> },
    originals: Map<string, { rowId: string; pos: Vec2 }>,
    desiredDx: number,
    desiredDy: number,
  ): Vec2 {
    const canPlace = (dx: number, dy: number): boolean => {
      const hasOutline = section.outline.length >= 3;
      const staticSeats: Vec2[] = [];
      for (const row of section.rows) {
        for (const seat of row.seats) {
          if (!originals.has(seat.id)) staticSeats.push(seat.position);
        }
      }

      for (const { pos } of originals.values()) {
        const moved = { x: pos.x + dx, y: pos.y + dy };
        if (hasOutline && !pointInPolygon(moved, section.outline)) {
          return false;
        }
        for (const other of staticSeats) {
          if (Math.hypot(other.x - moved.x, other.y - moved.y) < MIN_SEAT_DISTANCE) {
            return false;
          }
        }
      }
      return true;
    };

    if (canPlace(desiredDx, desiredDy)) {
      return { x: desiredDx, y: desiredDy };
    }
    if (!canPlace(0, 0)) {
      return { x: desiredDx, y: desiredDy };
    }

    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 14; i++) {
      const mid = (lo + hi) * 0.5;
      if (canPlace(desiredDx * mid, desiredDy * mid)) lo = mid;
      else hi = mid;
    }
    return { x: desiredDx * lo, y: desiredDy * lo };
  }

  private snapSeatGroupDelta(
    section: { outline: Vec2[]; rows: Array<{ seats: Array<{ id: string; position: Vec2 }> }> },
    originals: Map<string, { rowId: string; pos: Vec2 }>,
    desiredDx: number,
    desiredDy: number,
  ): Vec2 {
    const snappedDx = Math.round(desiredDx / GRID) * GRID;
    const snappedDy = Math.round(desiredDy / GRID) * GRID;
    const snapped = this.constrainSeatGroupDelta(section, originals, snappedDx, snappedDy);

    // If a constrained snap already lands on the grid, use it.
    if (snapToGrid(snapped.x) === snapped.x && snapToGrid(snapped.y) === snapped.y) {
      return snapped;
    }

    // Otherwise, back off in grid-sized steps until we find a valid on-grid movement.
    const stepCount = Math.max(Math.abs(snappedDx), Math.abs(snappedDy)) / GRID;
    if (!Number.isFinite(stepCount) || stepCount <= 0) {
      return { x: 0, y: 0 };
    }

    for (let step = Math.floor(stepCount); step >= 0; step--) {
      const ratio = step / stepCount;
      const candidate = this.constrainSeatGroupDelta(
        section,
        originals,
        Math.round((snappedDx * ratio) / GRID) * GRID,
        Math.round((snappedDy * ratio) / GRID) * GRID,
      );
      if (snapToGrid(candidate.x) === candidate.x && snapToGrid(candidate.y) === candidate.y) {
        return candidate;
      }
    }

    return { x: 0, y: 0 };
  }
}
