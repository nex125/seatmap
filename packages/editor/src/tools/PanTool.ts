import type { Viewport } from "@nex125/seatmap-core";
import { BaseTool, type ToolPointerEvent } from "./BaseTool";

export class PanTool extends BaseTool {
  readonly name = "pan";
  readonly cursor = "grab";

  private isPanning = false;
  private lastX = 0;
  private lastY = 0;
  private panVelocity = { x: 0, y: 0 };
  private lastPanSampleTime = 0;
  private inertiaRaf = 0;
  private inertiaLastTime = 0;
  private panInertiaJelly = 55;
  private panInertiaCarry: number | undefined;
  private panInertiaFriction: number | undefined;
  private panInertiaMinSpeed: number | undefined;
  private static readonly DEFAULT_PAN_VELOCITY_BLEND = 0.3;
  private static readonly DEFAULT_PAN_STOP_DELTA = 0.3;
  private static readonly DEFAULT_PAN_RELEASE_IDLE_MS = 90;
  private panVelocityBlend = PanTool.DEFAULT_PAN_VELOCITY_BLEND;
  private panStopDelta = PanTool.DEFAULT_PAN_STOP_DELTA;
  private panReleaseIdleMs = PanTool.DEFAULT_PAN_RELEASE_IDLE_MS;

  setInertiaOptions(options: {
    panInertiaJelly?: number;
    panInertiaCarry?: number;
    panInertiaFriction?: number;
    panInertiaMinSpeed?: number;
    panVelocityBlend?: number;
    panStopDelta?: number;
    panReleaseIdleMs?: number;
  }): void {
    this.panInertiaJelly = options.panInertiaJelly ?? this.panInertiaJelly;
    this.panInertiaCarry = options.panInertiaCarry;
    this.panInertiaFriction = options.panInertiaFriction;
    this.panInertiaMinSpeed = options.panInertiaMinSpeed;
    this.panVelocityBlend = options.panVelocityBlend !== undefined
      ? Math.max(0.05, Math.min(0.95, options.panVelocityBlend))
      : PanTool.DEFAULT_PAN_VELOCITY_BLEND;
    this.panStopDelta = options.panStopDelta !== undefined
      ? Math.max(0, Math.min(4, options.panStopDelta))
      : PanTool.DEFAULT_PAN_STOP_DELTA;
    this.panReleaseIdleMs = options.panReleaseIdleMs !== undefined
      ? Math.max(0, Math.min(400, options.panReleaseIdleMs))
      : PanTool.DEFAULT_PAN_RELEASE_IDLE_MS;
  }

  private stopPanInertia(): void {
    if (this.inertiaRaf) {
      cancelAnimationFrame(this.inertiaRaf);
      this.inertiaRaf = 0;
    }
  }

  private startPanInertia(viewport: Viewport): void {
    this.stopPanInertia();
    const jelly = Math.max(0, Math.min(100, this.panInertiaJelly)) / 100;
    const carry = this.panInertiaCarry !== undefined
      ? Math.max(0, Math.min(0.98, this.panInertiaCarry))
      : 0.58 + jelly * 0.28;
    const baseFriction = this.panInertiaFriction !== undefined
      ? Math.max(0.8, Math.min(0.995, this.panInertiaFriction))
      : 0.88 + jelly * 0.08;
    const minSpeed = this.panInertiaMinSpeed !== undefined
      ? Math.max(0.001, Math.min(0.05, this.panInertiaMinSpeed))
      : 0.012 - jelly * 0.004;
    let velocity = {
      x: this.panVelocity.x * carry,
      y: this.panVelocity.y * carry,
    };
    if (Math.hypot(velocity.x, velocity.y) < minSpeed) return;

    this.inertiaLastTime = performance.now();
    const tick = () => {
      const now = performance.now();
      const dt = Math.min(32, Math.max(8, now - this.inertiaLastTime));
      this.inertiaLastTime = now;

      const decay = Math.pow(baseFriction, dt / 16.67);
      velocity = { x: velocity.x * decay, y: velocity.y * decay };
      if (Math.hypot(velocity.x, velocity.y) < minSpeed) {
        this.inertiaRaf = 0;
        return;
      }

      viewport.pan(velocity.x * dt, velocity.y * dt);
      this.inertiaRaf = requestAnimationFrame(tick);
    };

    this.inertiaRaf = requestAnimationFrame(tick);
  }

  onPointerDown(e: ToolPointerEvent): void {
    this.stopPanInertia();
    this.isPanning = true;
    this.lastX = e.screenX;
    this.lastY = e.screenY;
    this.panVelocity = { x: 0, y: 0 };
    this.lastPanSampleTime = performance.now();
  }

  onPointerMove(e: ToolPointerEvent, viewport: Viewport): void {
    if (!this.isPanning) return;
    const dx = e.screenX - this.lastX;
    const dy = e.screenY - this.lastY;
    this.lastX = e.screenX;
    this.lastY = e.screenY;
    const now = performance.now();
    const dt = Math.max(1, now - this.lastPanSampleTime);
    this.lastPanSampleTime = now;
    const nextVelocity = { x: dx / dt, y: dy / dt };
    const isNearlyStopped = Math.hypot(dx, dy) < this.panStopDelta;
    this.panVelocity = isNearlyStopped
      ? { x: this.panVelocity.x * 0.35, y: this.panVelocity.y * 0.35 }
      : {
        x: this.panVelocity.x * (1 - this.panVelocityBlend) + nextVelocity.x * this.panVelocityBlend,
        y: this.panVelocity.y * (1 - this.panVelocityBlend) + nextVelocity.y * this.panVelocityBlend,
      };
    viewport.pan(dx, dy);
  }

  onPointerUp(_e: ToolPointerEvent, viewport: Viewport): void {
    if (this.isPanning) {
      const timeSinceLastSample = performance.now() - this.lastPanSampleTime;
      if (timeSinceLastSample > this.panReleaseIdleMs || Math.hypot(this.panVelocity.x, this.panVelocity.y) < 0.01) {
        this.panVelocity = { x: 0, y: 0 };
      }
      this.startPanInertia(viewport);
    }
    this.isPanning = false;
  }

  onDeactivate(): void {
    this.isPanning = false;
    this.stopPanInertia();
  }
}
