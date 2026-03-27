import type { Viewport, SpatialIndex, CommandHistory } from "@nex125/seatmap-core";
import { clampToPolygon } from "@nex125/seatmap-core";
import type { Vec2 } from "@nex125/seatmap-core";
import type { SeatmapStore } from "@nex125/seatmap-react";
import { BaseTool, type ToolPointerEvent } from "./BaseTool";

const GRID = 20;

function snapToGrid(v: number): number {
  return Math.round(v / GRID) * GRID;
}

type DragMode =
  | { type: "none" }
  | { type: "seats"; sectionId: string; originals: Map<string, { rowId: string; pos: Vec2 }> }
  | { type: "section"; sectionId: string; origPos: Vec2 }
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
        this.dragMode = { type: "seats", sectionId, originals };
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

      const outline = section.outline;
      store.getState().setVenue({
        ...venue,
        sections: venue.sections.map((sec) => {
          if (sec.id !== sectionId) return sec;
          return {
            ...sec,
            rows: sec.rows.map((r) => ({
              ...r,
              seats: r.seats.map((st) => {
                const orig = originals.get(st.id);
                if (!orig) return st;
                let pos = {
                  x: orig.pos.x + localDx,
                  y: orig.pos.y + localDy,
                };
                if (outline.length >= 3) {
                  pos = clampToPolygon(pos, outline);
                }
                return { ...st, position: pos };
              }),
            })),
          };
        }),
      });
      return;
    }

    if (this.dragMode.type === "section") {
      const { sectionId, origPos } = this.dragMode;
      store.getState().setVenue({
        ...venue,
        sections: venue.sections.map((sec) =>
          sec.id === sectionId
            ? { ...sec, position: { x: origPos.x + dx, y: origPos.y + dy } }
            : sec,
        ),
      });
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
      const { sectionId, originals } = this.dragMode;
      const section = venue.sections.find((s) => s.id === sectionId);
      if (!section) return;

      // Snap final positions to grid on commit
      const finals = new Map<string, Vec2>();
      for (const row of section.rows) {
        for (const seat of row.seats) {
          if (originals.has(seat.id)) {
            finals.set(seat.id, {
              x: snapToGrid(seat.position.x),
              y: snapToGrid(seat.position.y),
            });
          }
        }
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
      const { sectionId, origPos } = this.dragMode;
      const section = venue.sections.find((s) => s.id === sectionId);
      if (!section) return;
      const finalPos = { ...section.position };

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
}
