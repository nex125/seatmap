import RBush from "rbush";
import type { AABB, Section, Vec2 } from "../models/types";
import { seatWorldPosition, sectionAABB } from "../models/helpers";

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
          const r = 8;
          this.items.push({
            minX: wp.x - r,
            minY: wp.y - r,
            maxX: wp.x + r,
            maxY: wp.y + r,
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
