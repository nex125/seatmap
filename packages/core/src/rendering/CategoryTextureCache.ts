import type { Renderer } from "pixi.js";
import type { SeatStatusDefinition } from "../models";
import {
  createSeatTextures,
  destroySeatTextures,
  type SeatTextureSet,
} from "./SpriteAtlas";

export class CategoryTextureCache {
  private cache = new Map<string, SeatTextureSet>();
  private defaultTextures: SeatTextureSet | null = null;

  create(
    renderer: Renderer,
    categories: { id: string; color: string }[],
    seatStatuses: SeatStatusDefinition[],
    seatRadius = 7,
  ): void {
    this.destroy();
    this.defaultTextures = createSeatTextures(renderer, seatStatuses, seatRadius);

    for (const cat of categories) {
      const color = parseInt(cat.color.replace("#", ""), 16);
      this.cache.set(cat.id, createSeatTextures(renderer, seatStatuses, seatRadius, color));
    }
  }

  get(categoryId: string): SeatTextureSet {
    return this.cache.get(categoryId) ?? this.defaultTextures!;
  }

  destroy(): void {
    for (const textures of this.cache.values()) {
      destroySeatTextures(textures);
    }
    if (this.defaultTextures) {
      destroySeatTextures(this.defaultTextures);
    }
    this.cache.clear();
    this.defaultTextures = null;
  }
}
