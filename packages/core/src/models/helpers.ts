import type { AABB, Section, Seat, Vec2, Venue } from "./types";

export function seatWorldPosition(section: Section, seat: Seat): Vec2 {
  const cos = Math.cos(section.rotation);
  const sin = Math.sin(section.rotation);
  return {
    x: section.position.x + seat.position.x * cos - seat.position.y * sin,
    y: section.position.y + seat.position.x * sin + seat.position.y * cos,
  };
}

export function sectionAABB(section: Section): AABB {
  const allPoints: Vec2[] = [];

  if (section.outline.length > 0) {
    const cos = Math.cos(section.rotation);
    const sin = Math.sin(section.rotation);
    for (const p of section.outline) {
      allPoints.push({
        x: section.position.x + p.x * cos - p.y * sin,
        y: section.position.y + p.x * sin + p.y * cos,
      });
    }
  }

  const allSeats = section.rows.flatMap((r) => r.seats);
  for (const seat of allSeats) {
    allPoints.push(seatWorldPosition(section, seat));
  }

  if (allPoints.length === 0) {
    return {
      minX: section.position.x,
      minY: section.position.y,
      maxX: section.position.x,
      maxY: section.position.y,
    };
  }

  const pad = 10;
  return {
    minX: Math.min(...allPoints.map((p) => p.x)) - pad,
    minY: Math.min(...allPoints.map((p) => p.y)) - pad,
    maxX: Math.max(...allPoints.map((p) => p.x)) + pad,
    maxY: Math.max(...allPoints.map((p) => p.y)) + pad,
  };
}

export function venueAABB(venue: Venue): AABB {
  if (venue.sections.length === 0) {
    return { minX: 0, minY: 0, maxX: venue.bounds.width, maxY: venue.bounds.height };
  }
  const boxes = venue.sections.map(sectionAABB);
  return {
    minX: Math.min(...boxes.map((b) => b.minX)),
    minY: Math.min(...boxes.map((b) => b.minY)),
    maxX: Math.max(...boxes.map((b) => b.maxX)),
    maxY: Math.max(...boxes.map((b) => b.maxY)),
  };
}

/** Ray-casting point-in-polygon test. Works with any simple polygon. */
export function pointInPolygon(point: Vec2, polygon: Vec2[]): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    if ((yi > point.y) !== (yj > point.y) &&
        point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Clamp a point to the nearest position inside a polygon (with margin). */
export function clampToPolygon(point: Vec2, polygon: Vec2[], margin = 5): Vec2 {
  if (polygon.length < 3 || pointInPolygon(point, polygon)) return point;

  // Find the closest point on any polygon edge
  let bestX = point.x, bestY = point.y, bestDist = Infinity;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const ax = polygon[j].x, ay = polygon[j].y;
    const bx = polygon[i].x, by = polygon[i].y;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) continue;
    const t = Math.max(0, Math.min(1, ((point.x - ax) * dx + (point.y - ay) * dy) / len2));
    const cx = ax + t * dx - margin * dy / Math.sqrt(len2);
    const cy = ay + t * dy + margin * dx / Math.sqrt(len2);
    const d = Math.hypot(point.x - cx, point.y - cy);
    if (d < bestDist) { bestDist = d; bestX = cx; bestY = cy; }
  }

  // Verify the clamped point is inside; if not just project onto edge without margin
  if (!pointInPolygon({ x: bestX, y: bestY }, polygon)) {
    bestDist = Infinity;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const ax = polygon[j].x, ay = polygon[j].y;
      const bx = polygon[i].x, by = polygon[i].y;
      const dx = bx - ax, dy = by - ay;
      const len2 = dx * dx + dy * dy;
      if (len2 === 0) continue;
      const t = Math.max(0, Math.min(1, ((point.x - ax) * dx + (point.y - ay) * dy) / len2));
      const cx = ax + t * dx, cy = ay + t * dy;
      const d = Math.hypot(point.x - cx, point.y - cy);
      if (d < bestDist) { bestDist = d; bestX = cx; bestY = cy; }
    }
  }

  return { x: bestX, y: bestY };
}

let _nextId = 1;
export function generateId(prefix = ""): string {
  return `${prefix}${prefix ? "-" : ""}${Date.now().toString(36)}-${(_nextId++).toString(36)}`;
}
