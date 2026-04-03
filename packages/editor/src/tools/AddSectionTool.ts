import type { Viewport } from "@nex125/seatmap-core";
import { generateId } from "@nex125/seatmap-core";
import type { CommandHistory, Section, SectionKind, Vec2 } from "@nex125/seatmap-core";
import type { SeatmapStore } from "@nex125/seatmap-react";
import { BaseTool, type ToolPointerEvent } from "./BaseTool";

const CLOSE_THRESHOLD = 15;

export type SectionCreationMode = "rectangle" | "polygon";

export class AddSectionTool extends BaseTool {
  readonly name = "add-section";
  readonly cursor = "crosshair";

  mode: SectionCreationMode = "rectangle";
  sectionKind: SectionKind = "section";
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

  setMode(mode: SectionCreationMode): void {
    this.mode = mode;
    this.points = [];
    this.notifyChange();
  }

  setSectionKind(sectionKind: SectionKind): void {
    if (this.sectionKind === sectionKind) return;
    this.sectionKind = sectionKind;
    this.points = [];
    this.notifyChange();
  }

  onPointerDown(e: ToolPointerEvent, _viewport: Viewport, store: SeatmapStore): void {
    if (this.mode === "rectangle") {
      if (this.points.length === 0) {
        this.points = [{ x: e.worldX, y: e.worldY }];
        this.notifyChange();
        return;
      }

      const rectPoints = this.rectangleFromDiagonal(this.points[0], { x: e.worldX, y: e.worldY });
      this.finishSection(rectPoints, store);
      this.points = [];
      this.notifyChange();
      return;
    }

    // If 3+ points and click is near the first point, close the polygon
    if (this.points.length >= 3) {
      const first = this.points[0];
      const dist = Math.hypot(e.worldX - first.x, e.worldY - first.y);
      if (dist < CLOSE_THRESHOLD) {
        this.finishSection(this.points, store);
        this.points = [];
        this.notifyChange();
        return;
      }
    }

    this.points.push({ x: e.worldX, y: e.worldY });
    this.notifyChange();
  }

  onPointerMove(e: ToolPointerEvent): void {
    if (this.mode === "rectangle") {
      if (this.points.length !== 1) return;
      const preview = this.rectangleFromDiagonal(this.points[0], { x: e.worldX, y: e.worldY });
      this.onPointsChange?.(preview, false);
      return;
    }

    if (this.points.length === 0) return;
    const closeable =
      this.points.length >= 3 &&
      Math.hypot(e.worldX - this.points[0].x, e.worldY - this.points[0].y) < CLOSE_THRESHOLD;
    this.onPointsChange?.(this.points, closeable);
  }

  private finishSection(points: Vec2[], store: SeatmapStore): void {
    if (points.length < 3) {
      return;
    }

    // Ignore tiny sections created by accidental clicks.
    let area = 0;
    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      area += a.x * b.y - b.x * a.y;
    }
    if (Math.abs(area) < 1) return;

    // Compute centroid
    let cx = 0, cy = 0;
    for (const p of points) { cx += p.x; cy += p.y; }
    cx /= points.length;
    cy /= points.length;

    const outline: Vec2[] = points.map((p) => ({
      x: p.x - cx,
      y: p.y - cy,
    }));

    const newSection: Section = {
      id: generateId(),
      label:
        this.sectionKind === "stage"
          ? "Stage"
          : `Section ${Date.now().toString(36).slice(-3).toUpperCase()}`,
      kind: this.sectionKind,
      position: { x: cx, y: cy },
      rotation: 0,
      categoryId: this.sectionKind === "stage" ? "" : this.categoryId,
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

  }

  private rectangleFromDiagonal(a: Vec2, b: Vec2): Vec2[] {
    return [
      { x: a.x, y: a.y },
      { x: b.x, y: a.y },
      { x: b.x, y: b.y },
      { x: a.x, y: b.y },
    ];
  }

  private notifyChange(): void {
    this.onPointsChange?.(this.points, false);
  }

  onDeactivate(): void {
    this.points = [];
    this.notifyChange();
  }
}
