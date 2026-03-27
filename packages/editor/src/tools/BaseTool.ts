import type { Viewport } from "@nex125/seatmap-core";
import type { SeatmapStore } from "@nex125/seatmap-react";

export interface ToolPointerEvent {
  worldX: number;
  worldY: number;
  screenX: number;
  screenY: number;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  button: number;
}

export abstract class BaseTool {
  abstract readonly name: string;
  abstract readonly cursor: string;

  onPointerDown(_e: ToolPointerEvent, _viewport: Viewport, _store: SeatmapStore): void {}
  onPointerMove(_e: ToolPointerEvent, _viewport: Viewport, _store: SeatmapStore): void {}
  onPointerUp(_e: ToolPointerEvent, _viewport: Viewport, _store: SeatmapStore): void {}
  onActivate(_viewport: Viewport, _store: SeatmapStore): void {}
  onDeactivate(): void {}
}
