import { Graphics, type Texture, type Renderer } from "pixi.js";
import type { SeatStatusDefinition } from "../models";

export interface SeatTextureSet {
  [statusId: string]: Texture;
  selected: Texture;
  hovered: Texture;
}

const UI_TEXTURE_COLORS: Record<string, number> = {
  selected: 0x2196f3,
  hovered: 0x64b5f6,
};

function parseHexColor(color: string): number {
  return parseInt(color.replace("#", ""), 16);
}

export function createSeatTextures(
  renderer: Renderer,
  seatStatuses: SeatStatusDefinition[],
  radius = 7,
  categoryColor?: number,
  textureResolution?: number,
): SeatTextureSet {
  const result: Partial<SeatTextureSet> = {};
  const resolution = textureResolution ?? (4 * (typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1));

  for (const status of seatStatuses) {
    const g = new Graphics();
    const fillColor = status.id === "available" && categoryColor != null
      ? categoryColor
      : parseHexColor(status.color);
    g.circle(radius + 4, radius + 4, radius);
    g.fill({ color: fillColor });

    const texture = renderer.textureGenerator.generateTexture({
      target: g,
      resolution,
      antialias: true,
    });
    g.destroy();

    result[status.id] = texture;
  }

  for (const [statusId, color] of Object.entries(UI_TEXTURE_COLORS)) {
    const g = new Graphics();
    g.circle(radius + 4, radius + 4, radius);
    g.fill({ color });

    if (statusId === "selected") {
      g.circle(radius + 4, radius + 4, radius + 2);
      g.stroke({ color: 0xffffff, width: 2 });
    }

    const texture = renderer.textureGenerator.generateTexture({
      target: g,
      resolution,
      antialias: true,
    });
    g.destroy();

    result[statusId] = texture;
  }

  return result as SeatTextureSet;
}

export function destroySeatTextures(textures: SeatTextureSet): void {
  for (const tex of Object.values(textures)) {
    tex.destroy(true);
  }
}
