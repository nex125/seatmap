import { createContext, useContext, useRef, useEffect, useMemo, useCallback, useState, useSyncExternalStore } from 'react';
import { Viewport, SpatialIndex, CategoryTextureCache, LODLevel, getLODLevel, venueAABB, seatWorldPosition, sectionAABB } from '@ticketok/seatmap-core';
import { create, useStore } from 'zustand';
import { jsx, jsxs } from 'react/jsx-runtime';
import { Sprite, Graphics, Container, Texture, Application, Assets } from 'pixi.js';

// src/components/SeatmapProvider.tsx
var createSeatmapStore = () => create((set) => ({
  venue: null,
  selectedSeatIds: /* @__PURE__ */ new Set(),
  hoveredSeatId: null,
  setVenue: (venue) => set({ venue }),
  selectSeat: (seatId) => set((state) => ({
    selectedSeatIds: new Set(state.selectedSeatIds).add(seatId)
  })),
  deselectSeat: (seatId) => set((state) => {
    const next = new Set(state.selectedSeatIds);
    next.delete(seatId);
    return { selectedSeatIds: next };
  }),
  toggleSeat: (seatId) => set((state) => {
    const next = new Set(state.selectedSeatIds);
    if (next.has(seatId)) next.delete(seatId);
    else next.add(seatId);
    return { selectedSeatIds: next };
  }),
  clearSelection: () => set({ selectedSeatIds: /* @__PURE__ */ new Set() }),
  setSelection: (seatIds) => set({ selectedSeatIds: new Set(seatIds) }),
  setHoveredSeat: (seatId) => set({ hoveredSeatId: seatId })
}));
var SeatmapContext = createContext(null);
function useSeatmapContext() {
  const ctx = useContext(SeatmapContext);
  if (!ctx) {
    throw new Error("useSeatmapContext must be used within a SeatmapProvider");
  }
  return ctx;
}
function SeatmapProvider({ venue, children }) {
  const storeRef = useRef(createSeatmapStore());
  const viewportRef = useRef(new Viewport());
  const spatialIndexRef = useRef(new SpatialIndex());
  useEffect(() => {
    if (venue) {
      storeRef.current.getState().setVenue(venue);
      spatialIndexRef.current.buildFromSections(venue.sections);
    }
  }, [venue]);
  const contextValue = useMemo(
    () => ({
      store: storeRef.current,
      viewport: viewportRef.current,
      spatialIndex: spatialIndexRef.current
    }),
    []
  );
  return /* @__PURE__ */ jsx(SeatmapContext.Provider, { value: contextValue, children });
}
var SEAT_RADIUS = 7;
function SeatmapCanvas({
  width: propWidth,
  height: propHeight,
  className,
  panOnLeftClick = true,
  onSeatClick,
  onSeatHover
}) {
  const containerRef = useRef(null);
  const appRef = useRef(null);
  const worldRef = useRef(null);
  const textureCacheRef = useRef(new CategoryTextureCache());
  const isPanningRef = useRef(false);
  const lastPointerRef = useRef({ x: 0, y: 0 });
  const rafRef = useRef(0);
  const readyRef = useRef(false);
  const renderRef = useRef(() => {
  });
  const bgTextureRef = useRef(null);
  const bgUrlRef = useRef("");
  const touchesRef = useRef(/* @__PURE__ */ new Map());
  const lastPinchDistRef = useRef(null);
  const lastPinchCenterRef = useRef(null);
  const touchTapRef = useRef(null);
  const { store, viewport, spatialIndex } = useSeatmapContext();
  const venue = useStore(store, (s) => s.venue);
  const selectedSeatIds = useStore(store, (s) => s.selectedSeatIds);
  const hoveredSeatId = useStore(store, (s) => s.hoveredSeatId);
  const getCategoryColor = useCallback(
    (categoryId) => {
      if (!venue) return 6710886;
      const cat = venue.categories.find((c) => c.id === categoryId);
      if (!cat) return 6710886;
      return parseInt(cat.color.replace("#", ""), 16);
    },
    [venue]
  );
  const getSeatTexture = useCallback(
    (seat, isSelected, isHovered) => {
      if (isSelected) return "selected";
      if (isHovered) return "hovered";
      return seat.status;
    },
    []
  );
  const zoomToSection = useCallback(
    (section) => {
      const seats = section.rows.flatMap((r) => r.seats);
      if (seats.length === 0) return;
      const cos = Math.cos(section.rotation);
      const sin = Math.sin(section.rotation);
      const worldSeats = seats.map((s) => ({
        x: section.position.x + s.position.x * cos - s.position.y * sin,
        y: section.position.y + s.position.x * sin + s.position.y * cos
      }));
      const pad = 30;
      const aabb = {
        minX: Math.min(...worldSeats.map((p) => p.x)) - pad,
        minY: Math.min(...worldSeats.map((p) => p.y)) - pad,
        maxX: Math.max(...worldSeats.map((p) => p.x)) + pad,
        maxY: Math.max(...worldSeats.map((p) => p.y)) + pad
      };
      viewport.fitBounds(aabb, 60);
    },
    [viewport]
  );
  const scheduleRender = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      renderRef.current();
    });
  }, []);
  const renderSeat = useCallback(
    (parent, seat, sectionId) => {
      const isSelected = selectedSeatIds.has(seat.id);
      const isHovered = hoveredSeatId === seat.id;
      const textureKey = getSeatTexture(seat, isSelected, isHovered);
      const textures = textureCacheRef.current.get(seat.categoryId);
      const texture = textures[textureKey];
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5);
      sprite.position.set(seat.position.x, seat.position.y);
      sprite.eventMode = "static";
      sprite.cursor = seat.status === "available" ? "pointer" : "default";
      if (panOnLeftClick) {
        sprite.on("pointerdown", (ev) => {
          if (ev.pointerType === "touch") return;
          if (seat.status === "available") {
            store.getState().toggleSeat(seat.id);
            onSeatClick?.(seat.id, sectionId);
            scheduleRender();
          }
        });
      }
      sprite.on("pointerenter", (ev) => {
        if (ev.pointerType === "touch") return;
        store.getState().setHoveredSeat(seat.id);
        onSeatHover?.(seat.id, sectionId);
        scheduleRender();
      });
      sprite.on("pointerleave", (ev) => {
        if (ev.pointerType === "touch") return;
        if (store.getState().hoveredSeatId === seat.id) {
          store.getState().setHoveredSeat(null);
          onSeatHover?.(null, null);
          scheduleRender();
        }
      });
      parent.addChild(sprite);
    },
    [selectedSeatIds, hoveredSeatId, store, onSeatClick, onSeatHover, getSeatTexture, scheduleRender, panOnLeftClick]
  );
  const renderGAArea = useCallback(
    (parent, ga) => {
      if (ga.shape.length < 3) return;
      const catColor = getCategoryColor(ga.categoryId);
      const g = new Graphics();
      g.poly(ga.shape.flatMap((p) => [p.x, p.y]));
      g.fill({ color: catColor, alpha: 0.25 });
      g.stroke({ color: catColor, width: 2, alpha: 0.6 });
      parent.addChild(g);
    },
    [getCategoryColor]
  );
  const renderTable = useCallback(
    (parent, table) => {
      const container = new Container();
      container.position.set(table.position.x, table.position.y);
      container.label = `table-${table.id}`;
      const catColor = getCategoryColor(table.categoryId);
      const g = new Graphics();
      if (table.shape === "round") {
        const radius = table.seats.length > 0 ? Math.max(...table.seats.map(
          (s) => Math.hypot(s.position.x, s.position.y)
        )) * 0.65 : 30;
        g.circle(0, 0, radius);
      } else {
        const halfW = 50;
        const halfH = 30;
        g.roundRect(-halfW, -halfH, halfW * 2, halfH * 2, 4);
      }
      g.fill({ color: catColor, alpha: 0.2 });
      g.stroke({ color: catColor, width: 2 });
      container.addChild(g);
      for (const seat of table.seats) {
        renderSeat(container, seat, table.id);
      }
      parent.addChild(container);
    },
    [getCategoryColor, renderSeat]
  );
  const renderSection = useCallback(
    (parent, section, lod, _visibleAABB) => {
      const sectionContainer = new Container();
      sectionContainer.label = `section-${section.id}`;
      const catColor = getCategoryColor(section.categoryId);
      if (lod === LODLevel.Overview) {
        const g = new Graphics();
        if (section.outline.length > 2) {
          g.poly(section.outline.flatMap((p) => [p.x, p.y]));
          g.fill({ color: catColor, alpha: 0.5 });
          g.stroke({ color: catColor, width: 2 });
        } else {
          const seats = section.rows.flatMap((r) => r.seats);
          if (seats.length > 0) {
            const xs = seats.map((s) => s.position.x);
            const ys = seats.map((s) => s.position.y);
            const pad = 15;
            const minX = Math.min(...xs);
            const minY = Math.min(...ys);
            g.roundRect(
              minX - pad,
              minY - pad,
              Math.max(...xs) - minX + pad * 2,
              Math.max(...ys) - minY + pad * 2,
              8
            );
            g.fill({ color: catColor, alpha: 0.4 });
            g.stroke({ color: catColor, width: 2 });
          }
        }
        g.eventMode = "static";
        g.cursor = "pointer";
        let downPos = null;
        g.on("pointerdown", (ev) => {
          downPos = { x: ev.globalX, y: ev.globalY };
        });
        g.on("pointerup", (ev) => {
          if (!downPos) return;
          const dist = Math.hypot(ev.globalX - downPos.x, ev.globalY - downPos.y);
          downPos = null;
          if (dist < 6) {
            zoomToSection(section);
          }
        });
        g.on("pointerupoutside", () => {
          downPos = null;
        });
        sectionContainer.addChild(g);
      } else if (lod === LODLevel.Section) {
        if (section.outline.length > 2) {
          const bg = new Graphics();
          bg.poly(section.outline.flatMap((p) => [p.x, p.y]));
          bg.fill({ color: catColor, alpha: 0.3 });
          bg.stroke({ color: catColor, width: 2, alpha: 0.6 });
          sectionContainer.addChild(bg);
        }
        for (const row of section.rows) {
          if (row.seats.length < 2) continue;
          const g = new Graphics();
          g.moveTo(row.seats[0].position.x, row.seats[0].position.y);
          for (let i = 1; i < row.seats.length; i++) {
            g.lineTo(row.seats[i].position.x, row.seats[i].position.y);
          }
          g.stroke({ color: catColor, width: 4, alpha: 0.7 });
          sectionContainer.addChild(g);
        }
      } else {
        if (section.outline.length > 2) {
          const bg = new Graphics();
          bg.poly(section.outline.flatMap((p) => [p.x, p.y]));
          bg.fill({ color: catColor, alpha: 0.15 });
          bg.stroke({ color: catColor, width: 1.5, alpha: 0.5 });
          sectionContainer.addChild(bg);
        }
        for (const row of section.rows) {
          for (const seat of row.seats) {
            renderSeat(sectionContainer, seat, section.id);
          }
        }
      }
      sectionContainer.position.set(section.position.x, section.position.y);
      sectionContainer.rotation = section.rotation;
      parent.addChild(sectionContainer);
    },
    [getCategoryColor, selectedSeatIds, hoveredSeatId, getSeatTexture, zoomToSection, renderSeat]
  );
  const renderScene = useCallback(() => {
    const world = worldRef.current;
    if (!world || !venue || !readyRef.current) return;
    world.removeChildren();
    const zoom = viewport.zoom;
    const lod = getLODLevel(zoom);
    world.position.set(viewport.x * zoom, viewport.y * zoom);
    world.scale.set(zoom);
    const boundsG = new Graphics();
    boundsG.rect(0, 0, venue.bounds.width, venue.bounds.height);
    boundsG.fill({ color: 1973818, alpha: 0.3 });
    boundsG.stroke({ color: 4868730, width: 2 });
    world.addChild(boundsG);
    if (bgTextureRef.current && bgTextureRef.current !== Texture.EMPTY) {
      const bgSprite = new Sprite(bgTextureRef.current);
      bgSprite.position.set(0, 0);
      bgSprite.width = venue.bounds.width;
      bgSprite.height = venue.bounds.height;
      bgSprite.alpha = venue.backgroundImageOpacity ?? 0.5;
      world.addChild(bgSprite);
    }
    const visibleAABB = viewport.getVisibleAABB();
    const visibleItems = spatialIndex.queryViewport(visibleAABB);
    const visibleSectionIds = new Set(visibleItems.map((item) => item.sectionId));
    for (const section of venue.sections) {
      if (!visibleSectionIds.has(section.id)) continue;
      renderSection(world, section, lod, visibleAABB);
    }
    for (const ga of venue.gaAreas) {
      renderGAArea(world, ga);
    }
    for (const table of venue.tables) {
      renderTable(world, table);
    }
  }, [venue, viewport, spatialIndex, renderSection, renderGAArea, renderTable]);
  renderRef.current = renderScene;
  useEffect(() => {
    if (!containerRef.current) return;
    const app = new Application();
    let destroyed = false;
    app.init({
      resizeTo: propWidth ? void 0 : containerRef.current,
      width: propWidth,
      height: propHeight,
      background: 1710638,
      antialias: true,
      autoDensity: true,
      resolution: window.devicePixelRatio || 1
    }).then(() => {
      if (destroyed) {
        app.destroy(true);
        return;
      }
      containerRef.current.appendChild(app.canvas);
      appRef.current = app;
      const worldContainer = new Container();
      worldContainer.label = "world";
      app.stage.addChild(worldContainer);
      worldRef.current = worldContainer;
      const w = app.screen.width;
      const h = app.screen.height;
      viewport.setScreenSize(w, h);
      const currentVenue = store.getState().venue;
      if (currentVenue) {
        textureCacheRef.current.create(app.renderer, currentVenue.categories, SEAT_RADIUS);
        viewport.fitBounds(venueAABB(currentVenue));
      }
      readyRef.current = true;
      scheduleRender();
    });
    return () => {
      destroyed = true;
      readyRef.current = false;
      cancelAnimationFrame(rafRef.current);
      textureCacheRef.current.destroy();
      if (appRef.current) {
        appRef.current.destroy(true, { children: true });
        appRef.current = null;
      }
    };
  }, []);
  const prevVenueIdRef = useRef(null);
  const prevCatJsonRef = useRef("");
  useEffect(() => {
    if (!venue || !appRef.current || !readyRef.current) return;
    const catJson = JSON.stringify(venue.categories);
    if (catJson !== prevCatJsonRef.current) {
      prevCatJsonRef.current = catJson;
      textureCacheRef.current.create(appRef.current.renderer, venue.categories, SEAT_RADIUS);
    }
    if (prevVenueIdRef.current !== venue.id) {
      prevVenueIdRef.current = venue.id;
      viewport.fitBounds(venueAABB(venue));
    }
  }, [venue]);
  useEffect(() => {
    const url = venue?.backgroundImage ?? "";
    if (url === bgUrlRef.current) return;
    bgUrlRef.current = url;
    if (!url) {
      if (bgTextureRef.current && bgTextureRef.current !== Texture.EMPTY) {
        bgTextureRef.current.destroy(true);
      }
      bgTextureRef.current = null;
      scheduleRender();
      return;
    }
    let cancelled = false;
    const cacheKey = `bg_${url.slice(0, 64)}`;
    Assets.load({ src: url, alias: cacheKey }).then((tex) => {
      if (cancelled) return;
      bgTextureRef.current = tex;
      scheduleRender();
    }).catch(() => {
      if (cancelled) return;
      bgTextureRef.current = null;
      scheduleRender();
    });
    return () => {
      cancelled = true;
    };
  }, [venue?.backgroundImage, scheduleRender]);
  useEffect(() => {
    const unsub = viewport.subscribe(scheduleRender);
    return unsub;
  }, [viewport, scheduleRender]);
  useEffect(() => {
    scheduleRender();
  }, [venue, selectedSeatIds, hoveredSeatId, scheduleRender]);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handleWheel = (e) => {
      e.preventDefault();
      let dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 40;
      else if (e.deltaMode === 2) dy *= 800;
      dy = Math.max(-300, Math.min(300, dy));
      const factor = Math.pow(2, -dy / 600);
      const rect = el.getBoundingClientRect();
      viewport.zoomAt(
        { x: e.clientX - rect.left, y: e.clientY - rect.top },
        factor
      );
    };
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [viewport]);
  const handlePointerDown = useCallback(
    (e) => {
      if (e.pointerType === "touch") return;
      const shouldPan = e.button === 1 || e.button === 0 && e.altKey || e.button === 0 && panOnLeftClick;
      if (shouldPan) {
        isPanningRef.current = true;
        lastPointerRef.current = { x: e.clientX, y: e.clientY };
        e.target.setPointerCapture(e.pointerId);
      }
    },
    [panOnLeftClick]
  );
  const handlePointerMove = useCallback(
    (e) => {
      if (e.pointerType === "touch") return;
      if (!isPanningRef.current) return;
      const dx = e.clientX - lastPointerRef.current.x;
      const dy = e.clientY - lastPointerRef.current.y;
      lastPointerRef.current = { x: e.clientX, y: e.clientY };
      viewport.pan(dx, dy);
    },
    [viewport]
  );
  const handlePointerUp = useCallback(() => {
    isPanningRef.current = false;
  }, []);
  const handleTouchStart = useCallback(
    (e) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        touchesRef.current.set(t.identifier, { x: t.clientX, y: t.clientY });
      }
      if (touchesRef.current.size === 1) {
        const [pt] = [...touchesRef.current.values()];
        lastPointerRef.current = { x: pt.x, y: pt.y };
        touchTapRef.current = { x: pt.x, y: pt.y, time: Date.now() };
      } else {
        touchTapRef.current = null;
        if (touchesRef.current.size === 2) {
          const points = [...touchesRef.current.values()];
          lastPinchDistRef.current = Math.hypot(
            points[1].x - points[0].x,
            points[1].y - points[0].y
          );
          lastPinchCenterRef.current = {
            x: (points[0].x + points[1].x) / 2,
            y: (points[0].y + points[1].y) / 2
          };
        }
      }
    },
    []
  );
  const handleTouchMove = useCallback(
    (e) => {
      e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        touchesRef.current.set(t.identifier, { x: t.clientX, y: t.clientY });
      }
      if (touchTapRef.current) {
        const t = e.changedTouches[0];
        const dist = Math.hypot(t.clientX - touchTapRef.current.x, t.clientY - touchTapRef.current.y);
        if (dist > 10) {
          touchTapRef.current = null;
          if (store.getState().hoveredSeatId) {
            store.getState().setHoveredSeat(null);
            onSeatHover?.(null, null);
            scheduleRender();
          }
        }
      }
      const points = [...touchesRef.current.values()];
      if (points.length === 1) {
        const prev = lastPointerRef.current;
        const dx = points[0].x - prev.x;
        const dy = points[0].y - prev.y;
        lastPointerRef.current = { x: points[0].x, y: points[0].y };
        viewport.pan(dx, dy);
      } else if (points.length >= 2) {
        const dist = Math.hypot(
          points[1].x - points[0].x,
          points[1].y - points[0].y
        );
        const center = {
          x: (points[0].x + points[1].x) / 2,
          y: (points[0].y + points[1].y) / 2
        };
        if (lastPinchDistRef.current != null && lastPinchCenterRef.current != null) {
          const factor = dist / lastPinchDistRef.current;
          const rect = containerRef.current?.getBoundingClientRect();
          if (rect) {
            viewport.zoomAt(
              { x: center.x - rect.left, y: center.y - rect.top },
              factor
            );
          }
          const dx = center.x - lastPinchCenterRef.current.x;
          const dy = center.y - lastPinchCenterRef.current.y;
          viewport.pan(dx, dy);
        }
        lastPinchDistRef.current = dist;
        lastPinchCenterRef.current = center;
      }
    },
    [viewport, store, onSeatHover, scheduleRender]
  );
  const handleTouchEnd = useCallback(
    (e) => {
      const wasTap = touchTapRef.current;
      for (let i = 0; i < e.changedTouches.length; i++) {
        touchesRef.current.delete(e.changedTouches[i].identifier);
      }
      if (touchesRef.current.size < 2) {
        lastPinchDistRef.current = null;
        lastPinchCenterRef.current = null;
      }
      if (touchesRef.current.size === 1) {
        const [pt] = [...touchesRef.current.values()];
        lastPointerRef.current = { x: pt.x, y: pt.y };
      }
      if (wasTap && touchesRef.current.size === 0 && Date.now() - wasTap.time < 300) {
        touchTapRef.current = null;
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const screenX = wasTap.x - rect.left;
        const screenY = wasTap.y - rect.top;
        const world = viewport.screenToWorld(screenX, screenY);
        const hitRadius = Math.min(20, 14 / viewport.zoom);
        const hits = spatialIndex.queryPoint(world, hitRadius);
        const seatHits = hits.filter((h) => h.type === "seat" && h.seatId);
        if (seatHits.length > 0) {
          let closest = seatHits[0];
          let closestDist = Infinity;
          for (const hit of seatHits) {
            const cx = (hit.minX + hit.maxX) / 2;
            const cy = (hit.minY + hit.maxY) / 2;
            const d = Math.hypot(cx - world.x, cy - world.y);
            if (d < closestDist) {
              closestDist = d;
              closest = hit;
            }
          }
          const v = store.getState().venue;
          if (!v || !closest.seatId) return;
          for (const sec of v.sections) {
            for (const row of sec.rows) {
              const seat = row.seats.find((s) => s.id === closest.seatId);
              if (seat && seat.status === "available") {
                store.getState().toggleSeat(seat.id);
                store.getState().setHoveredSeat(seat.id);
                onSeatClick?.(seat.id, closest.sectionId);
                onSeatHover?.(seat.id, closest.sectionId);
                scheduleRender();
                return;
              }
            }
          }
        } else {
          if (store.getState().hoveredSeatId) {
            store.getState().setHoveredSeat(null);
            onSeatHover?.(null, null);
            scheduleRender();
          }
        }
      }
      touchTapRef.current = null;
    },
    [viewport, spatialIndex, store, onSeatClick, onSeatHover, scheduleRender]
  );
  return /* @__PURE__ */ jsx(
    "div",
    {
      ref: containerRef,
      className,
      style: {
        width: propWidth ?? "100%",
        height: propHeight ?? "100%",
        position: "relative",
        overflow: "hidden",
        touchAction: "none",
        cursor: panOnLeftClick ? "grab" : "inherit"
      },
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onPointerCancel: handlePointerUp,
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
      onTouchCancel: handleTouchEnd
    }
  );
}
function DefaultTooltip({ data }) {
  return /* @__PURE__ */ jsxs(
    "div",
    {
      style: {
        background: "rgba(26, 26, 46, 0.95)",
        border: "1px solid #2a2a4a",
        borderRadius: 8,
        padding: "8px 14px",
        color: "#e0e0e0",
        fontSize: 13,
        fontFamily: "system-ui",
        pointerEvents: "none",
        whiteSpace: "nowrap"
      },
      children: [
        /* @__PURE__ */ jsx("div", { style: { fontWeight: 600, marginBottom: 2 }, children: data.section.label }),
        /* @__PURE__ */ jsxs("div", { children: [
          "Row ",
          data.row.label,
          ", Seat ",
          data.seat.label
        ] }),
        /* @__PURE__ */ jsx("div", { style: { color: "#9e9e9e", fontSize: 12, marginTop: 2 }, children: data.seat.status === "available" ? "Available" : data.seat.status })
      ]
    }
  );
}
function TooltipOverlay({ renderTooltip, style }) {
  const { store, viewport } = useSeatmapContext();
  const hoveredSeatId = useStore(store, (s) => s.hoveredSeatId);
  const venue = useStore(store, (s) => s.venue);
  const [tooltipData, setTooltipData] = useState(null);
  const containerRef = useRef(null);
  useEffect(() => {
    if (!hoveredSeatId || !venue) {
      setTooltipData(null);
      return;
    }
    for (const section of venue.sections) {
      for (const row of section.rows) {
        const seat = row.seats.find((s) => s.id === hoveredSeatId);
        if (seat) {
          const worldPos = seatWorldPosition(section, seat);
          const screenPos = viewport.worldToScreen(worldPos.x, worldPos.y);
          setTooltipData({
            seat,
            row,
            section,
            screenX: screenPos.x,
            screenY: screenPos.y
          });
          return;
        }
      }
    }
    setTooltipData(null);
  }, [hoveredSeatId, venue, viewport]);
  useEffect(() => {
    if (!tooltipData) return;
    const unsub = viewport.subscribe(() => {
      if (!store.getState().hoveredSeatId) return;
      const section = venue?.sections.find((s) => s.id === tooltipData.section.id);
      if (!section) return;
      const worldPos = seatWorldPosition(section, tooltipData.seat);
      const screenPos = viewport.worldToScreen(worldPos.x, worldPos.y);
      setTooltipData(
        (prev) => prev ? { ...prev, screenX: screenPos.x, screenY: screenPos.y } : null
      );
    });
    return unsub;
  }, [tooltipData?.seat.id, venue, viewport, store]);
  if (!tooltipData) return null;
  return /* @__PURE__ */ jsx(
    "div",
    {
      ref: containerRef,
      style: {
        position: "absolute",
        left: tooltipData.screenX + 12,
        top: tooltipData.screenY - 10,
        zIndex: 10,
        pointerEvents: "none",
        transform: "translateY(-100%)",
        ...style
      },
      children: renderTooltip ? renderTooltip(tooltipData) : /* @__PURE__ */ jsx(DefaultTooltip, { data: tooltipData })
    }
  );
}
function Minimap({ width = 180, height = 120, style }) {
  const canvasRef = useRef(null);
  const { store, viewport } = useSeatmapContext();
  const venue = useStore(store, (s) => s.venue);
  useEffect(() => {
    if (!venue) return;
    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "rgba(26, 26, 46, 0.9)";
      ctx.fillRect(0, 0, width, height);
      const bounds = venueAABB(venue);
      const contentW = bounds.maxX - bounds.minX;
      const contentH = bounds.maxY - bounds.minY;
      if (contentW <= 0 || contentH <= 0) return;
      const pad = 8;
      const scaleX = (width - pad * 2) / contentW;
      const scaleY = (height - pad * 2) / contentH;
      const scale = Math.min(scaleX, scaleY);
      const offsetX = pad + (width - pad * 2 - contentW * scale) / 2;
      const offsetY = pad + (height - pad * 2 - contentH * scale) / 2;
      const toMinimap = (wx, wy) => ({
        x: offsetX + (wx - bounds.minX) * scale,
        y: offsetY + (wy - bounds.minY) * scale
      });
      for (const section of venue.sections) {
        const box = sectionAABB(section);
        const tl = toMinimap(box.minX, box.minY);
        const br = toMinimap(box.maxX, box.maxY);
        const cat = venue.categories.find((c) => c.id === section.categoryId);
        ctx.fillStyle = cat ? cat.color + "80" : "rgba(100,100,100,0.5)";
        ctx.fillRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
      }
      const visAABB = viewport.getVisibleAABB();
      const vtl = toMinimap(visAABB.minX, visAABB.minY);
      const vbr = toMinimap(visAABB.maxX, visAABB.maxY);
      ctx.strokeStyle = "rgba(255,255,255,0.6)";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(vtl.x, vtl.y, vbr.x - vtl.x, vbr.y - vtl.y);
    };
    draw();
    const unsub = viewport.subscribe(draw);
    return unsub;
  }, [venue, viewport, width, height]);
  if (!venue) return null;
  return /* @__PURE__ */ jsx(
    "canvas",
    {
      ref: canvasRef,
      style: {
        width,
        height,
        borderRadius: 6,
        border: "1px solid #2a2a4a",
        ...style
      }
    }
  );
}
function useViewport() {
  const { viewport, store } = useSeatmapContext();
  const state = useSyncExternalStore(
    (cb) => viewport.subscribe(cb),
    () => viewport.getState()
  );
  const pan = useCallback(
    (dx, dy) => viewport.pan(dx, dy),
    [viewport]
  );
  const zoomAt = useCallback(
    (x, y, factor) => viewport.zoomAt({ x, y }, factor),
    [viewport]
  );
  const fitToVenue = useCallback(() => {
    const venue = store.getState().venue;
    if (!venue) return;
    viewport.fitBounds(venueAABB(venue));
  }, [viewport, store]);
  return { ...state, pan, zoomAt, fitToVenue, viewport };
}
function useSelection() {
  const { store } = useSeatmapContext();
  const selectedSeatIds = useStore(store, (s) => s.selectedSeatIds);
  const toggleSeat = useStore(store, (s) => s.toggleSeat);
  const clearSelection = useStore(store, (s) => s.clearSelection);
  const setSelection = useStore(store, (s) => s.setSelection);
  return { selectedSeatIds, toggleSeat, clearSelection, setSelection };
}
function useSeatmap() {
  const { store, viewport, spatialIndex } = useSeatmapContext();
  const venue = useStore(store, (s) => s.venue);
  const setVenue = useStore(store, (s) => s.setVenue);
  const hoveredSeatId = useStore(store, (s) => s.hoveredSeatId);
  const setHoveredSeat = useStore(store, (s) => s.setHoveredSeat);
  return { venue, setVenue, hoveredSeatId, setHoveredSeat, viewport, spatialIndex };
}
function useSeatStatus() {
  const { store } = useSeatmapContext();
  const updateSeatStatus = useCallback(
    (seatId, status) => {
      const venue = store.getState().venue;
      if (!venue) return;
      const updated = updateVenueSeatStatus(venue, seatId, status);
      if (updated) {
        store.getState().setVenue(updated);
      }
    },
    [store]
  );
  const updateBulkStatus = useCallback(
    (updates) => {
      let venue = store.getState().venue;
      if (!venue) return;
      for (const { seatId, status } of updates) {
        const result = updateVenueSeatStatus(venue, seatId, status);
        if (result) venue = result;
      }
      store.getState().setVenue(venue);
    },
    [store]
  );
  return { updateSeatStatus, updateBulkStatus };
}
function updateVenueSeatStatus(venue, seatId, status) {
  for (let si = 0; si < venue.sections.length; si++) {
    const section = venue.sections[si];
    for (let ri = 0; ri < section.rows.length; ri++) {
      const row = section.rows[ri];
      const seatIdx = row.seats.findIndex((s) => s.id === seatId);
      if (seatIdx !== -1) {
        const newSeats = [...row.seats];
        newSeats[seatIdx] = { ...newSeats[seatIdx], status };
        const newRows = [...section.rows];
        newRows[ri] = { ...row, seats: newSeats };
        const newSections = [...venue.sections];
        newSections[si] = { ...section, rows: newRows };
        return { ...venue, sections: newSections };
      }
    }
  }
  return null;
}

export { Minimap, SeatmapCanvas, SeatmapContext, SeatmapProvider, TooltipOverlay, createSeatmapStore, useSeatStatus, useSeatmap, useSeatmapContext, useSelection, useViewport };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map