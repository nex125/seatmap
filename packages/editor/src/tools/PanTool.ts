import type { Viewport } from "@nex22/seatmap-core";
import { BaseTool, type ToolPointerEvent } from "./BaseTool";

export class PanTool extends BaseTool {
  readonly name = "pan";
  readonly cursor = "grab";

  private isPanning = false;
  private lastX = 0;
  private lastY = 0;

  onPointerDown(e: ToolPointerEvent): void {
    this.isPanning = true;
    this.lastX = e.screenX;
    this.lastY = e.screenY;
  }

  onPointerMove(e: ToolPointerEvent, viewport: Viewport): void {
    if (!this.isPanning) return;
    const dx = e.screenX - this.lastX;
    const dy = e.screenY - this.lastY;
    this.lastX = e.screenX;
    this.lastY = e.screenY;
    viewport.pan(dx, dy);
  }

  onPointerUp(): void {
    this.isPanning = false;
  }

  onDeactivate(): void {
    this.isPanning = false;
  }
}
