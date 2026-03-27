'use strict';

var react = require('react');
var seatmapCore = require('@nex22/seatmap-core');
var seatmapReact = require('@nex22/seatmap-react');
var zustand = require('zustand');
var jsxRuntime = require('react/jsx-runtime');

// src/SeatmapEditor.tsx

// src/tools/BaseTool.ts
var BaseTool = class {
  onPointerDown(_e, _viewport, _store) {
  }
  onPointerMove(_e, _viewport, _store) {
  }
  onPointerUp(_e, _viewport, _store) {
  }
  onActivate(_viewport, _store) {
  }
  onDeactivate() {
  }
};

// src/tools/PanTool.ts
var PanTool = class extends BaseTool {
  name = "pan";
  cursor = "grab";
  isPanning = false;
  lastX = 0;
  lastY = 0;
  onPointerDown(e) {
    this.isPanning = true;
    this.lastX = e.screenX;
    this.lastY = e.screenY;
  }
  onPointerMove(e, viewport) {
    if (!this.isPanning) return;
    const dx = e.screenX - this.lastX;
    const dy = e.screenY - this.lastY;
    this.lastX = e.screenX;
    this.lastY = e.screenY;
    viewport.pan(dx, dy);
  }
  onPointerUp() {
    this.isPanning = false;
  }
  onDeactivate() {
    this.isPanning = false;
  }
};
var GRID = 20;
function snapToGrid(v) {
  return Math.round(v / GRID) * GRID;
}
var SelectTool = class extends BaseTool {
  constructor(spatialIndex, history) {
    super();
    this.spatialIndex = spatialIndex;
    this.history = history;
  }
  name = "select";
  cursor = "default";
  isDragging = false;
  dragStartWorld = { x: 0, y: 0 };
  hasDragged = false;
  dragMode = { type: "none" };
  selectionRect = null;
  onPointerDown(e, _viewport, store) {
    this.isDragging = true;
    this.hasDragged = false;
    this.dragStartWorld = { x: e.worldX, y: e.worldY };
    this.selectionRect = null;
    this.dragMode = { type: "none" };
    const hits = this.spatialIndex.queryPoint({ x: e.worldX, y: e.worldY }, 12);
    const seatHit = hits.find((h) => h.type === "seat" && h.seatId);
    const sectionHit = hits.find((h) => h.type === "section");
    const venue = store.getState().venue;
    if (!venue) return;
    if (seatHit?.seatId && store.getState().selectedSeatIds.has(seatHit.seatId)) {
      const selectedIds = store.getState().selectedSeatIds;
      const sectionId = seatHit.sectionId;
      const originals = /* @__PURE__ */ new Map();
      const section = venue.sections.find((s) => s.id === sectionId);
      if (section) {
        for (const row of section.rows) {
          for (const seat of row.seats) {
            if (selectedIds.has(seat.id)) {
              originals.set(seat.id, { rowId: row.id, pos: { ...seat.position } });
            }
          }
        }
      }
      if (originals.size > 0) {
        this.dragMode = { type: "seats", sectionId, originals };
        return;
      }
    }
    if (sectionHit && !seatHit) {
      const section = venue.sections.find((s) => s.id === sectionHit.sectionId);
      if (section) {
        this.dragMode = {
          type: "section",
          sectionId: section.id,
          origPos: { ...section.position }
        };
        return;
      }
    }
  }
  onPointerMove(e, _viewport, store) {
    if (!this.isDragging) return;
    const dx = e.worldX - this.dragStartWorld.x;
    const dy = e.worldY - this.dragStartWorld.y;
    if (!this.hasDragged && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
      this.hasDragged = true;
      if (this.dragMode.type === "none") {
        this.dragMode = { type: "rect" };
      }
    }
    if (!this.hasDragged) return;
    const venue = store.getState().venue;
    if (!venue) return;
    if (this.dragMode.type === "seats") {
      const { sectionId, originals } = this.dragMode;
      const section = venue.sections.find((s) => s.id === sectionId);
      if (!section) return;
      const c = Math.cos(-section.rotation);
      const s2 = Math.sin(-section.rotation);
      const localDx = dx * c - dy * s2;
      const localDy = dx * s2 + dy * c;
      const outline = section.outline;
      store.getState().setVenue({
        ...venue,
        sections: venue.sections.map((sec) => {
          if (sec.id !== sectionId) return sec;
          return {
            ...sec,
            rows: sec.rows.map((r) => ({
              ...r,
              seats: r.seats.map((st) => {
                const orig = originals.get(st.id);
                if (!orig) return st;
                let pos = {
                  x: orig.pos.x + localDx,
                  y: orig.pos.y + localDy
                };
                if (outline.length >= 3) {
                  pos = seatmapCore.clampToPolygon(pos, outline);
                }
                return { ...st, position: pos };
              })
            }))
          };
        })
      });
      return;
    }
    if (this.dragMode.type === "section") {
      const { sectionId, origPos } = this.dragMode;
      store.getState().setVenue({
        ...venue,
        sections: venue.sections.map(
          (sec) => sec.id === sectionId ? { ...sec, position: { x: origPos.x + dx, y: origPos.y + dy } } : sec
        )
      });
      return;
    }
    if (this.dragMode.type === "rect") {
      const x = Math.min(this.dragStartWorld.x, e.worldX);
      const y = Math.min(this.dragStartWorld.y, e.worldY);
      const width = Math.abs(dx);
      const height = Math.abs(dy);
      this.selectionRect = { x, y, width, height };
      const items = this.spatialIndex.queryRect({
        minX: x,
        minY: y,
        maxX: x + width,
        maxY: y + height
      });
      const seatIds = items.filter((item) => item.type === "seat" && item.seatId).map((item) => item.seatId);
      store.getState().setSelection(seatIds);
    }
  }
  onPointerUp(e, _viewport, store) {
    if (this.hasDragged) {
      this.commitDrag(store);
    } else {
      const hits = this.spatialIndex.queryPoint({ x: e.worldX, y: e.worldY }, 12);
      const seatHit = hits.find((h) => h.type === "seat" && h.seatId);
      if (seatHit?.seatId) {
        if (e.shiftKey || e.ctrlKey || e.metaKey) {
          store.getState().toggleSeat(seatHit.seatId);
        } else {
          store.getState().setSelection([seatHit.seatId]);
        }
      } else if (!e.shiftKey && !e.ctrlKey && !e.metaKey) {
        store.getState().clearSelection();
      }
    }
    this.reset();
  }
  commitDrag(store) {
    const venue = store.getState().venue;
    if (!venue) return;
    if (this.dragMode.type === "seats") {
      const { sectionId, originals } = this.dragMode;
      const section = venue.sections.find((s) => s.id === sectionId);
      if (!section) return;
      const finals = /* @__PURE__ */ new Map();
      for (const row of section.rows) {
        for (const seat of row.seats) {
          if (originals.has(seat.id)) {
            finals.set(seat.id, {
              x: snapToGrid(seat.position.x),
              y: snapToGrid(seat.position.y)
            });
          }
        }
      }
      store.getState().setVenue({
        ...venue,
        sections: venue.sections.map(
          (sec) => sec.id === sectionId ? {
            ...sec,
            rows: sec.rows.map((r) => ({
              ...r,
              seats: r.seats.map((st) => {
                const fp = finals.get(st.id);
                return fp ? { ...st, position: fp } : st;
              })
            }))
          } : sec
        )
      });
      this.history.execute({
        description: `Move ${originals.size} seat(s)`,
        execute: () => {
          const v = store.getState().venue;
          if (!v) return;
          store.getState().setVenue({
            ...v,
            sections: v.sections.map(
              (sec) => sec.id === sectionId ? {
                ...sec,
                rows: sec.rows.map((r) => ({
                  ...r,
                  seats: r.seats.map((st) => {
                    const fp = finals.get(st.id);
                    return fp ? { ...st, position: fp } : st;
                  })
                }))
              } : sec
            )
          });
        },
        undo: () => {
          const v = store.getState().venue;
          if (!v) return;
          store.getState().setVenue({
            ...v,
            sections: v.sections.map(
              (sec) => sec.id === sectionId ? {
                ...sec,
                rows: sec.rows.map((r) => ({
                  ...r,
                  seats: r.seats.map((st) => {
                    const op = originals.get(st.id);
                    return op ? { ...st, position: op.pos } : st;
                  })
                }))
              } : sec
            )
          });
        }
      });
    }
    if (this.dragMode.type === "section") {
      const { sectionId, origPos } = this.dragMode;
      const section = venue.sections.find((s) => s.id === sectionId);
      if (!section) return;
      const finalPos = { ...section.position };
      this.history.execute({
        description: `Move section`,
        execute: () => {
          const v = store.getState().venue;
          if (!v) return;
          store.getState().setVenue({
            ...v,
            sections: v.sections.map(
              (s) => s.id === sectionId ? { ...s, position: finalPos } : s
            )
          });
        },
        undo: () => {
          const v = store.getState().venue;
          if (!v) return;
          store.getState().setVenue({
            ...v,
            sections: v.sections.map(
              (s) => s.id === sectionId ? { ...s, position: origPos } : s
            )
          });
        }
      });
    }
  }
  reset() {
    this.isDragging = false;
    this.hasDragged = false;
    this.selectionRect = null;
    this.dragMode = { type: "none" };
  }
  onDeactivate() {
    this.reset();
  }
};
var CLOSE_THRESHOLD = 15;
var AddSectionTool = class extends BaseTool {
  constructor(history, categoryId = "") {
    super();
    this.history = history;
    this.categoryId = categoryId;
  }
  name = "add-section";
  cursor = "crosshair";
  points = [];
  onPointsChange;
  setCategoryId(id) {
    this.categoryId = id;
  }
  onPointerDown(e, _viewport, store) {
    if (this.points.length >= 3) {
      const first = this.points[0];
      const dist = Math.hypot(e.worldX - first.x, e.worldY - first.y);
      if (dist < CLOSE_THRESHOLD) {
        this.finishPolygon(store);
        return;
      }
    }
    this.points.push({ x: e.worldX, y: e.worldY });
    this.notifyChange();
  }
  onPointerMove(e) {
    if (this.points.length === 0) return;
    const closeable = this.points.length >= 3 && Math.hypot(e.worldX - this.points[0].x, e.worldY - this.points[0].y) < CLOSE_THRESHOLD;
    this.onPointsChange?.(this.points, closeable);
  }
  finishPolygon(store) {
    if (this.points.length < 3) {
      this.points = [];
      this.notifyChange();
      return;
    }
    let cx = 0, cy = 0;
    for (const p of this.points) {
      cx += p.x;
      cy += p.y;
    }
    cx /= this.points.length;
    cy /= this.points.length;
    const outline = this.points.map((p) => ({
      x: p.x - cx,
      y: p.y - cy
    }));
    const newSection = {
      id: seatmapCore.generateId("sec"),
      label: `Section ${Date.now().toString(36).slice(-3).toUpperCase()}`,
      position: { x: cx, y: cy },
      rotation: 0,
      categoryId: this.categoryId,
      rows: [],
      outline
    };
    this.history.execute({
      description: `Add section "${newSection.label}"`,
      execute: () => {
        const v = store.getState().venue;
        if (!v) return;
        store.getState().setVenue({ ...v, sections: [...v.sections, newSection] });
      },
      undo: () => {
        const v = store.getState().venue;
        if (!v) return;
        store.getState().setVenue({
          ...v,
          sections: v.sections.filter((s) => s.id !== newSection.id)
        });
      }
    });
    this.points = [];
    this.notifyChange();
  }
  notifyChange() {
    this.onPointsChange?.(this.points, false);
  }
  onDeactivate() {
    this.points = [];
    this.notifyChange();
  }
};
var ROW_GAP = 22;
var AddRowTool = class extends BaseTool {
  constructor(history, spatialIndex) {
    super();
    this.history = history;
    this.spatialIndex = spatialIndex;
  }
  name = "add-row";
  cursor = "cell";
  seatsPerRow = 10;
  seatSpacing = 20;
  onPointerDown(e, _viewport, store) {
    const hits = this.spatialIndex.queryPoint({ x: e.worldX, y: e.worldY }, 50);
    const sectionHit = hits.find((h) => h.type === "section");
    if (!sectionHit) return;
    const venue = store.getState().venue;
    if (!venue) return;
    const section = venue.sections.find((s) => s.id === sectionHit.sectionId);
    if (!section) return;
    const cos = Math.cos(-section.rotation);
    const sin = Math.sin(-section.rotation);
    const relX = e.worldX - section.position.x;
    const relY = e.worldY - section.position.y;
    let targetY = relX * sin + relY * cos;
    const existingYs = section.rows.flatMap((r) => r.seats.map((s) => s.position.y)).filter((y, i, arr) => arr.indexOf(y) === i).sort((a, b) => a - b);
    for (const ey of existingYs) {
      if (Math.abs(targetY - ey) < ROW_GAP) {
        targetY = ey + ROW_GAP;
      }
    }
    const hasOutline = section.outline.length >= 3;
    const allSeats = [];
    const startX = -((this.seatsPerRow - 1) * this.seatSpacing) / 2;
    for (let i = 0; i < this.seatsPerRow; i++) {
      const pos = { x: startX + i * this.seatSpacing, y: targetY };
      if (hasOutline && !seatmapCore.pointInPolygon(pos, section.outline)) continue;
      allSeats.push({
        id: seatmapCore.generateId("seat"),
        label: `${allSeats.length + 1}`,
        position: pos,
        status: "available",
        categoryId: section.categoryId
      });
    }
    const seats = allSeats;
    if (seats.length === 0) return;
    const rowLabel = String.fromCharCode(65 + section.rows.length);
    const newRow = {
      id: seatmapCore.generateId("row"),
      label: rowLabel,
      seats
    };
    const sectionId = section.id;
    this.history.execute({
      description: `Add row ${rowLabel} to "${section.label}"`,
      execute: () => {
        const v = store.getState().venue;
        if (!v) return;
        store.getState().setVenue({
          ...v,
          sections: v.sections.map(
            (s) => s.id === sectionId ? { ...s, rows: [...s.rows, newRow] } : s
          )
        });
      },
      undo: () => {
        const v = store.getState().venue;
        if (!v) return;
        store.getState().setVenue({
          ...v,
          sections: v.sections.map(
            (s) => s.id === sectionId ? { ...s, rows: s.rows.filter((r) => r.id !== newRow.id) } : s
          )
        });
      }
    });
  }
};
var GRID2 = 20;
var MIN_SEAT_DIST = 16;
function snapToGrid2(v) {
  return Math.round(v / GRID2) * GRID2;
}
var AddSeatTool = class extends BaseTool {
  constructor(history, spatialIndex) {
    super();
    this.history = history;
    this.spatialIndex = spatialIndex;
  }
  name = "add-seat";
  cursor = "crosshair";
  onPointerDown(e, _viewport, store) {
    const hits = this.spatialIndex.queryPoint({ x: e.worldX, y: e.worldY }, 50);
    const sectionHit = hits.find((h) => h.type === "section");
    if (!sectionHit) return;
    const venue = store.getState().venue;
    if (!venue) return;
    const section = venue.sections.find((s) => s.id === sectionHit.sectionId);
    if (!section) return;
    const relX = e.worldX - section.position.x;
    const relY = e.worldY - section.position.y;
    const c = Math.cos(-section.rotation);
    const s2 = Math.sin(-section.rotation);
    let lx = snapToGrid2(relX * c - relY * s2);
    let ly = snapToGrid2(relX * s2 + relY * c);
    if (section.outline.length >= 3 && !seatmapCore.pointInPolygon({ x: lx, y: ly }, section.outline)) {
      return;
    }
    const existing = [];
    for (const row of section.rows) {
      for (const seat of row.seats) {
        existing.push(seat.position);
      }
    }
    lx = this.findNonOverlapping(lx, ly, existing);
    let bestRow = null;
    let bestDist = Infinity;
    for (const row of section.rows) {
      if (row.seats.length === 0) continue;
      const rowY = row.seats[0].position.y;
      const dist = Math.abs(ly - rowY);
      if (dist < MIN_SEAT_DIST && dist < bestDist) {
        bestDist = dist;
        bestRow = row;
      }
    }
    const sectionId = section.id;
    if (bestRow) {
      const rowId = bestRow.id;
      const snappedY = bestRow.seats[0].position.y;
      const existingInRow = bestRow.seats.map((s) => s.position);
      const finalX = this.findNonOverlapping(lx, snappedY, existingInRow);
      const newSeat = {
        id: seatmapCore.generateId("seat"),
        label: `${bestRow.seats.length + 1}`,
        position: { x: finalX, y: snappedY },
        status: "available",
        categoryId: section.categoryId
      };
      this.history.execute({
        description: `Add seat to row "${bestRow.label}"`,
        execute: () => {
          const v = store.getState().venue;
          if (!v) return;
          store.getState().setVenue({
            ...v,
            sections: v.sections.map(
              (sec) => sec.id === sectionId ? { ...sec, rows: sec.rows.map((r) => r.id === rowId ? { ...r, seats: [...r.seats, newSeat] } : r) } : sec
            )
          });
        },
        undo: () => {
          const v = store.getState().venue;
          if (!v) return;
          store.getState().setVenue({
            ...v,
            sections: v.sections.map(
              (sec) => sec.id === sectionId ? { ...sec, rows: sec.rows.map((r) => r.id === rowId ? { ...r, seats: r.seats.filter((st) => st.id !== newSeat.id) } : r) } : sec
            )
          });
        }
      });
    } else {
      const rowLabel = String.fromCharCode(65 + section.rows.length);
      const newSeat = {
        id: seatmapCore.generateId("seat"),
        label: "1",
        position: { x: lx, y: ly },
        status: "available",
        categoryId: section.categoryId
      };
      const newRow = { id: seatmapCore.generateId("row"), label: rowLabel, seats: [newSeat] };
      this.history.execute({
        description: `Add seat in new row ${rowLabel}`,
        execute: () => {
          const v = store.getState().venue;
          if (!v) return;
          store.getState().setVenue({
            ...v,
            sections: v.sections.map(
              (sec) => sec.id === sectionId ? { ...sec, rows: [...sec.rows, newRow] } : sec
            )
          });
        },
        undo: () => {
          const v = store.getState().venue;
          if (!v) return;
          store.getState().setVenue({
            ...v,
            sections: v.sections.map(
              (sec) => sec.id === sectionId ? { ...sec, rows: sec.rows.filter((r) => r.id !== newRow.id) } : sec
            )
          });
        }
      });
    }
  }
  findNonOverlapping(x, y, existing) {
    let candidate = snapToGrid2(x);
    for (let attempt = 0; attempt < 20; attempt++) {
      const overlaps = existing.some(
        (p) => Math.hypot(p.x - candidate, p.y - y) < MIN_SEAT_DIST
      );
      if (!overlaps) return candidate;
      candidate += GRID2;
    }
    return candidate;
  }
};
var tools = [
  { id: "pan", label: "Pan", icon: "\u270B" },
  { id: "select", label: "Select", icon: "\u2196" },
  { id: "add-section", label: "Section", icon: "\u25A2" },
  { id: "add-row", label: "Row", icon: "\u22EF" },
  { id: "add-seat", label: "Seat", icon: "+" }
];
var btnBase = {
  padding: "6px 10px",
  border: "1px solid #3a3a5a",
  borderRadius: 6,
  background: "#2a2a4a",
  color: "#e0e0e0",
  cursor: "pointer",
  fontSize: 13,
  fontFamily: "system-ui",
  display: "flex",
  alignItems: "center",
  gap: 4
};
var activeBtnStyle = {
  ...btnBase,
  background: "#4a4a7a",
  borderColor: "#6a6aaa"
};
function Toolbar({
  activeTool,
  onToolChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onFitView,
  onSave,
  onLoad,
  seatsPerRow,
  onSeatsPerRowChange,
  style
}) {
  return /* @__PURE__ */ jsxRuntime.jsxs(
    "div",
    {
      style: {
        display: "flex",
        gap: 4,
        padding: "8px 12px",
        background: "#1a1a2e",
        borderBottom: "1px solid #2a2a4a",
        alignItems: "center",
        flexWrap: "wrap",
        ...style
      },
      children: [
        tools.map((tool) => /* @__PURE__ */ jsxRuntime.jsxs(
          "button",
          {
            onClick: () => onToolChange(tool.id),
            style: activeTool === tool.id ? activeBtnStyle : btnBase,
            title: tool.label,
            children: [
              /* @__PURE__ */ jsxRuntime.jsx("span", { children: tool.icon }),
              /* @__PURE__ */ jsxRuntime.jsx("span", { children: tool.label })
            ]
          },
          tool.id
        )),
        activeTool === "add-row" && /* @__PURE__ */ jsxRuntime.jsxs(jsxRuntime.Fragment, { children: [
          /* @__PURE__ */ jsxRuntime.jsx("div", { style: { width: 1, height: 24, background: "#3a3a5a", margin: "0 6px" } }),
          /* @__PURE__ */ jsxRuntime.jsxs("label", { style: { color: "#9e9e9e", fontSize: 12, fontFamily: "system-ui", display: "flex", alignItems: "center", gap: 4 }, children: [
            "Seats/row:",
            /* @__PURE__ */ jsxRuntime.jsx(
              "input",
              {
                type: "number",
                min: 1,
                max: 100,
                value: seatsPerRow,
                onChange: (e) => onSeatsPerRowChange(Math.max(1, Math.min(100, parseInt(e.target.value) || 1))),
                style: {
                  width: 50,
                  padding: "3px 6px",
                  background: "#2a2a4a",
                  border: "1px solid #3a3a5a",
                  borderRadius: 4,
                  color: "#e0e0e0",
                  fontSize: 13,
                  fontFamily: "system-ui"
                }
              }
            )
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntime.jsx("div", { style: { width: 1, height: 24, background: "#3a3a5a", margin: "0 6px" } }),
        /* @__PURE__ */ jsxRuntime.jsx("button", { onClick: onUndo, disabled: !canUndo, style: { ...btnBase, opacity: canUndo ? 1 : 0.4 }, title: "Undo (Ctrl+Z)", children: "\u21A9 Undo" }),
        /* @__PURE__ */ jsxRuntime.jsx("button", { onClick: onRedo, disabled: !canRedo, style: { ...btnBase, opacity: canRedo ? 1 : 0.4 }, title: "Redo (Ctrl+Shift+Z)", children: "\u21AA Redo" }),
        /* @__PURE__ */ jsxRuntime.jsx("div", { style: { width: 1, height: 24, background: "#3a3a5a", margin: "0 6px" } }),
        /* @__PURE__ */ jsxRuntime.jsx("button", { onClick: onFitView, style: btnBase, title: "Fit to view", children: "\u229E Fit" }),
        /* @__PURE__ */ jsxRuntime.jsx("div", { style: { width: 1, height: 24, background: "#3a3a5a", margin: "0 6px" } }),
        /* @__PURE__ */ jsxRuntime.jsx("button", { onClick: onSave, style: btnBase, title: "Export venue as JSON", children: "\u2193 Save" }),
        /* @__PURE__ */ jsxRuntime.jsx("button", { onClick: onLoad, style: btnBase, title: "Import venue from JSON", children: "\u2191 Load" })
      ]
    }
  );
}
var labelStyle = {
  fontSize: 11,
  color: "#9e9e9e",
  marginBottom: 2,
  fontFamily: "system-ui"
};
var inputStyle = {
  width: "100%",
  padding: "4px 8px",
  background: "#2a2a4a",
  border: "1px solid #3a3a5a",
  borderRadius: 4,
  color: "#e0e0e0",
  fontSize: 13,
  fontFamily: "system-ui",
  boxSizing: "border-box"
};
var selectStyle = { ...inputStyle, cursor: "pointer" };
var btnDanger = {
  padding: "3px 8px",
  border: "1px solid #5a2a2a",
  borderRadius: 4,
  background: "#3a1a1a",
  color: "#f48888",
  cursor: "pointer",
  fontSize: 12,
  fontFamily: "system-ui"
};
var btnSmall = {
  padding: "3px 8px",
  border: "1px solid #3a3a5a",
  borderRadius: 4,
  background: "#2a2a4a",
  color: "#e0e0e0",
  cursor: "pointer",
  fontSize: 12,
  fontFamily: "system-ui"
};
function freshVenue(store) {
  return store.getState().venue;
}
function setVenue(store, venue) {
  store.getState().setVenue(venue);
}
function PropertyPanel({
  venue,
  selectedSeatIds,
  history,
  store,
  onUploadBackground,
  onRemoveBackground,
  onBackgroundOpacityChange,
  style
}) {
  const [selectedSection, setSelectedSection] = react.useState(null);
  react.useEffect(() => {
    if (!venue || selectedSeatIds.size === 0) {
      setSelectedSection(null);
      return;
    }
    const firstSeatId = [...selectedSeatIds][0];
    for (const section of venue.sections) {
      for (const row of section.rows) {
        if (row.seats.some((s) => s.id === firstSeatId)) {
          setSelectedSection(section);
          return;
        }
      }
    }
    setSelectedSection(null);
  }, [venue, selectedSeatIds]);
  const updateSectionLabel = (sectionId, newLabel) => {
    const v = freshVenue(store);
    if (!v) return;
    const oldLabel = v.sections.find((s) => s.id === sectionId)?.label ?? "";
    history.execute({
      description: `Rename section to "${newLabel}"`,
      execute: () => {
        const cur = freshVenue(store);
        if (!cur) return;
        setVenue(store, {
          ...cur,
          sections: cur.sections.map(
            (s) => s.id === sectionId ? { ...s, label: newLabel } : s
          )
        });
      },
      undo: () => {
        const cur = freshVenue(store);
        if (!cur) return;
        setVenue(store, {
          ...cur,
          sections: cur.sections.map(
            (s) => s.id === sectionId ? { ...s, label: oldLabel } : s
          )
        });
      }
    });
  };
  const updateSectionCategory = (sectionId, categoryId) => {
    const v = freshVenue(store);
    if (!v) return;
    const oldCatId = v.sections.find((s) => s.id === sectionId)?.categoryId ?? "";
    history.execute({
      description: `Change section category`,
      execute: () => {
        const cur = freshVenue(store);
        if (!cur) return;
        setVenue(store, {
          ...cur,
          sections: cur.sections.map(
            (s) => s.id === sectionId ? {
              ...s,
              categoryId,
              rows: s.rows.map((r) => ({
                ...r,
                seats: r.seats.map((seat) => ({ ...seat, categoryId }))
              }))
            } : s
          )
        });
      },
      undo: () => {
        const cur = freshVenue(store);
        if (!cur) return;
        setVenue(store, {
          ...cur,
          sections: cur.sections.map(
            (s) => s.id === sectionId ? {
              ...s,
              categoryId: oldCatId,
              rows: s.rows.map((r) => ({
                ...r,
                seats: r.seats.map((seat) => ({ ...seat, categoryId: oldCatId }))
              }))
            } : s
          )
        });
      }
    });
  };
  const deleteSection = (sectionId) => {
    const v = freshVenue(store);
    if (!v) return;
    const removed = v.sections.find((s) => s.id === sectionId);
    if (!removed) return;
    history.execute({
      description: `Delete section "${removed.label}"`,
      execute: () => {
        const cur = freshVenue(store);
        if (!cur) return;
        setVenue(store, { ...cur, sections: cur.sections.filter((s) => s.id !== sectionId) });
        store.getState().clearSelection();
      },
      undo: () => {
        const cur = freshVenue(store);
        if (!cur) return;
        setVenue(store, { ...cur, sections: [...cur.sections, removed] });
      }
    });
  };
  const deleteRow = (sectionId, rowId) => {
    const v = freshVenue(store);
    if (!v) return;
    const sec = v.sections.find((s) => s.id === sectionId);
    const removed = sec?.rows.find((r) => r.id === rowId);
    if (!removed) return;
    history.execute({
      description: `Delete row "${removed.label}"`,
      execute: () => {
        const cur = freshVenue(store);
        if (!cur) return;
        setVenue(store, {
          ...cur,
          sections: cur.sections.map(
            (s) => s.id === sectionId ? { ...s, rows: s.rows.filter((r) => r.id !== rowId) } : s
          )
        });
      },
      undo: () => {
        const cur = freshVenue(store);
        if (!cur) return;
        setVenue(store, {
          ...cur,
          sections: cur.sections.map(
            (s) => s.id === sectionId ? { ...s, rows: [...s.rows, removed] } : s
          )
        });
      }
    });
  };
  const deleteSeat = (sectionId, rowId, seatId) => {
    const v = freshVenue(store);
    if (!v) return;
    const sec = v.sections.find((s) => s.id === sectionId);
    const row = sec?.rows.find((r) => r.id === rowId);
    const removed = row?.seats.find((s) => s.id === seatId);
    if (!removed) return;
    history.execute({
      description: `Delete seat "${removed.label}"`,
      execute: () => {
        const cur = freshVenue(store);
        if (!cur) return;
        setVenue(store, {
          ...cur,
          sections: cur.sections.map(
            (s) => s.id === sectionId ? {
              ...s,
              rows: s.rows.map(
                (r) => r.id === rowId ? { ...r, seats: r.seats.filter((st) => st.id !== seatId) } : r
              )
            } : s
          )
        });
        const sel = store.getState().selectedSeatIds;
        if (sel.has(seatId)) store.getState().deselectSeat(seatId);
      },
      undo: () => {
        const cur = freshVenue(store);
        if (!cur) return;
        setVenue(store, {
          ...cur,
          sections: cur.sections.map(
            (s) => s.id === sectionId ? {
              ...s,
              rows: s.rows.map(
                (r) => r.id === rowId ? { ...r, seats: [...r.seats, removed] } : r
              )
            } : s
          )
        });
      }
    });
  };
  const addSingleSeat = (sectionId) => {
    const v = freshVenue(store);
    if (!v) return;
    const sec = v.sections.find((s) => s.id === sectionId);
    if (!sec) return;
    let targetRow = sec.rows[sec.rows.length - 1];
    const newSeat = {
      id: seatmapCore.generateId("seat"),
      label: targetRow ? `${targetRow.seats.length + 1}` : "1",
      position: {
        x: targetRow ? targetRow.seats.length > 0 ? targetRow.seats[targetRow.seats.length - 1].position.x + 20 : 0 : 0,
        y: targetRow ? targetRow.seats[0]?.position.y ?? 0 : 0
      },
      status: "available",
      categoryId: sec.categoryId
    };
    if (!targetRow) {
      const newRow = { id: seatmapCore.generateId("row"), label: "A", seats: [newSeat] };
      history.execute({
        description: `Add seat to new row`,
        execute: () => {
          const cur = freshVenue(store);
          if (!cur) return;
          setVenue(store, {
            ...cur,
            sections: cur.sections.map(
              (s) => s.id === sectionId ? { ...s, rows: [...s.rows, newRow] } : s
            )
          });
        },
        undo: () => {
          const cur = freshVenue(store);
          if (!cur) return;
          setVenue(store, {
            ...cur,
            sections: cur.sections.map(
              (s) => s.id === sectionId ? { ...s, rows: s.rows.filter((r) => r.id !== newRow.id) } : s
            )
          });
        }
      });
      return;
    }
    const rowId = targetRow.id;
    history.execute({
      description: `Add seat to row "${targetRow.label}"`,
      execute: () => {
        const cur = freshVenue(store);
        if (!cur) return;
        setVenue(store, {
          ...cur,
          sections: cur.sections.map(
            (s) => s.id === sectionId ? {
              ...s,
              rows: s.rows.map(
                (r) => r.id === rowId ? { ...r, seats: [...r.seats, newSeat] } : r
              )
            } : s
          )
        });
      },
      undo: () => {
        const cur = freshVenue(store);
        if (!cur) return;
        setVenue(store, {
          ...cur,
          sections: cur.sections.map(
            (s) => s.id === sectionId ? {
              ...s,
              rows: s.rows.map(
                (r) => r.id === rowId ? { ...r, seats: r.seats.filter((st) => st.id !== newSeat.id) } : r
              )
            } : s
          )
        });
      }
    });
  };
  if (!venue) {
    return /* @__PURE__ */ jsxRuntime.jsx("div", { style: { padding: 16, color: "#9e9e9e", fontSize: 13, fontFamily: "system-ui", ...style }, children: "No venue loaded" });
  }
  if (!selectedSection) {
    return /* @__PURE__ */ jsxRuntime.jsxs("div", { style: { padding: 16, ...style }, children: [
      /* @__PURE__ */ jsxRuntime.jsx("div", { style: { color: "#9e9e9e", fontSize: 13, fontFamily: "system-ui", marginBottom: 12 }, children: selectedSeatIds.size === 0 ? "Select seats to edit section properties" : `${selectedSeatIds.size} seat(s) selected` }),
      /* @__PURE__ */ jsxRuntime.jsx("div", { style: labelStyle, children: "Venue" }),
      /* @__PURE__ */ jsxRuntime.jsx("div", { style: { color: "#e0e0e0", fontSize: 14, fontFamily: "system-ui" }, children: venue.name }),
      /* @__PURE__ */ jsxRuntime.jsxs("div", { style: { ...labelStyle, marginTop: 12 }, children: [
        "Sections: ",
        venue.sections.length
      ] }),
      /* @__PURE__ */ jsxRuntime.jsxs("div", { style: { ...labelStyle, marginTop: 4 }, children: [
        "Seats: ",
        venue.sections.reduce((t, s) => t + s.rows.reduce((rt, r) => rt + r.seats.length, 0), 0)
      ] }),
      /* @__PURE__ */ jsxRuntime.jsx("div", { style: { height: 1, background: "#2a2a4a", margin: "14px 0" } }),
      /* @__PURE__ */ jsxRuntime.jsx("div", { style: labelStyle, children: "Background Image" }),
      venue.backgroundImage ? /* @__PURE__ */ jsxRuntime.jsxs("div", { style: { marginTop: 6 }, children: [
        /* @__PURE__ */ jsxRuntime.jsx(
          "div",
          {
            style: {
              width: "100%",
              height: 80,
              borderRadius: 4,
              border: "1px solid #3a3a5a",
              overflow: "hidden",
              marginBottom: 8
            },
            children: /* @__PURE__ */ jsxRuntime.jsx(
              "img",
              {
                src: venue.backgroundImage,
                alt: "Background",
                style: { width: "100%", height: "100%", objectFit: "cover", display: "block" }
              }
            )
          }
        ),
        /* @__PURE__ */ jsxRuntime.jsxs("div", { style: { ...labelStyle, marginBottom: 4 }, children: [
          "Opacity: ",
          Math.round((venue.backgroundImageOpacity ?? 0.5) * 100),
          "%"
        ] }),
        /* @__PURE__ */ jsxRuntime.jsx(
          "input",
          {
            type: "range",
            min: 0,
            max: 100,
            value: Math.round((venue.backgroundImageOpacity ?? 0.5) * 100),
            onChange: (e) => onBackgroundOpacityChange?.(parseInt(e.target.value) / 100),
            style: { width: "100%", accentColor: "#6a6aaa", cursor: "pointer" }
          }
        ),
        /* @__PURE__ */ jsxRuntime.jsxs("div", { style: { display: "flex", gap: 6, marginTop: 8 }, children: [
          /* @__PURE__ */ jsxRuntime.jsx("button", { onClick: onUploadBackground, style: btnSmall, children: "Replace" }),
          /* @__PURE__ */ jsxRuntime.jsx("button", { onClick: onRemoveBackground, style: btnDanger, children: "Remove" })
        ] })
      ] }) : /* @__PURE__ */ jsxRuntime.jsx(
        "button",
        {
          onClick: onUploadBackground,
          style: { ...btnSmall, marginTop: 6, width: "100%" },
          children: "Upload Image"
        }
      )
    ] });
  }
  const selectedSeatList = [];
  for (const row of selectedSection.rows) {
    for (const seat of row.seats) {
      if (selectedSeatIds.has(seat.id)) {
        selectedSeatList.push({ seat, row });
      }
    }
  }
  return /* @__PURE__ */ jsxRuntime.jsxs("div", { style: { padding: 16, ...style }, children: [
    /* @__PURE__ */ jsxRuntime.jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }, children: [
      /* @__PURE__ */ jsxRuntime.jsx("div", { style: { fontWeight: 600, color: "#e0e0e0", fontSize: 14, fontFamily: "system-ui" }, children: "Section" }),
      /* @__PURE__ */ jsxRuntime.jsx("button", { onClick: () => deleteSection(selectedSection.id), style: btnDanger, title: "Delete section", children: "Delete" })
    ] }),
    /* @__PURE__ */ jsxRuntime.jsxs("div", { style: { marginBottom: 10 }, children: [
      /* @__PURE__ */ jsxRuntime.jsx("div", { style: labelStyle, children: "Label" }),
      /* @__PURE__ */ jsxRuntime.jsx(
        "input",
        {
          style: inputStyle,
          value: selectedSection.label,
          onChange: (e) => updateSectionLabel(selectedSection.id, e.target.value)
        }
      )
    ] }),
    /* @__PURE__ */ jsxRuntime.jsxs("div", { style: { marginBottom: 10 }, children: [
      /* @__PURE__ */ jsxRuntime.jsx("div", { style: labelStyle, children: "Category" }),
      /* @__PURE__ */ jsxRuntime.jsx(
        "select",
        {
          style: selectStyle,
          value: selectedSection.categoryId,
          onChange: (e) => updateSectionCategory(selectedSection.id, e.target.value),
          children: venue.categories.map((cat) => /* @__PURE__ */ jsxRuntime.jsx("option", { value: cat.id, children: cat.name }, cat.id))
        }
      )
    ] }),
    /* @__PURE__ */ jsxRuntime.jsx("div", { style: { marginBottom: 10 }, children: /* @__PURE__ */ jsxRuntime.jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" }, children: [
      /* @__PURE__ */ jsxRuntime.jsxs("div", { style: labelStyle, children: [
        "Rows (",
        selectedSection.rows.length,
        ") \xB7",
        " ",
        selectedSection.rows.reduce((t, r) => t + r.seats.length, 0),
        " seats"
      ] }),
      /* @__PURE__ */ jsxRuntime.jsx("button", { onClick: () => addSingleSeat(selectedSection.id), style: btnSmall, title: "Add a single seat to the last row", children: "+ Seat" })
    ] }) }),
    /* @__PURE__ */ jsxRuntime.jsx("div", { style: { maxHeight: 200, overflowY: "auto", marginBottom: 10 }, children: selectedSection.rows.map((row) => /* @__PURE__ */ jsxRuntime.jsxs(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "3px 6px",
          borderRadius: 4,
          marginBottom: 2,
          background: "#2a2a4a",
          fontSize: 12,
          fontFamily: "system-ui",
          color: "#e0e0e0"
        },
        children: [
          /* @__PURE__ */ jsxRuntime.jsxs("span", { style: { fontWeight: 600, minWidth: 24 }, children: [
            "Row ",
            row.label
          ] }),
          /* @__PURE__ */ jsxRuntime.jsxs("span", { style: { flex: 1, color: "#9e9e9e" }, children: [
            row.seats.length,
            " seats"
          ] }),
          /* @__PURE__ */ jsxRuntime.jsx(
            "button",
            {
              onClick: () => deleteRow(selectedSection.id, row.id),
              style: { ...btnDanger, padding: "1px 5px", fontSize: 11 },
              title: `Delete row ${row.label}`,
              children: "\u2715"
            }
          )
        ]
      },
      row.id
    )) }),
    selectedSeatList.length > 0 && selectedSeatList.length <= 10 && /* @__PURE__ */ jsxRuntime.jsxs("div", { style: { marginBottom: 10 }, children: [
      /* @__PURE__ */ jsxRuntime.jsxs("div", { style: labelStyle, children: [
        "Selected Seats (",
        selectedSeatList.length,
        ")"
      ] }),
      /* @__PURE__ */ jsxRuntime.jsx("div", { style: { maxHeight: 120, overflowY: "auto" }, children: selectedSeatList.map(({ seat, row }) => /* @__PURE__ */ jsxRuntime.jsxs(
        "div",
        {
          style: {
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "2px 6px",
            fontSize: 12,
            fontFamily: "system-ui",
            color: "#e0e0e0"
          },
          children: [
            /* @__PURE__ */ jsxRuntime.jsxs("span", { style: { flex: 1 }, children: [
              "Row ",
              row.label,
              ", Seat ",
              seat.label
            ] }),
            /* @__PURE__ */ jsxRuntime.jsx(
              "button",
              {
                onClick: () => deleteSeat(selectedSection.id, row.id, seat.id),
                style: { ...btnDanger, padding: "1px 5px", fontSize: 11 },
                title: "Delete seat",
                children: "\u2715"
              }
            )
          ]
        },
        seat.id
      )) })
    ] }),
    selectedSeatList.length > 10 && /* @__PURE__ */ jsxRuntime.jsxs("div", { style: { ...labelStyle, marginBottom: 10 }, children: [
      selectedSeatList.length,
      " seats selected"
    ] })
  ] });
}
var btnSmall2 = {
  padding: "3px 8px",
  border: "1px solid #3a3a5a",
  borderRadius: 4,
  background: "#2a2a4a",
  color: "#e0e0e0",
  cursor: "pointer",
  fontSize: 12,
  fontFamily: "system-ui"
};
function CategoryManager({
  venue,
  history,
  store,
  style
}) {
  const [newName, setNewName] = react.useState("");
  const [newColor, setNewColor] = react.useState("#4caf50");
  if (!venue) return null;
  const addCategory = () => {
    if (!newName.trim()) return;
    const cat = {
      id: seatmapCore.generateId("cat"),
      name: newName.trim(),
      color: newColor
    };
    history.execute({
      description: `Add category "${cat.name}"`,
      execute: () => {
        const cur = store.getState().venue;
        if (!cur) return;
        store.getState().setVenue({ ...cur, categories: [...cur.categories, cat] });
      },
      undo: () => {
        const cur = store.getState().venue;
        if (!cur) return;
        store.getState().setVenue({ ...cur, categories: cur.categories.filter((c) => c.id !== cat.id) });
      }
    });
    setNewName("");
  };
  const removeCategory = (catId) => {
    const cat = venue.categories.find((c) => c.id === catId);
    if (!cat) return;
    history.execute({
      description: `Remove category "${cat.name}"`,
      execute: () => {
        const cur = store.getState().venue;
        if (!cur) return;
        store.getState().setVenue({ ...cur, categories: cur.categories.filter((c) => c.id !== catId) });
      },
      undo: () => {
        const cur = store.getState().venue;
        if (!cur) return;
        store.getState().setVenue({ ...cur, categories: [...cur.categories, cat] });
      }
    });
  };
  return /* @__PURE__ */ jsxRuntime.jsxs("div", { style: { padding: 16, ...style }, children: [
    /* @__PURE__ */ jsxRuntime.jsx("div", { style: { fontWeight: 600, color: "#e0e0e0", fontSize: 14, fontFamily: "system-ui", marginBottom: 12 }, children: "Pricing Categories" }),
    venue.categories.map((cat) => /* @__PURE__ */ jsxRuntime.jsxs(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 6,
          padding: "4px 8px",
          borderRadius: 4,
          background: "#2a2a4a"
        },
        children: [
          /* @__PURE__ */ jsxRuntime.jsx("div", { style: { width: 14, height: 14, borderRadius: 3, background: cat.color, flexShrink: 0 } }),
          /* @__PURE__ */ jsxRuntime.jsx("div", { style: { flex: 1, color: "#e0e0e0", fontSize: 13, fontFamily: "system-ui" }, children: cat.name }),
          /* @__PURE__ */ jsxRuntime.jsx(
            "button",
            {
              onClick: () => removeCategory(cat.id),
              style: { ...btnSmall2, padding: "1px 6px", fontSize: 11 },
              children: "\u2715"
            }
          )
        ]
      },
      cat.id
    )),
    /* @__PURE__ */ jsxRuntime.jsxs("div", { style: { display: "flex", gap: 6, marginTop: 10, alignItems: "center" }, children: [
      /* @__PURE__ */ jsxRuntime.jsx(
        "input",
        {
          type: "color",
          value: newColor,
          onChange: (e) => setNewColor(e.target.value),
          style: { width: 28, height: 28, border: "none", padding: 0, cursor: "pointer" }
        }
      ),
      /* @__PURE__ */ jsxRuntime.jsx(
        "input",
        {
          placeholder: "Category name",
          value: newName,
          onChange: (e) => setNewName(e.target.value),
          onKeyDown: (e) => e.key === "Enter" && addCategory(),
          style: {
            flex: 1,
            padding: "4px 8px",
            background: "#2a2a4a",
            border: "1px solid #3a3a5a",
            borderRadius: 4,
            color: "#e0e0e0",
            fontSize: 13,
            fontFamily: "system-ui"
          }
        }
      ),
      /* @__PURE__ */ jsxRuntime.jsx("button", { onClick: addCategory, style: btnSmall2, children: "Add" })
    ] })
  ] });
}
function LayerPanel({
  venue,
  selectedSeatIds,
  onSelectSection,
  style
}) {
  if (!venue) return null;
  const findSectionForSeat = (seatId) => {
    for (const section of venue.sections) {
      for (const row of section.rows) {
        if (row.seats.some((s) => s.id === seatId)) return section.id;
      }
    }
    return null;
  };
  const selectedSectionId = selectedSeatIds.size > 0 ? findSectionForSeat([...selectedSeatIds][0]) : null;
  return /* @__PURE__ */ jsxRuntime.jsxs("div", { style: { padding: 16, ...style }, children: [
    /* @__PURE__ */ jsxRuntime.jsx("div", { style: { fontWeight: 600, color: "#e0e0e0", fontSize: 14, fontFamily: "system-ui", marginBottom: 12 }, children: "Layers" }),
    venue.sections.map((section) => {
      const seatCount = section.rows.reduce((t, r) => t + r.seats.length, 0);
      const isActive = section.id === selectedSectionId;
      const catColor = venue.categories.find((c) => c.id === section.categoryId)?.color ?? "#666";
      return /* @__PURE__ */ jsxRuntime.jsxs(
        "div",
        {
          onClick: () => onSelectSection(section.id),
          style: {
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 8px",
            borderRadius: 4,
            marginBottom: 2,
            cursor: "pointer",
            background: isActive ? "#3a3a5a" : "transparent"
          },
          children: [
            /* @__PURE__ */ jsxRuntime.jsx(
              "div",
              {
                style: {
                  width: 10,
                  height: 10,
                  borderRadius: 2,
                  background: catColor,
                  flexShrink: 0
                }
              }
            ),
            /* @__PURE__ */ jsxRuntime.jsxs("div", { style: { flex: 1, minWidth: 0 }, children: [
              /* @__PURE__ */ jsxRuntime.jsx(
                "div",
                {
                  style: {
                    color: "#e0e0e0",
                    fontSize: 13,
                    fontFamily: "system-ui",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis"
                  },
                  children: section.label
                }
              ),
              /* @__PURE__ */ jsxRuntime.jsxs("div", { style: { color: "#9e9e9e", fontSize: 11, fontFamily: "system-ui" }, children: [
                section.rows.length,
                " rows, ",
                seatCount,
                " seats"
              ] })
            ] })
          ]
        },
        section.id
      );
    }),
    venue.sections.length === 0 && /* @__PURE__ */ jsxRuntime.jsx("div", { style: { color: "#9e9e9e", fontSize: 13, fontFamily: "system-ui" }, children: "No sections yet. Use the Add Section tool." })
  ] });
}
function PolygonPreviewOverlay({
  points,
  closeable,
  viewport
}) {
  if (points.length === 0) return null;
  const screenPoints = points.map((p) => viewport.worldToScreen(p.x, p.y));
  const svgPoints = screenPoints.map((p) => `${p.x},${p.y}`).join(" ");
  const first = screenPoints[0];
  const last = screenPoints[screenPoints.length - 1];
  return /* @__PURE__ */ jsxRuntime.jsxs(
    "svg",
    {
      style: {
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 10
      },
      children: [
        screenPoints.length >= 2 && /* @__PURE__ */ jsxRuntime.jsx(
          "polyline",
          {
            points: svgPoints,
            fill: "rgba(100, 180, 255, 0.1)",
            stroke: "rgba(100, 180, 255, 0.8)",
            strokeWidth: 2,
            strokeDasharray: "6 4"
          }
        ),
        screenPoints.length >= 3 && /* @__PURE__ */ jsxRuntime.jsx(
          "line",
          {
            x1: last.x,
            y1: last.y,
            x2: first.x,
            y2: first.y,
            stroke: closeable ? "rgba(100, 255, 100, 0.8)" : "rgba(100, 180, 255, 0.3)",
            strokeWidth: closeable ? 2 : 1,
            strokeDasharray: "4 4"
          }
        ),
        screenPoints.map((p, i) => /* @__PURE__ */ jsxRuntime.jsx(
          "circle",
          {
            cx: p.x,
            cy: p.y,
            r: i === 0 && closeable ? 8 : 4,
            fill: i === 0 && closeable ? "rgba(100, 255, 100, 0.8)" : "rgba(100, 180, 255, 0.8)"
          },
          i
        )),
        points.length >= 2 && /* @__PURE__ */ jsxRuntime.jsxs(
          "text",
          {
            x: (first.x + last.x) / 2,
            y: (first.y + last.y) / 2 - 10,
            fill: "#e0e0e0",
            fontSize: 12,
            fontFamily: "system-ui",
            textAnchor: "middle",
            children: [
              points.length,
              " points ",
              closeable ? "(click first point to close)" : ""
            ]
          }
        )
      ]
    }
  );
}
function EditorInner({ onChange }) {
  const { store, viewport, spatialIndex } = seatmapReact.useSeatmapContext();
  const venue = zustand.useStore(store, (s) => s.venue);
  const selectedSeatIds = zustand.useStore(store, (s) => s.selectedSeatIds);
  const historyRef = react.useRef(new seatmapCore.CommandHistory());
  const [canUndo, setCanUndo] = react.useState(false);
  const [canRedo, setCanRedo] = react.useState(false);
  const panTool = react.useMemo(() => new PanTool(), []);
  const selectTool = react.useMemo(() => new SelectTool(spatialIndex, historyRef.current), [spatialIndex]);
  const [polygonPoints, setPolygonPoints] = react.useState([]);
  const [polygonCloseable, setPolygonCloseable] = react.useState(false);
  const addSectionTool = react.useMemo(
    () => {
      const tool = new AddSectionTool(historyRef.current);
      const v = store.getState().venue;
      if (v && v.categories.length > 0) tool.setCategoryId(v.categories[0].id);
      tool.onPointsChange = (pts, closeable) => {
        setPolygonPoints([...pts]);
        setPolygonCloseable(closeable);
      };
      return tool;
    },
    []
  );
  const addRowTool = react.useMemo(
    () => new AddRowTool(historyRef.current, spatialIndex),
    [spatialIndex]
  );
  const addSeatTool = react.useMemo(
    () => new AddSeatTool(historyRef.current, spatialIndex),
    [spatialIndex]
  );
  const toolMap = react.useMemo(
    () => ({
      pan: panTool,
      select: selectTool,
      "add-section": addSectionTool,
      "add-row": addRowTool,
      "add-seat": addSeatTool
    }),
    [panTool, selectTool, addSectionTool, addRowTool, addSeatTool]
  );
  const [activeToolName, setActiveToolName] = react.useState("pan");
  const activeToolRef = react.useRef(panTool);
  const [seatsPerRow, setSeatsPerRow] = react.useState(10);
  const handleSeatsPerRowChange = react.useCallback(
    (n) => {
      setSeatsPerRow(n);
      addRowTool.seatsPerRow = n;
    },
    [addRowTool]
  );
  const setActiveTool = react.useCallback(
    (name) => {
      activeToolRef.current.onDeactivate();
      const tool = toolMap[name] ?? selectTool;
      tool.onActivate(viewport, store);
      activeToolRef.current = tool;
      setActiveToolName(name);
    },
    [toolMap, selectTool, viewport, store]
  );
  react.useEffect(() => {
    const unsub = historyRef.current.subscribe(() => {
      setCanUndo(historyRef.current.canUndo);
      setCanRedo(historyRef.current.canRedo);
    });
    return unsub;
  }, []);
  react.useEffect(() => {
    if (venue) {
      spatialIndex.buildFromSections(venue.sections);
      onChange?.(venue);
    }
  }, [venue, spatialIndex, onChange]);
  const handleSave = react.useCallback(() => {
    const v = store.getState().venue;
    if (!v) return;
    const json = seatmapCore.serializeVenue(v);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${v.name.replace(/\s+/g, "_").toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [store]);
  const handleLoad = react.useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const loaded = seatmapCore.deserializeVenue(reader.result);
          store.getState().setVenue(loaded);
          spatialIndex.buildFromSections(loaded.sections);
          viewport.fitBounds(seatmapCore.venueAABB(loaded));
          historyRef.current.clear();
        } catch {
          alert("Invalid venue JSON file");
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }, [store, spatialIndex, viewport]);
  const handleFitView = react.useCallback(() => {
    if (!venue) return;
    viewport.fitBounds(seatmapCore.venueAABB(venue));
  }, [venue, viewport]);
  const handleUploadBackground = react.useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const v = store.getState().venue;
        if (!v) return;
        const dataUrl = reader.result;
        store.getState().setVenue({
          ...v,
          backgroundImage: dataUrl,
          backgroundImageOpacity: v.backgroundImageOpacity ?? 0.5
        });
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }, [store]);
  const handleRemoveBackground = react.useCallback(() => {
    const v = store.getState().venue;
    if (!v) return;
    store.getState().setVenue({
      ...v,
      backgroundImage: void 0,
      backgroundImageOpacity: void 0
    });
  }, [store]);
  const handleBackgroundOpacityChange = react.useCallback(
    (opacity) => {
      const v = store.getState().venue;
      if (!v) return;
      store.getState().setVenue({ ...v, backgroundImageOpacity: opacity });
    },
    [store]
  );
  const handleSelectSection = react.useCallback(
    (sectionId) => {
      if (!venue) return;
      const section = venue.sections.find((s) => s.id === sectionId);
      if (!section) return;
      const allSeatIds = section.rows.flatMap((r) => r.seats.map((s) => s.id));
      store.getState().setSelection(allSeatIds);
    },
    [venue, store]
  );
  react.useEffect(() => {
    const isTyping = () => {
      const tag = document.activeElement?.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
    };
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey) historyRef.current.redo();
        else historyRef.current.undo();
        return;
      }
      if (isTyping()) return;
      if (e.key === "v" || e.key === "1") setActiveTool("select");
      if (e.key === "h" || e.key === "2") setActiveTool("pan");
      if (e.key === "s" || e.key === "3") setActiveTool("add-section");
      if (e.key === "r" || e.key === "4") setActiveTool("add-row");
      if (e.key === "a" || e.key === "5") setActiveTool("add-seat");
      if (e.key === " ") {
        e.preventDefault();
        setActiveTool("pan");
      }
    };
    const upHandler = (e) => {
      if (isTyping()) return;
      if (e.key === " ") {
        setActiveTool("select");
      }
    };
    window.addEventListener("keydown", handler);
    window.addEventListener("keyup", upHandler);
    return () => {
      window.removeEventListener("keydown", handler);
      window.removeEventListener("keyup", upHandler);
    };
  }, [setActiveTool]);
  const handleCanvasPointerDown = react.useCallback(
    (e) => {
      if (e.button !== 0) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      const rect = e.currentTarget.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      const world = viewport.screenToWorld(screenX, screenY);
      const toolEvent = {
        worldX: world.x,
        worldY: world.y,
        screenX: e.clientX,
        screenY: e.clientY,
        shiftKey: e.shiftKey,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        button: e.button
      };
      activeToolRef.current.onPointerDown(toolEvent, viewport, store);
    },
    [viewport, store]
  );
  const handleCanvasPointerMove = react.useCallback(
    (e) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      const world = viewport.screenToWorld(screenX, screenY);
      const toolEvent = {
        worldX: world.x,
        worldY: world.y,
        screenX: e.clientX,
        screenY: e.clientY,
        shiftKey: e.shiftKey,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        button: e.button
      };
      activeToolRef.current.onPointerMove(toolEvent, viewport, store);
    },
    [viewport, store]
  );
  const handleCanvasPointerUp = react.useCallback(
    (e) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      const world = viewport.screenToWorld(screenX, screenY);
      const toolEvent = {
        worldX: world.x,
        worldY: world.y,
        screenX: e.clientX,
        screenY: e.clientY,
        shiftKey: e.shiftKey,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        button: e.button
      };
      activeToolRef.current.onPointerUp(toolEvent, viewport, store);
    },
    [viewport, store]
  );
  const sidebarStyle = {
    width: 260,
    background: "#1a1a2e",
    borderLeft: "1px solid #2a2a4a",
    overflowY: "auto",
    flexShrink: 0
  };
  return /* @__PURE__ */ jsxRuntime.jsxs("div", { style: { display: "flex", flexDirection: "column", width: "100%", height: "100%" }, children: [
    /* @__PURE__ */ jsxRuntime.jsx(
      Toolbar,
      {
        activeTool: activeToolName,
        onToolChange: setActiveTool,
        canUndo,
        canRedo,
        onUndo: () => historyRef.current.undo(),
        onRedo: () => historyRef.current.redo(),
        onFitView: handleFitView,
        onSave: handleSave,
        onLoad: handleLoad,
        seatsPerRow,
        onSeatsPerRowChange: handleSeatsPerRowChange
      }
    ),
    /* @__PURE__ */ jsxRuntime.jsxs("div", { style: { display: "flex", flex: 1, overflow: "hidden" }, children: [
      /* @__PURE__ */ jsxRuntime.jsxs(
        "div",
        {
          style: { flex: 1, position: "relative", cursor: (toolMap[activeToolName] ?? selectTool).cursor },
          onPointerDown: handleCanvasPointerDown,
          onPointerMove: handleCanvasPointerMove,
          onPointerUp: handleCanvasPointerUp,
          children: [
            /* @__PURE__ */ jsxRuntime.jsx(seatmapReact.SeatmapCanvas, { panOnLeftClick: false }),
            polygonPoints.length > 0 && /* @__PURE__ */ jsxRuntime.jsx(
              PolygonPreviewOverlay,
              {
                points: polygonPoints,
                closeable: polygonCloseable,
                viewport
              }
            )
          ]
        }
      ),
      /* @__PURE__ */ jsxRuntime.jsxs("div", { style: sidebarStyle, children: [
        /* @__PURE__ */ jsxRuntime.jsx(
          PropertyPanel,
          {
            venue,
            selectedSeatIds,
            history: historyRef.current,
            store,
            onUploadBackground: handleUploadBackground,
            onRemoveBackground: handleRemoveBackground,
            onBackgroundOpacityChange: handleBackgroundOpacityChange
          }
        ),
        /* @__PURE__ */ jsxRuntime.jsx("div", { style: { height: 1, background: "#2a2a4a", margin: "0 16px" } }),
        /* @__PURE__ */ jsxRuntime.jsx(
          LayerPanel,
          {
            venue,
            selectedSeatIds,
            onSelectSection: handleSelectSection
          }
        ),
        /* @__PURE__ */ jsxRuntime.jsx("div", { style: { height: 1, background: "#2a2a4a", margin: "0 16px" } }),
        /* @__PURE__ */ jsxRuntime.jsx(
          CategoryManager,
          {
            venue,
            history: historyRef.current,
            store
          }
        )
      ] })
    ] })
  ] });
}
function SeatmapEditor({ venue, onChange, className }) {
  return /* @__PURE__ */ jsxRuntime.jsx(seatmapReact.SeatmapProvider, { venue, children: /* @__PURE__ */ jsxRuntime.jsx("div", { className, style: { width: "100%", height: "100%" }, children: /* @__PURE__ */ jsxRuntime.jsx(EditorInner, { onChange }) }) });
}
var DrawGATool = class extends BaseTool {
  constructor(history) {
    super();
    this.history = history;
  }
  name = "draw-ga";
  cursor = "crosshair";
  points = [];
  capacity = 100;
  categoryId = "";
  onPointerDown(e, _viewport, store) {
    if (e.button !== 0) return;
    if (e.ctrlKey || e.metaKey) {
      this.finishPolygon(store);
      return;
    }
    this.points.push({ x: e.worldX, y: e.worldY });
  }
  finishPolygon(store) {
    if (this.points.length < 3) {
      this.points = [];
      return;
    }
    const venue = store.getState().venue;
    if (!venue) return;
    const area = {
      id: seatmapCore.generateId("ga"),
      label: `GA ${Date.now().toString(36).slice(-3).toUpperCase()}`,
      shape: [...this.points],
      capacity: this.capacity,
      categoryId: this.categoryId
    };
    this.history.execute({
      description: `Add GA area "${area.label}"`,
      execute: () => {
        const v = store.getState().venue;
        if (!v) return;
        store.getState().setVenue({
          ...v,
          gaAreas: [...v.gaAreas, area]
        });
      },
      undo: () => {
        const v = store.getState().venue;
        if (!v) return;
        store.getState().setVenue({
          ...v,
          gaAreas: v.gaAreas.filter((a) => a.id !== area.id)
        });
      }
    });
    this.points = [];
  }
  onDeactivate() {
    this.points = [];
  }
};
var AddTableTool = class extends BaseTool {
  constructor(history) {
    super();
    this.history = history;
  }
  name = "add-table";
  cursor = "crosshair";
  shape = "round";
  seatsPerTable = 8;
  tableRadius = 40;
  categoryId = "";
  onPointerDown(e, _viewport, store) {
    const venue = store.getState().venue;
    if (!venue) return;
    const seats = [];
    for (let i = 0; i < this.seatsPerTable; i++) {
      const angle = Math.PI * 2 * i / this.seatsPerTable - Math.PI / 2;
      seats.push({
        id: seatmapCore.generateId("seat"),
        label: `${i + 1}`,
        position: {
          x: Math.cos(angle) * this.tableRadius,
          y: Math.sin(angle) * this.tableRadius
        },
        status: "available",
        categoryId: this.categoryId
      });
    }
    const table = {
      id: seatmapCore.generateId("tbl"),
      label: `Table ${Date.now().toString(36).slice(-3).toUpperCase()}`,
      position: { x: e.worldX, y: e.worldY },
      shape: this.shape,
      seats,
      categoryId: this.categoryId
    };
    this.history.execute({
      description: `Add table "${table.label}"`,
      execute: () => {
        const v = store.getState().venue;
        if (!v) return;
        store.getState().setVenue({
          ...v,
          tables: [...v.tables, table]
        });
      },
      undo: () => {
        const v = store.getState().venue;
        if (!v) return;
        store.getState().setVenue({
          ...v,
          tables: v.tables.filter((t) => t.id !== table.id)
        });
      }
    });
  }
};

exports.AddRowTool = AddRowTool;
exports.AddSeatTool = AddSeatTool;
exports.AddSectionTool = AddSectionTool;
exports.AddTableTool = AddTableTool;
exports.BaseTool = BaseTool;
exports.CategoryManager = CategoryManager;
exports.DrawGATool = DrawGATool;
exports.LayerPanel = LayerPanel;
exports.PanTool = PanTool;
exports.PropertyPanel = PropertyPanel;
exports.SeatmapEditor = SeatmapEditor;
exports.SelectTool = SelectTool;
exports.Toolbar = Toolbar;
//# sourceMappingURL=index.cjs.map
//# sourceMappingURL=index.cjs.map