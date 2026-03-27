'use strict';

var RBush = require('rbush');
var pixi_js = require('pixi.js');

function _interopDefault (e) { return e && e.__esModule ? e : { default: e }; }

var RBush__default = /*#__PURE__*/_interopDefault(RBush);

// src/models/helpers.ts
function seatWorldPosition(section, seat) {
  const cos = Math.cos(section.rotation);
  const sin = Math.sin(section.rotation);
  return {
    x: section.position.x + seat.position.x * cos - seat.position.y * sin,
    y: section.position.y + seat.position.x * sin + seat.position.y * cos
  };
}
function sectionAABB(section) {
  const allPoints = [];
  if (section.outline.length > 0) {
    const cos = Math.cos(section.rotation);
    const sin = Math.sin(section.rotation);
    for (const p of section.outline) {
      allPoints.push({
        x: section.position.x + p.x * cos - p.y * sin,
        y: section.position.y + p.x * sin + p.y * cos
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
      maxY: section.position.y
    };
  }
  const pad = 10;
  return {
    minX: Math.min(...allPoints.map((p) => p.x)) - pad,
    minY: Math.min(...allPoints.map((p) => p.y)) - pad,
    maxX: Math.max(...allPoints.map((p) => p.x)) + pad,
    maxY: Math.max(...allPoints.map((p) => p.y)) + pad
  };
}
function venueAABB(venue) {
  if (venue.sections.length === 0) {
    return { minX: 0, minY: 0, maxX: venue.bounds.width, maxY: venue.bounds.height };
  }
  const boxes = venue.sections.map(sectionAABB);
  return {
    minX: Math.min(...boxes.map((b) => b.minX)),
    minY: Math.min(...boxes.map((b) => b.minY)),
    maxX: Math.max(...boxes.map((b) => b.maxX)),
    maxY: Math.max(...boxes.map((b) => b.maxY))
  };
}
function pointInPolygon(point, polygon) {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    if (yi > point.y !== yj > point.y && point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}
function clampToPolygon(point, polygon, margin = 5) {
  if (polygon.length < 3 || pointInPolygon(point, polygon)) return point;
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
    if (d < bestDist) {
      bestDist = d;
      bestX = cx;
      bestY = cy;
    }
  }
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
      if (d < bestDist) {
        bestDist = d;
        bestX = cx;
        bestY = cy;
      }
    }
  }
  return { x: bestX, y: bestY };
}
var _nextId = 1;
function generateId(prefix = "") {
  return `${prefix}${prefix ? "-" : ""}${Date.now().toString(36)}-${(_nextId++).toString(36)}`;
}
var SpatialIndex = class {
  tree = new RBush__default.default();
  items = [];
  buildFromSections(sections) {
    this.items = [];
    for (const section of sections) {
      const box = sectionAABB(section);
      this.items.push({
        ...box,
        type: "section",
        sectionId: section.id
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
            seatId: seat.id
          });
        }
      }
    }
    this.tree.clear();
    this.tree.load(this.items);
  }
  queryViewport(viewport) {
    return this.tree.search(viewport);
  }
  queryPoint(point, radius = 8) {
    return this.tree.search({
      minX: point.x - radius,
      minY: point.y - radius,
      maxX: point.x + radius,
      maxY: point.y + radius
    });
  }
  queryRect(rect) {
    return this.tree.search(rect);
  }
};

// src/rendering/Viewport.ts
var MIN_ZOOM = 0.05;
var MAX_ZOOM = 4;
var Viewport = class {
  x = 0;
  y = 0;
  zoom = 1;
  screenWidth = 0;
  screenHeight = 0;
  listeners = /* @__PURE__ */ new Set();
  setScreenSize(width, height) {
    this.screenWidth = width;
    this.screenHeight = height;
    this.notify();
  }
  pan(dx, dy) {
    this.x += dx / this.zoom;
    this.y += dy / this.zoom;
    this.notify();
  }
  zoomAt(screenPoint, factor) {
    const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.zoom * factor));
    const wx = screenPoint.x / this.zoom - this.x;
    const wy = screenPoint.y / this.zoom - this.y;
    this.x = screenPoint.x / newZoom - wx;
    this.y = screenPoint.y / newZoom - wy;
    this.zoom = newZoom;
    this.notify();
  }
  setZoom(zoom) {
    this.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
    this.notify();
  }
  fitBounds(aabb, padding = 40) {
    const contentW = aabb.maxX - aabb.minX;
    const contentH = aabb.maxY - aabb.minY;
    if (contentW <= 0 || contentH <= 0) return;
    const scaleX = (this.screenWidth - padding * 2) / contentW;
    const scaleY = (this.screenHeight - padding * 2) / contentH;
    this.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min(scaleX, scaleY)));
    this.x = -(aabb.minX + contentW / 2) + this.screenWidth / (2 * this.zoom);
    this.y = -(aabb.minY + contentH / 2) + this.screenHeight / (2 * this.zoom);
    this.notify();
  }
  screenToWorld(screenX, screenY) {
    return {
      x: screenX / this.zoom - this.x,
      y: screenY / this.zoom - this.y
    };
  }
  worldToScreen(worldX, worldY) {
    return {
      x: (worldX + this.x) * this.zoom,
      y: (worldY + this.y) * this.zoom
    };
  }
  getVisibleAABB() {
    const topLeft = this.screenToWorld(0, 0);
    const bottomRight = this.screenToWorld(this.screenWidth, this.screenHeight);
    return {
      minX: topLeft.x,
      minY: topLeft.y,
      maxX: bottomRight.x,
      maxY: bottomRight.y
    };
  }
  getState() {
    return { x: this.x, y: this.y, zoom: this.zoom };
  }
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  notify() {
    for (const listener of this.listeners) {
      listener();
    }
  }
};

// src/rendering/LODLevel.ts
var LODLevel = /* @__PURE__ */ ((LODLevel2) => {
  LODLevel2["Overview"] = "overview";
  LODLevel2["Section"] = "section";
  LODLevel2["Detail"] = "detail";
  return LODLevel2;
})(LODLevel || {});
var SECTION_THRESHOLD = 0.3;
var DETAIL_THRESHOLD = 0.7;
function getLODLevel(zoom) {
  if (zoom < SECTION_THRESHOLD) return "overview" /* Overview */;
  if (zoom < DETAIL_THRESHOLD) return "section" /* Section */;
  return "detail" /* Detail */;
}
var STATUS_COLORS = {
  available: 5025616,
  held: 16750592,
  sold: 10395294,
  blocked: 16007990,
  selected: 2201331,
  hovered: 6600182
};
function createSeatTextures(renderer, radius = 7, categoryColor, textureResolution) {
  const result = {};
  const diameter = (radius + 4) * 2;
  const resolution = textureResolution ?? 4 * (typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
  for (const [status, color] of Object.entries(STATUS_COLORS)) {
    const g = new pixi_js.Graphics();
    const fillColor = status === "available" && categoryColor != null ? categoryColor : color;
    g.circle(radius + 4, radius + 4, radius);
    g.fill({ color: fillColor });
    if (status === "selected") {
      g.circle(radius + 4, radius + 4, radius + 2);
      g.stroke({ color: 16777215, width: 2 });
    }
    const texture = pixi_js.RenderTexture.create({ width: diameter, height: diameter, resolution });
    renderer.render({ container: g, target: texture });
    g.destroy();
    result[status] = texture;
  }
  return result;
}
function destroySeatTextures(textures) {
  for (const tex of Object.values(textures)) {
    tex.destroy(true);
  }
}

// src/rendering/CategoryTextureCache.ts
var CategoryTextureCache = class {
  cache = /* @__PURE__ */ new Map();
  defaultTextures = null;
  create(renderer, categories, seatRadius = 7) {
    this.destroy();
    this.defaultTextures = createSeatTextures(renderer, seatRadius);
    for (const cat of categories) {
      const color = parseInt(cat.color.replace("#", ""), 16);
      this.cache.set(cat.id, createSeatTextures(renderer, seatRadius, color));
    }
  }
  get(categoryId) {
    return this.cache.get(categoryId) ?? this.defaultTextures;
  }
  destroy() {
    for (const textures of this.cache.values()) {
      destroySeatTextures(textures);
    }
    if (this.defaultTextures) {
      destroySeatTextures(this.defaultTextures);
    }
    this.cache.clear();
    this.defaultTextures = null;
  }
};

// src/commands/CommandHistory.ts
var CommandHistory = class {
  undoStack = [];
  redoStack = [];
  listeners = /* @__PURE__ */ new Set();
  execute(command) {
    command.execute();
    this.undoStack.push(command);
    this.redoStack = [];
    this.notify();
  }
  undo() {
    const command = this.undoStack.pop();
    if (!command) return;
    command.undo();
    this.redoStack.push(command);
    this.notify();
  }
  redo() {
    const command = this.redoStack.pop();
    if (!command) return;
    command.execute();
    this.undoStack.push(command);
    this.notify();
  }
  get canUndo() {
    return this.undoStack.length > 0;
  }
  get canRedo() {
    return this.redoStack.length > 0;
  }
  clear() {
    this.undoStack = [];
    this.redoStack = [];
    this.notify();
  }
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  notify() {
    for (const listener of this.listeners) {
      listener();
    }
  }
};

// src/serialization/index.ts
function serializeVenue(venue) {
  return JSON.stringify(venue, null, 2);
}
function deserializeVenue(json) {
  return JSON.parse(json);
}

exports.CategoryTextureCache = CategoryTextureCache;
exports.CommandHistory = CommandHistory;
exports.LODLevel = LODLevel;
exports.SpatialIndex = SpatialIndex;
exports.Viewport = Viewport;
exports.clampToPolygon = clampToPolygon;
exports.createSeatTextures = createSeatTextures;
exports.deserializeVenue = deserializeVenue;
exports.destroySeatTextures = destroySeatTextures;
exports.generateId = generateId;
exports.getLODLevel = getLODLevel;
exports.pointInPolygon = pointInPolygon;
exports.seatWorldPosition = seatWorldPosition;
exports.sectionAABB = sectionAABB;
exports.serializeVenue = serializeVenue;
exports.venueAABB = venueAABB;
//# sourceMappingURL=index.cjs.map
//# sourceMappingURL=index.cjs.map