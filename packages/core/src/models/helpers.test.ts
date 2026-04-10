import { describe, expect, test } from "bun:test";
import {
  AVAILABLE_STATUS_ID,
  clampToPolygon,
  isAreaSeatSection,
  normalizeVenue,
  pointInPolygon,
  sectionAABB,
} from "./helpers";
import type { Section, Venue } from "./types";

function makeSection(partial: Partial<Section> = {}): Section {
  return {
    id: "sec-1",
    label: "Section A",
    kind: "section",
    position: { x: 100, y: 100 },
    rotation: 0,
    categoryId: "cat-1",
    rows: [],
    outline: [],
    ...partial,
  };
}

function makeVenue(partial: Partial<Venue> = {}): Venue {
  return {
    id: "venue-1",
    name: "Venue",
    bounds: { width: 1000, height: 800 },
    sections: [],
    gaAreas: [],
    tables: [],
    categories: [],
    seatStatuses: [],
    ...partial,
  };
}

describe("helpers", () => {
  test("normalizes legacy statuses and fallback values", () => {
    const venue = makeVenue({
      categories: [
        {
          id: "cat-1",
          name: "Cat",
          color: "#fff",
          backendPrice: Number.NaN,
          overriddenPrice: Number.NaN,
          isPriceOverridden: true,
        },
      ],
      seatStatuses: [
        { id: "available", name: "Available", color: "#4caf50" },
        { id: "locked", name: "Locked", color: "#f44336" },
      ],
      sections: [
        makeSection({
          kind: "stage",
          categoryId: "must-be-cleared",
          rows: [
            {
              id: "row-1",
              label: "A",
              seats: [
                { id: "s1", label: "1", position: { x: 0, y: 0 }, status: "held", categoryId: "cat-1" },
                { id: "s2", label: "2", position: { x: 20, y: 0 }, status: "unknown", categoryId: "cat-1" },
              ],
            },
          ],
        }),
      ],
      tables: [
        {
          id: "t1",
          label: "Table",
          position: { x: 0, y: 0 },
          shape: "round",
          categoryId: "cat-1",
          seats: [{ id: "ts1", label: "1", position: { x: 0, y: 0 }, status: "sold", categoryId: "cat-1" }],
        },
      ],
    });

    const normalized = normalizeVenue(venue);
    const stage = normalized.sections[0]!;

    expect(stage.categoryId).toBe("");
    expect(stage.rows[0]!.seats[0]!.status).toBe("locked");
    expect(stage.rows[0]!.seats[1]!.status).toBe(AVAILABLE_STATUS_ID);
    expect(normalized.tables[0]!.seats[0]!.status).toBe("available");
    expect(normalized.categories[0]!.backendPrice).toBeUndefined();
    expect(normalized.categories[0]!.isPriceOverridden).toBe(false);
  });

  test("detects area-seat sections for dancefloor and legacy polygons", () => {
    const dancefloor = makeSection({
      kind: "dancefloor",
      outline: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
      ],
      rows: [{ id: "r", label: "DF", seats: [{ id: "s", label: "DF", position: { x: 0, y: 0 }, status: "available", categoryId: "cat-1" }] }],
    });
    const legacySingleSeat = makeSection({
      outline: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
      ],
      rows: [{ id: "r", label: "A", seats: [{ id: "s", label: "1", position: { x: 0, y: 0 }, status: "available", categoryId: "cat-1" }] }],
    });
    const stage = makeSection({ kind: "stage", outline: legacySingleSeat.outline, rows: legacySingleSeat.rows });

    expect(isAreaSeatSection(dancefloor)).toBe(true);
    expect(isAreaSeatSection(legacySingleSeat)).toBe(true);
    expect(isAreaSeatSection(stage)).toBe(false);
  });

  test("clamps outside point to polygon boundary", () => {
    const square = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    const outside = { x: 150, y: 50 };
    const clamped = clampToPolygon(outside, square, 0);

    expect(pointInPolygon({ x: 50, y: 50 }, square)).toBe(true);
    expect(pointInPolygon(outside, square)).toBe(false);
    expect(clamped.x).toBe(100);
    expect(clamped.y).toBe(50);
  });

  test("includes outline and seat bounds in section AABB", () => {
    const section = makeSection({
      position: { x: 10, y: 20 },
      outline: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 50 },
      ],
      rows: [{ id: "row", label: "A", seats: [{ id: "s1", label: "1", position: { x: 120, y: 40 }, status: "available", categoryId: "cat-1" }] }],
    });

    const box = sectionAABB(section);
    expect(box.minX).toBe(0);
    expect(box.minY).toBe(10);
    expect(box.maxX).toBe(140);
    expect(box.maxY).toBe(80);
  });
});
