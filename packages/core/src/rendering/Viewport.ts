import type { AABB, Vec2 } from "../models/types";

export interface ViewportState {
  x: number;
  y: number;
  zoom: number;
}

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 4;

export class Viewport {
  x = 0;
  y = 0;
  zoom = 1;
  screenWidth = 0;
  screenHeight = 0;

  private listeners = new Set<() => void>();

  setScreenSize(width: number, height: number): void {
    this.screenWidth = width;
    this.screenHeight = height;
    this.notify();
  }

  pan(dx: number, dy: number): void {
    this.x += dx / this.zoom;
    this.y += dy / this.zoom;
    this.notify();
  }

  zoomAt(screenPoint: Vec2, factor: number): void {
    const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.zoom * factor));

    // 1) World coordinate currently under the cursor
    const wx = screenPoint.x / this.zoom - this.x;
    const wy = screenPoint.y / this.zoom - this.y;

    // 2) Solve for the offset that keeps that world point at the same screen position
    //    screenPoint = (world + offset) * newZoom  →  offset = screenPoint / newZoom - world
    this.x = screenPoint.x / newZoom - wx;
    this.y = screenPoint.y / newZoom - wy;
    this.zoom = newZoom;
    this.notify();
  }

  setZoom(zoom: number): void {
    this.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
    this.notify();
  }

  fitBounds(aabb: AABB, padding = 40): void {
    const contentW = aabb.maxX - aabb.minX;
    const contentH = aabb.maxY - aabb.minY;
    if (contentW <= 0 || contentH <= 0) return;

    const scaleX = (this.screenWidth - padding * 2) / contentW;
    const scaleY = (this.screenHeight - padding * 2) / contentH;
    this.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min(scaleX, scaleY)));

    this.x = -(aabb.minX + contentW / 2) + this.screenWidth / (2 * this.zoom);
    this.y = -(aabb.minY + contentH / 2) + this.screenHeight / (2 * this.zoom);
    this.notify();
  }

  screenToWorld(screenX: number, screenY: number): Vec2 {
    return {
      x: screenX / this.zoom - this.x,
      y: screenY / this.zoom - this.y,
    };
  }

  worldToScreen(worldX: number, worldY: number): Vec2 {
    return {
      x: (worldX + this.x) * this.zoom,
      y: (worldY + this.y) * this.zoom,
    };
  }

  getVisibleAABB(): AABB {
    const topLeft = this.screenToWorld(0, 0);
    const bottomRight = this.screenToWorld(this.screenWidth, this.screenHeight);
    return {
      minX: topLeft.x,
      minY: topLeft.y,
      maxX: bottomRight.x,
      maxY: bottomRight.y,
    };
  }

  getState(): ViewportState {
    return { x: this.x, y: this.y, zoom: this.zoom };
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}
