import RBush from "rbush";
import type { AABB, Section, Vec2 } from "../models/types";
import { isAreaSeatSection, seatWorldPosition, sectionAABB } from "../models/helpers";

export interface SpatialItem extends AABB {
  type: "section" | "seat";
  sectionId: string;
  seatId?: string;
}

export class SpatialIndex {
  private tree = new RBush<SpatialItem>();
  private items: SpatialItem[] = [];

  buildFromSections(sections: Section[]): void {
    this.items = [];

    for (const section of sections) {
      const box = sectionAABB(section);
      this.items.push({
        ...box,
        type: "section",
        sectionId: section.id,
      });

      for (const row of section.rows) {
        for (const seat of row.seats) {
          const wp = seatWorldPosition(section, seat);
          const dancefloorBounds =
            isAreaSeatSection(section)
              ? getSectionOutlineWorldBounds(section)
              : null;
          const r = 8;
          this.items.push({
            minX: dancefloorBounds?.minX ?? wp.x - r,
            minY: dancefloorBounds?.minY ?? wp.y - r,
            maxX: dancefloorBounds?.maxX ?? wp.x + r,
            maxY: dancefloorBounds?.maxY ?? wp.y + r,
            type: "seat",
            sectionId: section.id,
            seatId: seat.id,
          });
        }
      }
    }

    this.tree.clear();
    this.tree.load(this.items);
  }

  queryViewport(viewport: AABB): SpatialItem[] {
    return this.tree.search(viewport);
  }

  queryPoint(point: Vec2, radius = 8): SpatialItem[] {
    return this.tree.search({
      minX: point.x - radius,
      minY: point.y - radius,
      maxX: point.x + radius,
      maxY: point.y + radius,
    });
  }

  queryRect(rect: AABB): SpatialItem[] {
    return this.tree.search(rect);
  }
}

function getSectionOutlineWorldBounds(section: Section): AABB | null {
  if (section.outline.length < 3) return null;
  const c = Math.cos(section.rotation);
  const s = Math.sin(section.rotation);
  const worldPoints = section.outline.map((point) => ({
    x: section.position.x + point.x * c - point.y * s,
    y: section.position.y + point.x * s + point.y * c,
  }));
  return {
    minX: Math.min(...worldPoints.map((point) => point.x)),
    minY: Math.min(...worldPoints.map((point) => point.y)),
    maxX: Math.max(...worldPoints.map((point) => point.x)),
    maxY: Math.max(...worldPoints.map((point) => point.y)),
  };
}
