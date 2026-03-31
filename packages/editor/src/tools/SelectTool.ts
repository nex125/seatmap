import type { Viewport, SpatialIndex, CommandHistory } from "@nex125/seatmap-core";
import { pointInPolygon } from "@nex125/seatmap-core";
import type { Vec2 } from "@nex125/seatmap-core";
import type { Section } from "@nex125/seatmap-core";
import type { SeatmapStore } from "@nex125/seatmap-react";
import { BaseTool, type ToolPointerEvent } from "./BaseTool";

const GRID = 20;
const MIN_SEAT_DISTANCE = 16;
const RESIZE_HIT_RADIUS_PX = 10;
const MERGE_DISTANCE_PX = 14;

function snapToGrid(v: number): number {
  return Math.round(v / GRID) * GRID;
}

type DragMode =
  | { type: "none" }
  | { type: "seats"; sectionId: string; originals: Map<string, { rowId: string; pos: Vec2 }>; delta: Vec2 }
  | { type: "section"; sectionId: string; origPos: Vec2; delta: Vec2 }
  | {
      type: "resize-corner";
      sectionId: string;
      cornerIndex: number;
      originalOutline: Vec2[];
      outline: Vec2[];
      mergeTargetIndex: number | null;
    }
  | {
      type: "resize-side";
      sectionId: string;
      sideIndex: number;
      startLocal: Vec2;
      originalOutline: Vec2[];
      outline: Vec2[];
      mergeCandidates: Array<{ fromIndex: number; toIndex: number }>;
    }
  | { type: "rect" };

export class SelectTool extends BaseTool {
  readonly name = "select";
  readonly cursor = "default";

  private isDragging = false;
  private dragStartWorld = { x: 0, y: 0 };
  private hasDragged = false;
  private dragMode: DragMode = { type: "none" };
  private sectionResizeEnabled = false;
  private resizeTargetSectionId: string | null = null;

  selectionRect: { x: number; y: number; width: number; height: number } | null = null;

  constructor(
    private spatialIndex: SpatialIndex,
    private history: CommandHistory,
  ) {
    super();
  }

  setSectionResizeEnabled(enabled: boolean): void {
    this.sectionResizeEnabled = enabled;
    if (!enabled) {
      this.resizeTargetSectionId = null;
    }
    if (!enabled && (this.dragMode.type === "resize-corner" || this.dragMode.type === "resize-side")) {
      this.reset();
    }
  }

  onPointerDown(e: ToolPointerEvent, viewport: Viewport, store: SeatmapStore): void {
    this.isDragging = true;
    this.hasDragged = false;
    this.dragStartWorld = { x: e.worldX, y: e.worldY };
    this.selectionRect = null;
    this.dragMode = { type: "none" };

    const venue = store.getState().venue;
    if (!venue) return;
    const hits = this.spatialIndex.queryPoint({ x: e.worldX, y: e.worldY }, 12);
    const seatHit = this.pickNearestSeatHit(hits, { x: e.worldX, y: e.worldY });
    const sectionHit = hits.find((h) => h.type === "section");

    if (this.sectionResizeEnabled) {
      const clickedSection = sectionHit
        ? venue.sections.find((s) => s.id === sectionHit.sectionId) ?? null
        : null;
      if (clickedSection) {
        this.resizeTargetSectionId = clickedSection.id;
      }
      const editableSection = clickedSection ?? this.getEditableSection(venue, store.getState().selectedSeatIds);
      if (editableSection && editableSection.outline.length >= 3) {
        const localPoint = this.toLocal(editableSection, { x: e.worldX, y: e.worldY });
        const hitRadius = RESIZE_HIT_RADIUS_PX / Math.max(0.001, viewport.zoom);
        const cornerIndex = this.findCornerHandleIndex(editableSection.outline, localPoint, hitRadius);
        if (cornerIndex >= 0) {
          this.dragMode = {
            type: "resize-corner",
            sectionId: editableSection.id,
            cornerIndex,
            originalOutline: editableSection.outline.map((p) => ({ ...p })),
            outline: editableSection.outline.map((p) => ({ ...p })),
            mergeTargetIndex: null,
          };
          return;
        }
        const sideIndex = this.findSideHandleIndex(editableSection.outline, localPoint, hitRadius);
        if (sideIndex >= 0) {
          this.dragMode = {
            type: "resize-side",
            sectionId: editableSection.id,
            sideIndex,
            startLocal: localPoint,
            originalOutline: editableSection.outline.map((p) => ({ ...p })),
            outline: editableSection.outline.map((p) => ({ ...p })),
            mergeCandidates: [],
          };
          return;
        }
        if (clickedSection && !seatHit) {
          // In resize mode, clicking a section body just targets it and shows handles.
          return;
        }
      }
    }

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
    if (!this.sectionResizeEnabled && sectionHit && !seatHit) {
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

  onPointerMove(e: ToolPointerEvent, viewport: Viewport, store: SeatmapStore): void {
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

    if (this.dragMode.type === "resize-corner") {
      const drag = this.dragMode;
      const section = venue.sections.find((s) => s.id === drag.sectionId);
      if (!section) return;
      const mergeThreshold = MERGE_DISTANCE_PX / Math.max(0.001, viewport.zoom);
      const localPoint = this.toLocal(section, { x: e.worldX, y: e.worldY });
      const nextOutline = drag.originalOutline.map((p) => ({ ...p }));
      nextOutline[drag.cornerIndex] = localPoint;
      const mergeTargetIndex = this.findMergeTargetIndex(nextOutline, drag.cornerIndex, mergeThreshold);
      this.dragMode = {
        ...drag,
        outline: nextOutline,
        mergeTargetIndex,
      };
      return;
    }

    if (this.dragMode.type === "resize-side") {
      const drag = this.dragMode;
      const section = venue.sections.find((s) => s.id === drag.sectionId);
      if (!section) return;
      const mergeThreshold = MERGE_DISTANCE_PX / Math.max(0.001, viewport.zoom);
      const localPoint = this.toLocal(section, { x: e.worldX, y: e.worldY });
      const delta = {
        x: localPoint.x - drag.startLocal.x,
        y: localPoint.y - drag.startLocal.y,
      };
      const outlineLen = drag.originalOutline.length;
      const a = drag.sideIndex;
      const b = (drag.sideIndex + 1) % outlineLen;
      const nextOutline = drag.originalOutline.map((p) => ({ ...p }));
      nextOutline[a] = {
        x: nextOutline[a].x + delta.x,
        y: nextOutline[a].y + delta.y,
      };
      nextOutline[b] = {
        x: nextOutline[b].x + delta.x,
        y: nextOutline[b].y + delta.y,
      };
      const mergeCandidates = this.findMergeCandidates(nextOutline, [a, b], mergeThreshold);
      this.dragMode = {
        ...drag,
        outline: nextOutline,
        mergeCandidates,
      };
      return;
    }

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
    } else if (this.dragMode.type === "resize-side") {
      this.commitAddPointOnSide(store, this.dragMode, { x: e.worldX, y: e.worldY });
    } else if (this.dragMode.type === "resize-corner") {
      // Ignore click-selection behavior when a resize handle was clicked but not dragged.
    } else {
      // Click without drag — select/deselect
      const hits = this.spatialIndex.queryPoint({ x: e.worldX, y: e.worldY }, 12);
      const seatHit = this.pickNearestSeatHit(hits, { x: e.worldX, y: e.worldY });
      const sectionHit = hits.find((h) => h.type === "section");
      if (seatHit?.seatId) {
        this.resizeTargetSectionId = seatHit.sectionId;
        if (e.shiftKey || e.ctrlKey || e.metaKey) {
          store.getState().toggleSeat(seatHit.seatId);
        } else {
          store.getState().setSelection([seatHit.seatId]);
        }
      } else if (this.sectionResizeEnabled && sectionHit?.sectionId) {
        this.resizeTargetSectionId = sectionHit.sectionId;
      } else if (!e.shiftKey && !e.ctrlKey && !e.metaKey) {
        if (this.sectionResizeEnabled) {
          this.resizeTargetSectionId = null;
        }
        store.getState().clearSelection();
      }
    }

    this.reset();
  }

  private commitAddPointOnSide(
    store: SeatmapStore,
    drag: Extract<DragMode, { type: "resize-side" }>,
    worldPoint: Vec2,
  ): void {
    const venue = store.getState().venue;
    if (!venue) return;
    const section = venue.sections.find((s) => s.id === drag.sectionId);
    if (!section || section.outline.length < 3) return;

    const localPoint = this.toLocal(section, worldPoint);
    const insertAt = drag.sideIndex + 1;
    const finalOutline = [
      ...section.outline.slice(0, insertAt),
      localPoint,
      ...section.outline.slice(insertAt),
    ];

    this.history.execute({
      description: `Add section point`,
      execute: () => {
        const v = store.getState().venue;
        if (!v) return;
        store.getState().setVenue({
          ...v,
          sections: v.sections.map((s) =>
            s.id === section.id ? { ...s, outline: finalOutline } : s,
          ),
        });
      },
      undo: () => {
        const v = store.getState().venue;
        if (!v) return;
        store.getState().setVenue({
          ...v,
          sections: v.sections.map((s) =>
            s.id === section.id ? { ...s, outline: section.outline } : s,
          ),
        });
      },
    });
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

    if (this.dragMode.type === "resize-corner" || this.dragMode.type === "resize-side") {
      const drag = this.dragMode;
      const section = venue.sections.find((s) => s.id === drag.sectionId);
      if (!section) return;

      let finalOutline = drag.outline.map((p) => ({ ...p }));
      if (drag.type === "resize-corner" && drag.mergeTargetIndex !== null) {
        finalOutline = this.removeOutlineIndices(finalOutline, [drag.cornerIndex]);
      }
      if (drag.type === "resize-side" && drag.mergeCandidates.length > 0) {
        finalOutline = this.removeOutlineIndices(
          finalOutline,
          [...new Set(drag.mergeCandidates.map((candidate) => candidate.fromIndex))],
        );
      }

      const sectionWouldBeRemoved = finalOutline.length < 3;
      const unchanged =
        !sectionWouldBeRemoved &&
        this.areOutlinesEqual(section.outline, finalOutline);
      if (unchanged) return;

      const oldSection = section;
      this.history.execute({
        description: sectionWouldBeRemoved
          ? `Remove section "${oldSection.label}" after resize`
          : `Resize section "${oldSection.label}"`,
        execute: () => {
          const v = store.getState().venue;
          if (!v) return;
          if (sectionWouldBeRemoved) {
            store.getState().setVenue({
              ...v,
              sections: v.sections.filter((s) => s.id !== oldSection.id),
            });
            store.getState().clearSelection();
            return;
          }
          store.getState().setVenue({
            ...v,
            sections: v.sections.map((s) =>
              s.id === oldSection.id ? { ...s, outline: finalOutline } : s,
            ),
          });
        },
        undo: () => {
          const v = store.getState().venue;
          if (!v) return;
          const alreadyPresent = v.sections.some((s) => s.id === oldSection.id);
          if (sectionWouldBeRemoved) {
            store.getState().setVenue({
              ...v,
              sections: alreadyPresent ? v.sections : [...v.sections, oldSection],
            });
            return;
          }
          store.getState().setVenue({
            ...v,
            sections: v.sections.map((s) =>
              s.id === oldSection.id ? { ...s, outline: oldSection.outline } : s,
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
    this.resizeTargetSectionId = null;
  }

  getSectionDragPreview(
    venue: { sections: Array<{ id: string; position: Vec2; rotation: number; outline: Vec2[] }> } | null,
  ): Vec2[] | null {
    const drag = this.dragMode;
    if (!venue) return null;
    if (drag.type === "section") {
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
    if (drag.type === "resize-corner" || drag.type === "resize-side") {
      const section = venue.sections.find((s) => s.id === drag.sectionId);
      if (!section || drag.outline.length < 3) return null;
      const c = Math.cos(section.rotation);
      const s = Math.sin(section.rotation);
      return drag.outline.map((p) => ({
        x: section.position.x + p.x * c - p.y * s,
        y: section.position.y + p.x * s + p.y * c,
      }));
    }
    return null;
  }

  getSectionResizeHandlesPreview(
    venue: { sections: Section[] } | null,
    selectedSeatIds: Set<string>,
  ): {
    corners: Vec2[];
    sideMidpoints: Vec2[];
    mergeHint: { position: Vec2; message: string } | null;
  } | null {
    if (!this.sectionResizeEnabled || !venue) return null;
    const section = this.getEditableSection(venue, selectedSeatIds);
    if (!section || section.outline.length < 3) return null;
    const activeOutline =
      (this.dragMode.type === "resize-corner" || this.dragMode.type === "resize-side") &&
      this.dragMode.sectionId === section.id
        ? this.dragMode.outline
        : section.outline;
    if (activeOutline.length < 3) return null;

    const corners = activeOutline.map((p) => this.toWorld(section, p));
    const sideMidpoints = activeOutline.map((p, i) => {
      const next = activeOutline[(i + 1) % activeOutline.length];
      return this.toWorld(section, {
        x: (p.x + next.x) * 0.5,
        y: (p.y + next.y) * 0.5,
      });
    });

    let mergeHint: { position: Vec2; message: string } | null = null;
    if (this.dragMode.type === "resize-corner" && this.dragMode.mergeTargetIndex !== null) {
      const a = corners[this.dragMode.cornerIndex];
      const b = corners[this.dragMode.mergeTargetIndex];
      mergeHint = {
        position: { x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 },
        message: activeOutline.length <= 3 ? "Release to remove section" : "Release to join corners",
      };
    }
    if (this.dragMode.type === "resize-side" && this.dragMode.mergeCandidates.length > 0) {
      const candidate = this.dragMode.mergeCandidates[0];
      const a = corners[candidate.fromIndex];
      const b = corners[candidate.toIndex];
      mergeHint = {
        position: { x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 },
        message: activeOutline.length <= 4 ? "Release may remove section" : "Release to join corners",
      };
    }

    return { corners, sideMidpoints, mergeHint };
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

  private getEditableSection(
    venue: { sections: Section[] },
    selectedSeatIds: Set<string>,
  ): Section | null {
    if (selectedSeatIds.size > 0) {
      let found: Section | null = null;
      for (const section of venue.sections) {
        let hasSelectedSeat = false;
        for (const row of section.rows) {
          for (const seat of row.seats) {
            if (selectedSeatIds.has(seat.id)) {
              hasSelectedSeat = true;
              break;
            }
          }
          if (hasSelectedSeat) break;
        }
        if (!hasSelectedSeat) continue;
        if (found && found.id !== section.id) {
          found = null;
          break;
        }
        found = section;
      }
      if (found) return found;
    }
    if (this.resizeTargetSectionId) {
      return venue.sections.find((section) => section.id === this.resizeTargetSectionId) ?? null;
    }
    return null;
  }

  private toLocal(section: Pick<Section, "position" | "rotation">, point: Vec2): Vec2 {
    const dx = point.x - section.position.x;
    const dy = point.y - section.position.y;
    const c = Math.cos(-section.rotation);
    const s = Math.sin(-section.rotation);
    return {
      x: dx * c - dy * s,
      y: dx * s + dy * c,
    };
  }

  private toWorld(section: Pick<Section, "position" | "rotation">, point: Vec2): Vec2 {
    const c = Math.cos(section.rotation);
    const s = Math.sin(section.rotation);
    return {
      x: section.position.x + point.x * c - point.y * s,
      y: section.position.y + point.x * s + point.y * c,
    };
  }

  private findCornerHandleIndex(outline: Vec2[], localPoint: Vec2, maxDistance: number): number {
    let bestIndex = -1;
    let bestDistance = maxDistance;
    for (let i = 0; i < outline.length; i++) {
      const d = Math.hypot(localPoint.x - outline[i].x, localPoint.y - outline[i].y);
      if (d <= bestDistance) {
        bestDistance = d;
        bestIndex = i;
      }
    }
    return bestIndex;
  }

  private findSideHandleIndex(outline: Vec2[], localPoint: Vec2, maxDistance: number): number {
    let bestIndex = -1;
    let bestDistance = maxDistance;
    for (let i = 0; i < outline.length; i++) {
      const next = outline[(i + 1) % outline.length];
      const mid = { x: (outline[i].x + next.x) * 0.5, y: (outline[i].y + next.y) * 0.5 };
      const d = Math.hypot(localPoint.x - mid.x, localPoint.y - mid.y);
      if (d <= bestDistance) {
        bestDistance = d;
        bestIndex = i;
      }
    }
    return bestIndex;
  }

  private findMergeTargetIndex(outline: Vec2[], fromIndex: number, threshold: number): number | null {
    let bestTarget: number | null = null;
    let bestDistance = threshold;
    const from = outline[fromIndex];
    for (let i = 0; i < outline.length; i++) {
      if (i === fromIndex) continue;
      const d = Math.hypot(from.x - outline[i].x, from.y - outline[i].y);
      if (d <= bestDistance) {
        bestDistance = d;
        bestTarget = i;
      }
    }
    return bestTarget;
  }

  private findMergeCandidates(
    outline: Vec2[],
    fromIndices: number[],
    threshold: number,
  ): Array<{ fromIndex: number; toIndex: number }> {
    const fromSet = new Set(fromIndices);
    const candidates: Array<{ fromIndex: number; toIndex: number }> = [];
    for (const fromIndex of fromIndices) {
      const from = outline[fromIndex];
      let bestTarget = -1;
      let bestDistance = threshold;
      for (let i = 0; i < outline.length; i++) {
        if (i === fromIndex || fromSet.has(i)) continue;
        const d = Math.hypot(from.x - outline[i].x, from.y - outline[i].y);
        if (d <= bestDistance) {
          bestDistance = d;
          bestTarget = i;
        }
      }
      if (bestTarget >= 0) {
        candidates.push({ fromIndex, toIndex: bestTarget });
      }
    }
    return candidates;
  }

  private removeOutlineIndices(outline: Vec2[], removeIndices: number[]): Vec2[] {
    const removeSet = new Set(removeIndices);
    return outline
      .filter((_, index) => !removeSet.has(index))
      .map((point) => ({ ...point }));
  }

  private areOutlinesEqual(a: Vec2[], b: Vec2[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i].x !== b[i].x || a[i].y !== b[i].y) return false;
    }
    return true;
  }

  private pickNearestSeatHit(
    hits: ReturnType<SpatialIndex["queryPoint"]>,
    point: Vec2,
  ): (ReturnType<SpatialIndex["queryPoint"]>[number] & { seatId: string }) | undefined {
    const seatHits = hits.filter((hit): hit is ReturnType<SpatialIndex["queryPoint"]>[number] & { seatId: string } =>
      hit.type === "seat" && typeof hit.seatId === "string",
    );
    if (seatHits.length === 0) return undefined;
    if (seatHits.length === 1) return seatHits[0];

    let best = seatHits[0];
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const hit of seatHits) {
      const centerX = (hit.minX + hit.maxX) * 0.5;
      const centerY = (hit.minY + hit.maxY) * 0.5;
      const d = Math.hypot(centerX - point.x, centerY - point.y);
      if (d < bestDistance) {
        bestDistance = d;
        best = hit;
      }
    }
    return best;
  }
}
