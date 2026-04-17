import { describe, expect, test } from "bun:test";
import { Viewport, type Venue } from "@nex125/seatmap-core";
import type { SeatmapStore } from "@nex125/seatmap-react";
import { AddRowTool } from "./AddRowTool";
import { AddSeatTool } from "./AddSeatTool";
import { AddSectionTool } from "./AddSectionTool";
import { PanTool } from "./PanTool";
import { SelectTool } from "./SelectTool";
import type { ToolPointerEvent } from "./BaseTool";
import { buildSectionOutlineToFitSeats, getSectionFitPadding } from "../utils/sectionFit";

type MinimalStoreState = {
  venue: Venue | null;
  selectedSeatIds: Set<string>;
  selectedSectionIds: Set<string>;
  selectedSectionId: string | null;
  setVenue: (venue: Venue) => void;
  setSelection: (seatIds: string[]) => void;
  selectSection: (sectionId: string | null) => void;
  toggleSeat: (seatId: string) => void;
  toggleSection: (sectionId: string) => void;
  clearSelection: () => void;
};

function makeStore(initialVenue: Venue): SeatmapStore {
  const state: MinimalStoreState = {
    venue: initialVenue,
    selectedSeatIds: new Set(),
    selectedSectionIds: new Set(),
    selectedSectionId: null,
    setVenue: (venue) => {
      state.venue = venue;
    },
    setSelection: (seatIds) => {
      state.selectedSeatIds = new Set(seatIds);
    },
    selectSection: (sectionId) => {
      state.selectedSectionId = sectionId;
      state.selectedSectionIds = sectionId ? new Set([sectionId]) : new Set();
    },
    toggleSeat: (seatId) => {
      const next = new Set(state.selectedSeatIds);
      if (next.has(seatId)) next.delete(seatId);
      else next.add(seatId);
      state.selectedSeatIds = next;
    },
    toggleSection: (sectionId) => {
      const next = new Set(state.selectedSectionIds);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      state.selectedSectionIds = next;
      state.selectedSectionId = next.values().next().value ?? null;
    },
    clearSelection: () => {
      state.selectedSeatIds = new Set();
      state.selectedSectionIds = new Set();
      state.selectedSectionId = null;
    },
  };
  return {
    getState: () => state,
  } as unknown as SeatmapStore;
}

function makeVenue(): Venue {
  return {
    id: "venue-1",
    name: "Venue",
    bounds: { width: 1200, height: 800 },
    sections: [],
    gaAreas: [],
    tables: [],
    categories: [{ id: "cat-1", name: "A", color: "#aaa" }],
    seatStatuses: [{ id: "available", name: "Available", color: "#4caf50" }],
  };
}

function pointer(worldX: number, worldY: number): ToolPointerEvent {
  return {
    worldX,
    worldY,
    screenX: worldX,
    screenY: worldY,
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    button: 0,
  };
}

function makeImmediateHistory() {
  return {
    execute: (command: { execute: () => void }) => command.execute(),
  } as const;
}

function withAnimationFrameStubs<T>(run: () => T): T {
  const globalObj = globalThis as typeof globalThis & {
    requestAnimationFrame?: (cb: FrameRequestCallback) => number;
    cancelAnimationFrame?: (id: number) => void;
  };
  const originalRaf = globalObj.requestAnimationFrame;
  const originalCancelRaf = globalObj.cancelAnimationFrame;
  globalObj.requestAnimationFrame = () => 1;
  globalObj.cancelAnimationFrame = () => {};
  try {
    return run();
  } finally {
    if (originalRaf) globalObj.requestAnimationFrame = originalRaf;
    else Reflect.deleteProperty(globalObj as Record<string, unknown>, "requestAnimationFrame");
    if (originalCancelRaf) globalObj.cancelAnimationFrame = originalCancelRaf;
    else Reflect.deleteProperty(globalObj as Record<string, unknown>, "cancelAnimationFrame");
  }
}

describe("editor tools behavior", () => {
  test("buildSectionOutlineToFitSeats shrinks section around seat bounds with padding", () => {
    const outline = buildSectionOutlineToFitSeats({
      rows: [
        {
          id: "row-1",
          label: "1",
          seats: [
            { id: "seat-1", label: "1", position: { x: 10, y: 20 }, status: "available", categoryId: "cat-1" },
            { id: "seat-2", label: "2", position: { x: 50, y: 20 }, status: "available", categoryId: "cat-1" },
          ],
        },
        {
          id: "row-2",
          label: "2",
          seats: [
            { id: "seat-3", label: "1", position: { x: 10, y: 60 }, status: "available", categoryId: "cat-1" },
          ],
        },
      ],
    });

    const padding = getSectionFitPadding();

    expect(outline).toEqual([
      { x: 10 - padding, y: 20 - padding },
      { x: 50 + padding, y: 20 - padding },
      { x: 50 + padding, y: 60 + padding },
      { x: 10 - padding, y: 60 + padding },
    ]);
  });

  test("AddSectionTool creates rectangle section from two clicks", () => {
    const history = makeImmediateHistory();
    const tool = new AddSectionTool(history as never, "cat-1");
    const store = makeStore(makeVenue());
    const viewport = new Viewport();

    tool.onPointerDown(pointer(100, 100), viewport, store);
    tool.onPointerDown(pointer(300, 200), viewport, store);

    const venue = store.getState().venue!;
    expect(venue.sections).toHaveLength(1);
    const section = venue.sections[0]!;
    expect(section.position).toEqual({ x: 200, y: 150 });
    expect(section.outline).toEqual([
      { x: -100, y: -50 },
      { x: 100, y: -50 },
      { x: 100, y: 50 },
      { x: -100, y: 50 },
    ]);
    expect(section.categoryId).toBe("cat-1");
  });

  test("AddSectionTool dancefloor creates the synthetic seat row", () => {
    const history = makeImmediateHistory();
    const tool = new AddSectionTool(history as never, "cat-1");
    const store = makeStore(makeVenue());

    tool.setSectionKind("dancefloor");
    tool.setMode("polygon");

    tool.onPointerDown(pointer(0, 0), new Viewport(), store);
    tool.onPointerDown(pointer(100, 0), new Viewport(), store);
    tool.onPointerDown(pointer(100, 100), new Viewport(), store);
    tool.onPointerDown(pointer(4, 4), new Viewport(), store);

    const venue = store.getState().venue!;
    expect(venue.sections).toHaveLength(1);
    const dancefloor = venue.sections[0]!;
    expect(dancefloor.kind).toBe("dancefloor");
    expect(dancefloor.rows).toHaveLength(1);
    expect(dancefloor.rows[0]!.label).toBe("DF");
    expect(dancefloor.rows[0]!.seats[0]!.label).toBe("Dancefloor");
  });

  test("AddSectionTool uses translated default labels", () => {
    const history = makeImmediateHistory();
    const tool = new AddSectionTool(history as never, "cat-1");
    const store = makeStore(makeVenue());

    tool.translate = (key, values) => {
      if (key === "seatmapEditor.defaults.stageLabel") return "Сцена";
      if (key === "seatmapEditor.defaults.dancefloorLabel") return "Танцпол";
      if (key === "seatmapEditor.defaults.dancefloorRowLabel") return "ТП";
      if (key === "seatmapEditor.defaults.sectionLabel") return `Секция ${values?.suffix ?? ""}`.trim();
      return key;
    };

    tool.setSectionKind("stage");
    tool.onPointerDown(pointer(0, 0), new Viewport(), store);
    tool.onPointerDown(pointer(100, 100), new Viewport(), store);

    tool.setSectionKind("dancefloor");
    tool.setMode("polygon");
    tool.onPointerDown(pointer(200, 0), new Viewport(), store);
    tool.onPointerDown(pointer(300, 0), new Viewport(), store);
    tool.onPointerDown(pointer(300, 100), new Viewport(), store);
    tool.onPointerDown(pointer(204, 4), new Viewport(), store);

    tool.setSectionKind("section");
    tool.setMode("rectangle");
    tool.onPointerDown(pointer(400, 0), new Viewport(), store);
    tool.onPointerDown(pointer(500, 100), new Viewport(), store);

    const venue = store.getState().venue!;
    expect(venue.sections[0]!.label).toBe("Сцена");
    expect(venue.sections[1]!.label).toBe("Танцпол");
    expect(venue.sections[1]!.rows[0]!.label).toBe("ТП");
    expect(venue.sections[1]!.rows[0]!.seats[0]!.label).toBe("Танцпол");
    expect(venue.sections[2]!.label).toMatch(/^Секция [A-Z0-9]{3}$/);
  });

  test("AddRowTool adds seats into a row for the target section", () => {
    const history = makeImmediateHistory();
    const sectionId = "section-1";
    const spatialIndex = {
      queryPoint: () => [{ type: "section", sectionId }],
    };
    const tool = new AddRowTool(history as never, spatialIndex as never);
    const venue = makeVenue();
    venue.sections = [
      {
        id: sectionId,
        label: "S1",
        kind: "section",
        position: { x: 0, y: 0 },
        rotation: 0,
        categoryId: "cat-1",
        rows: [],
        outline: [
          { x: -400, y: -200 },
          { x: 400, y: -200 },
          { x: 400, y: 200 },
          { x: -400, y: 200 },
        ],
      },
    ];
    const store = makeStore(venue);

    tool.onPointerDown(pointer(0, 0), new Viewport(), store);

    const updated = store.getState().venue!;
    expect(updated.sections[0]!.rows).toHaveLength(1);
    expect(updated.sections[0]!.rows[0]!.label).toBe("1");
    expect(updated.sections[0]!.rows[0]!.seats).toHaveLength(10);
  });

  test("AddRowTool preview angle follows section rotation and tool orientation", () => {
    const history = makeImmediateHistory();
    const sectionId = "section-2";
    const spatialIndex = {
      queryPoint: () => [{ type: "section", sectionId }],
    };
    const tool = new AddRowTool(history as never, spatialIndex as never);
    const venue = makeVenue();
    venue.sections = [
      {
        id: sectionId,
        label: "S2",
        kind: "section",
        position: { x: 0, y: 0 },
        rotation: Math.PI / 4,
        categoryId: "cat-1",
        rows: [],
        outline: [
          { x: -100, y: -100 },
          { x: 100, y: -100 },
          { x: 100, y: 100 },
        ],
      },
    ];

    const preview = tool.getPlacementPreview(10, 20, venue);
    expect(preview).not.toBeNull();
    expect(preview!.worldAngleRad).toBeCloseTo(-Math.PI / 4);
  });

  test("AddRowTool merges inserted rows onto existing row lines", () => {
    const history = makeImmediateHistory();
    const sectionId = "section-merge-rows";
    const spatialIndex = {
      queryPoint: () => [{ type: "section", sectionId }],
    };
    const tool = new AddRowTool(history as never, spatialIndex as never);
    tool.rowsCount = 2;
    const venue = makeVenue();
    venue.sections = [
      {
        id: sectionId,
        label: "S3",
        kind: "section",
        position: { x: 0, y: 0 },
        rotation: 0,
        categoryId: "cat-1",
        rows: [],
        outline: [
          { x: -600, y: -200 },
          { x: 600, y: -200 },
          { x: 600, y: 200 },
          { x: -600, y: 200 },
        ],
      },
    ];
    const store = makeStore(venue);

    // First insert creates two rows at y=0 and y=20.
    tool.onPointerDown(pointer(0, 0), new Viewport(), store);
    // Second insert on the right should extend the same two rows, not create new rows.
    tool.onPointerDown(pointer(220, 0), new Viewport(), store);

    const rows = store.getState().venue!.sections[0]!.rows;
    expect(rows).toHaveLength(2);
    expect(rows[0]!.label).toBe("1");
    expect(rows[1]!.label).toBe("2");
    expect(rows[0]!.seats).toHaveLength(20);
    expect(rows[1]!.seats).toHaveLength(20);
  });

  test("SelectTool click selects nearest seat and its section", () => {
    const history = makeImmediateHistory();
    const seatId = "seat-1";
    const sectionId = "section-1";
    const spatialIndex = {
      queryPoint: () => [
        {
          type: "seat",
          sectionId,
          seatId,
          minX: -5,
          minY: -5,
          maxX: 5,
          maxY: 5,
        },
        {
          type: "section",
          sectionId,
          minX: -100,
          minY: -100,
          maxX: 100,
          maxY: 100,
        },
      ],
      queryRect: () => [],
    };
    const tool = new SelectTool(spatialIndex as never, history as never);
    const venue = makeVenue();
    venue.sections = [
      {
        id: sectionId,
        label: "S1",
        kind: "section",
        position: { x: 0, y: 0 },
        rotation: 0,
        categoryId: "cat-1",
        rows: [
          {
            id: "row-1",
            label: "A",
            seats: [{ id: seatId, label: "1", position: { x: 0, y: 0 }, status: "available", categoryId: "cat-1" }],
          },
        ],
        outline: [
          { x: -100, y: -100 },
          { x: 100, y: -100 },
          { x: 100, y: 100 },
          { x: -100, y: 100 },
        ],
      },
    ];
    const store = makeStore(venue);
    const viewport = new Viewport();

    tool.onPointerDown(pointer(0, 0), viewport, store);
    tool.onPointerUp(pointer(0, 0), viewport, store);

    expect(store.getState().selectedSeatIds.has(seatId)).toBe(true);
    expect(store.getState().selectedSectionId).toBe(sectionId);
  });

  test("SelectTool click on dancefloor keeps section selection for label editing", () => {
    const history = makeImmediateHistory();
    const seatId = "dancefloor-seat-1";
    const sectionId = "dancefloor-1";
    const spatialIndex = {
      queryPoint: () => [
        {
          type: "seat",
          sectionId,
          seatId,
          minX: -5,
          minY: -5,
          maxX: 5,
          maxY: 5,
        },
        {
          type: "section",
          sectionId,
          minX: -100,
          minY: -100,
          maxX: 100,
          maxY: 100,
        },
      ],
      queryRect: () => [],
    };
    const tool = new SelectTool(spatialIndex as never, history as never);
    const venue = makeVenue();
    venue.sections = [
      {
        id: sectionId,
        label: "Dancefloor",
        kind: "dancefloor",
        position: { x: 0, y: 0 },
        rotation: 0,
        categoryId: "cat-1",
        rows: [
          {
            id: "row-df",
            label: "DF",
            seats: [{ id: seatId, label: "Dancefloor", position: { x: 0, y: 0 }, status: "available", categoryId: "cat-1" }],
          },
        ],
        outline: [
          { x: -100, y: -100 },
          { x: 100, y: -100 },
          { x: 100, y: 100 },
          { x: -100, y: 100 },
        ],
      },
    ];
    const store = makeStore(venue);
    const viewport = new Viewport();

    tool.onPointerDown(pointer(0, 0), viewport, store);
    tool.onPointerUp(pointer(0, 0), viewport, store);

    expect(store.getState().selectedSeatIds.size).toBe(0);
    expect(store.getState().selectedSectionId).toBe(sectionId);
  });

  test("SelectTool drag rectangle uses queryRect to select seats", () => {
    const history = makeImmediateHistory();
    const spatialIndex = {
      queryPoint: () => [],
      queryRect: () => [
        {
          type: "seat",
          sectionId: "section-1",
          seatId: "seat-1",
          minX: 0,
          minY: 0,
          maxX: 10,
          maxY: 10,
        },
      ],
    };
    const tool = new SelectTool(spatialIndex as never, history as never);
    const store = makeStore(makeVenue());
    const viewport = new Viewport();

    tool.onPointerDown(pointer(0, 0), viewport, store);
    tool.onPointerMove(pointer(40, 40), viewport, store);

    expect(store.getState().selectedSeatIds.has("seat-1")).toBe(true);
    expect(tool.selectionRect).toEqual({ x: 0, y: 0, width: 40, height: 40 });
  });

  test("SelectTool resize preview shows merge hint for corner and side drags", () => {
    const history = makeImmediateHistory();
    const sectionId = "section-merge";
    const spatialIndex = {
      queryPoint: () => [
        {
          type: "section",
          sectionId,
          minX: -100,
          minY: -100,
          maxX: 100,
          maxY: 100,
        },
      ],
      queryRect: () => [],
    };
    const tool = new SelectTool(spatialIndex as never, history as never);
    const venue = makeVenue();
    venue.sections = [
      {
        id: sectionId,
        label: "Mergeable",
        kind: "section",
        position: { x: 0, y: 0 },
        rotation: 0,
        categoryId: "cat-1",
        rows: [],
        outline: [
          { x: 0, y: 0 },
          { x: 40, y: 0 },
          { x: 40, y: 40 },
          { x: 0, y: 40 },
        ],
      },
    ];
    const store = makeStore(venue);
    const viewport = new Viewport();

    tool.setSectionResizeEnabled(true);

    // Corner drag near another corner should expose a merge hint.
    tool.onPointerDown(pointer(0, 0), viewport, store);
    tool.onPointerMove(pointer(2, 38), viewport, store);
    const cornerPreview = tool.getSectionResizeHandlesPreview(
      store.getState().venue,
      store.getState().selectedSeatIds,
      sectionId,
    );
    expect(cornerPreview).not.toBeNull();
    expect(cornerPreview!.mergeHint).not.toBeNull();
    expect(cornerPreview!.mergeHint!.message).toContain("Release");
    tool.onPointerUp(pointer(2, 38), viewport, store);

    // Side drag case in a fresh editor state.
    const sideTool = new SelectTool(spatialIndex as never, history as never);
    const sideStore = makeStore(makeVenue());
    sideStore.getState().setVenue({
      ...sideStore.getState().venue!,
      sections: [
        {
          id: sectionId,
          label: "Mergeable",
          kind: "section",
          position: { x: 0, y: 0 },
          rotation: 0,
          categoryId: "cat-1",
          rows: [],
          outline: [
            { x: 0, y: 0 },
            { x: 40, y: 0 },
            { x: 40, y: 40 },
            { x: 0, y: 40 },
          ],
        },
      ],
    });
    sideTool.setSectionResizeEnabled(true);
    sideTool.onPointerDown(pointer(20, 0), viewport, sideStore);
    sideTool.onPointerMove(pointer(20, 39), viewport, sideStore);
    const sidePreview = sideTool.getSectionResizeHandlesPreview(
      sideStore.getState().venue,
      sideStore.getState().selectedSeatIds,
      sectionId,
    );
    expect(sidePreview).not.toBeNull();
    expect(sidePreview!.mergeHint).not.toBeNull();
    expect(sidePreview!.mergeHint!.message).toContain("Release");
  });

  test("SelectTool resize mode allows dragging section body", () => {
    const history = makeImmediateHistory();
    const sectionId = "section-resize-drag";
    const spatialIndex = {
      queryPoint: () => [
        {
          type: "section",
          sectionId,
          minX: -100,
          minY: -100,
          maxX: 100,
          maxY: 100,
        },
      ],
      queryRect: () => [],
    };
    const tool = new SelectTool(spatialIndex as never, history as never);
    const venue = makeVenue();
    venue.sections = [
      {
        id: sectionId,
        label: "Movable",
        kind: "section",
        position: { x: 0, y: 0 },
        rotation: 0,
        categoryId: "cat-1",
        rows: [],
        outline: [
          { x: -40, y: -20 },
          { x: 40, y: -20 },
          { x: 40, y: 20 },
          { x: -40, y: 20 },
        ],
      },
    ];
    const store = makeStore(venue);
    const viewport = new Viewport();

    tool.setSectionResizeEnabled(true);
    tool.onPointerDown(pointer(0, 0), viewport, store);
    tool.onPointerMove(pointer(30, 10), viewport, store);
    tool.onPointerUp(pointer(30, 10), viewport, store);

    expect(store.getState().venue!.sections[0]!.position).toEqual({ x: 30, y: 10 });
  });

  test("AddSeatTool adds seat to nearest matching row and avoids overlap", () => {
    const history = makeImmediateHistory();
    const sectionId = "section-add-seat";
    const spatialIndex = {
      queryPoint: () => [{ type: "section", sectionId }],
    };
    const tool = new AddSeatTool(history as never, spatialIndex as never);
    const venue = makeVenue();
    venue.sections = [
      {
        id: sectionId,
        label: "Regular",
        kind: "section",
        position: { x: 0, y: 0 },
        rotation: 0,
        categoryId: "cat-1",
        rows: [
          {
            id: "row-a",
            label: "A",
            seats: [{ id: "s1", label: "1", position: { x: 0, y: 0 }, status: "available", categoryId: "cat-1" }],
          },
        ],
        outline: [
          { x: -200, y: -100 },
          { x: 200, y: -100 },
          { x: 200, y: 100 },
          { x: -200, y: 100 },
        ],
      },
    ];
    const store = makeStore(venue);

    // Near existing row (y ~ 0), and colliding with x=0 seat so it should nudge.
    tool.onPointerDown(pointer(1, 1), new Viewport(), store);

    const updatedRow = store.getState().venue!.sections[0]!.rows[0]!;
    expect(updatedRow.seats).toHaveLength(2);
    const added = updatedRow.seats.find((seat) => seat.id !== "s1")!;
    expect(added.position.y).toBe(0);
    expect(added.position.x).toBe(20);
  });

  test("AddSeatTool creates a new row when click is far from existing rows", () => {
    const history = makeImmediateHistory();
    const sectionId = "section-new-row";
    const spatialIndex = {
      queryPoint: () => [{ type: "section", sectionId }],
    };
    const tool = new AddSeatTool(history as never, spatialIndex as never);
    const venue = makeVenue();
    venue.sections = [
      {
        id: sectionId,
        label: "Regular",
        kind: "section",
        position: { x: 0, y: 0 },
        rotation: 0,
        categoryId: "cat-1",
        rows: [
          {
            id: "row-a",
            label: "A",
            seats: [{ id: "s1", label: "1", position: { x: 0, y: 0 }, status: "available", categoryId: "cat-1" }],
          },
        ],
        outline: [
          { x: -200, y: -200 },
          { x: 200, y: -200 },
          { x: 200, y: 200 },
          { x: -200, y: 200 },
        ],
      },
    ];
    const store = makeStore(venue);

    // Y far enough to avoid reusing row A.
    tool.onPointerDown(pointer(0, 60), new Viewport(), store);

    const section = store.getState().venue!.sections[0]!;
    expect(section.rows).toHaveLength(2);
    expect(section.rows[1]!.label).toBe("2");
    expect(section.rows[1]!.seats).toHaveLength(1);
    expect(section.rows[1]!.seats[0]!.position).toEqual({ x: 0, y: 60 });
  });

  test("AddSeatTool ignores stage and dancefloor sections", () => {
    const history = makeImmediateHistory();
    const stageId = "stage-1";
    const dancefloorId = "dancefloor-1";
    const spatialIndex = {
      queryPoint: () => [
        { type: "section", sectionId: stageId },
        { type: "section", sectionId: dancefloorId },
      ],
    };
    const tool = new AddSeatTool(history as never, spatialIndex as never);
    const venue = makeVenue();
    venue.sections = [
      {
        id: stageId,
        label: "Stage",
        kind: "stage",
        position: { x: 0, y: 0 },
        rotation: 0,
        categoryId: "",
        rows: [],
        outline: [
          { x: -100, y: -100 },
          { x: 100, y: -100 },
          { x: 100, y: 100 },
          { x: -100, y: 100 },
        ],
      },
      {
        id: dancefloorId,
        label: "Dancefloor",
        kind: "dancefloor",
        position: { x: 300, y: 0 },
        rotation: 0,
        categoryId: "cat-1",
        rows: [],
        outline: [
          { x: -100, y: -100 },
          { x: 100, y: -100 },
          { x: 100, y: 100 },
          { x: -100, y: 100 },
        ],
      },
    ];
    const store = makeStore(venue);

    tool.onPointerDown(pointer(0, 0), new Viewport(), store);

    expect(store.getState().venue!.sections[0]!.rows).toHaveLength(0);
    expect(store.getState().venue!.sections[1]!.rows).toHaveLength(0);
  });

  test("PanTool moves viewport while dragging", () => {
    withAnimationFrameStubs(() => {
      const tool = new PanTool();
      const viewport = new Viewport();
      viewport.setZoom(2);

      tool.onPointerDown(pointer(0, 0));
      tool.onPointerMove({ ...pointer(0, 0), screenX: 40, screenY: -20 }, viewport);
      tool.onPointerUp(pointer(40, -20), viewport);

      expect(viewport.x).toBe(20);
      expect(viewport.y).toBe(-10);
    });
  });

  test("PanTool resets advanced-only pan tuning when overrides are unset", () => {
    const tool = new PanTool() as unknown as {
      panVelocityBlend: number;
      panStopDelta: number;
      panReleaseIdleMs: number;
      setInertiaOptions: (options: {
        panVelocityBlend?: number;
        panStopDelta?: number;
        panReleaseIdleMs?: number;
      }) => void;
    };

    tool.setInertiaOptions({
      panVelocityBlend: 0.9,
      panStopDelta: 1.2,
      panReleaseIdleMs: 250,
    });

    tool.setInertiaOptions({
      panVelocityBlend: undefined,
      panStopDelta: undefined,
      panReleaseIdleMs: undefined,
    });

    expect(tool.panVelocityBlend).toBe(0.3);
    expect(tool.panStopDelta).toBe(0.3);
    expect(tool.panReleaseIdleMs).toBe(90);
  });
});
