import { Graphics, type Texture, type Renderer } from "pixi.js";

export interface SeatTextureSet {
  available: Texture;
  held: Texture;
  sold: Texture;
  blocked: Texture;
  selected: Texture;
  hovered: Texture;
}

const STATUS_COLORS: Record<string, number> = {
  available: 0x4caf50,
  held: 0xff9800,
  sold: 0x9e9e9e,
  blocked: 0xf44336,
  selected: 0x2196f3,
  hovered: 0x64b5f6,
};

export function createSeatTextures(
  renderer: Renderer,
  radius = 7,
  categoryColor?: number,
  textureResolution?: number,
): SeatTextureSet {
  const result: Partial<SeatTextureSet> = {};
  const resolution = textureResolution ?? (4 * (typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1));

  for (const [status, color] of Object.entries(STATUS_COLORS)) {
    const g = new Graphics();
    const fillColor = status === "available" && categoryColor != null ? categoryColor : color;
    g.circle(radius + 4, radius + 4, radius);
    g.fill({ color: fillColor });

    if (status === "selected") {
      g.circle(radius + 4, radius + 4, radius + 2);
      g.stroke({ color: 0xffffff, width: 2 });
    }

    const texture = renderer.textureGenerator.generateTexture({
      target: g,
      resolution,
      antialias: true,
    });
    g.destroy();

    result[status as keyof SeatTextureSet] = texture;
  }

  return result as SeatTextureSet;
}

export function destroySeatTextures(textures: SeatTextureSet): void {
  for (const tex of Object.values(textures)) {
    tex.destroy(true);
  }
}
