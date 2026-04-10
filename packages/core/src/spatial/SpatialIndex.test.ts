import { describe, expect, test } from "bun:test";
import { SpatialIndex } from "./SpatialIndex";
import type { Section } from "../models/types";

function makeSection(partial: Partial<Section> = {}): Section {
  return {
    id: "section-1",
    label: "Section",
    kind: "section",
    position: { x: 0, y: 0 },
    rotation: 0,
    categoryId: "cat-1",
    rows: [],
    outline: [],
    ...partial,
  };
}

describe("SpatialIndex", () => {
  test("indexes sections and seat hitboxes", () => {
    const section = makeSection({
      position: { x: 100, y: 100 },
      rows: [
        {
          id: "row-1",
          label: "A",
          seats: [{ id: "seat-1", label: "1", position: { x: 20, y: 0 }, status: "available", categoryId: "cat-1" }],
        },
      ],
    });
    const index = new SpatialIndex();
    index.buildFromSections([section]);

    const hits = index.queryPoint({ x: 120, y: 100 }, 10);
    expect(hits.some((hit) => hit.type === "section" && hit.sectionId === "section-1")).toBe(true);
    expect(hits.some((hit) => hit.type === "seat" && hit.seatId === "seat-1")).toBe(true);
  });

  test("uses full outline bounds for dancefloor-area seats", () => {
    const dancefloor = makeSection({
      id: "dance-1",
      kind: "dancefloor",
      position: { x: 200, y: 200 },
      outline: [
        { x: -60, y: -30 },
        { x: 60, y: -30 },
        { x: 60, y: 30 },
        { x: -60, y: 30 },
      ],
      rows: [
        {
          id: "df-row",
          label: "DF",
          seats: [{ id: "df-seat", label: "DF", position: { x: 0, y: 0 }, status: "available", categoryId: "cat-1" }],
        },
      ],
    });
    const index = new SpatialIndex();
    index.buildFromSections([dancefloor]);

    const nearEdgeHits = index.queryPoint({ x: 255, y: 225 }, 1);
    expect(nearEdgeHits.some((hit) => hit.type === "seat" && hit.seatId === "df-seat")).toBe(true);
  });
});
