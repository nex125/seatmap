import { useCallback, useEffect, useRef } from "react";
import { Application, Container, Graphics, Sprite, Texture, Assets } from "pixi.js";
import {
  getLODLevel,
  LODLevel,
  venueAABB,
  CategoryTextureCache,
  AVAILABLE_STATUS_ID,
} from "@nex125/seatmap-core";
import type {
  Section,
  Seat,
  PricingCategory,
  AABB,
  GeneralAdmissionArea,
  Table,
} from "@nex125/seatmap-core";
import { useSeatmapContext } from "../context/SeatmapContext";
import { useStore } from "zustand";

const SEAT_RADIUS = 7;

export interface SeatmapCanvasProps {
  width?: number;
  height?: number;
  className?: string;
  /** When true, left-click drag pans the map (viewer mode). Default: true. */
  panOnLeftClick?: boolean;
  onSeatClick?: (seatId: string, sectionId: string) => void;
  onSeatHover?: (seatId: string | null, sectionId: string | null) => void;
}

export function SeatmapCanvas({
  width: propWidth,
  height: propHeight,
  className,
  panOnLeftClick = true,
  onSeatClick,
  onSeatHover,
}: SeatmapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const worldRef = useRef<Container | null>(null);
  const textureCacheRef = useRef(new CategoryTextureCache());
  const isPanningRef = useRef(false);
  const lastPointerRef = useRef({ x: 0, y: 0 });
  const rafRef = useRef<number>(0);
  const readyRef = useRef(false);

  // Stable ref that always points to the latest render function
  const renderRef = useRef<() => void>(() => {});

  // Background image texture cache
  const bgTextureRef = useRef<Texture | null>(null);
  const bgUrlRef = useRef<string>("");

  // Touch tracking
  const touchesRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const lastPinchDistRef = useRef<number | null>(null);
  const lastPinchCenterRef = useRef<{ x: number; y: number } | null>(null);

  // Touch tap detection — handled at the container level, not per-sprite
  const touchTapRef = useRef<{ x: number; y: number; time: number } | null>(null);

  const { store, viewport, spatialIndex } = useSeatmapContext();
  const venue = useStore(store, (s) => s.venue);
  const selectedSeatIds = useStore(store, (s) => s.selectedSeatIds);
  const hoveredSeatId = useStore(store, (s) => s.hoveredSeatId);

  const getCategoryColor = useCallback(
    (categoryId: string): number => {
      if (!venue) return 0x666666;
      const cat = venue.categories.find((c: PricingCategory) => c.id === categoryId);
      if (!cat) return 0x666666;
      return parseInt(cat.color.replace("#", ""), 16);
    },
    [venue],
  );

  const getSeatTexture = useCallback(
    (seat: Seat, isSelected: boolean, isHovered: boolean): string => {
      if (isSelected) return "selected";
      if (isHovered) return "hovered";
      return seat.status;
    },
    [],
  );

  const zoomToSection = useCallback(
    (section: Section) => {
      const seats = section.rows.flatMap((r) => r.seats);
      if (seats.length === 0) return;

      const cos = Math.cos(section.rotation);
      const sin = Math.sin(section.rotation);
      const worldSeats = seats.map((s) => ({
        x: section.position.x + s.position.x * cos - s.position.y * sin,
        y: section.position.y + s.position.x * sin + s.position.y * cos,
      }));

      const pad = 30;
      const aabb: AABB = {
        minX: Math.min(...worldSeats.map((p) => p.x)) - pad,
        minY: Math.min(...worldSeats.map((p) => p.y)) - pad,
        maxX: Math.max(...worldSeats.map((p) => p.x)) + pad,
        maxY: Math.max(...worldSeats.map((p) => p.y)) + pad,
      };

      viewport.fitBounds(aabb, 60);
    },
    [viewport],
  );

  // scheduleRender always calls the latest renderRef
  const scheduleRender = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      renderRef.current();
    });
  }, []);

  const renderSeat = useCallback(
    (parent: Container, seat: Seat, sectionId: string) => {
      const isSelected = selectedSeatIds.has(seat.id);
      const isHovered = hoveredSeatId === seat.id;
      const textureKey = getSeatTexture(seat, isSelected, isHovered);
      const textures = textureCacheRef.current.get(seat.categoryId);
      const texture = textures?.[textureKey] ?? textures?.[AVAILABLE_STATUS_ID];
      if (!texture) return;

      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5);
      sprite.position.set(seat.position.x, seat.position.y);
      sprite.eventMode = "static";
      sprite.cursor = seat.status === AVAILABLE_STATUS_ID ? "pointer" : "default";

      if (panOnLeftClick) {
        // Viewer mode: sprite handles mouse clicks directly.
        // Touch taps are handled at the container level via spatial index.
        sprite.on("pointerdown", (ev) => {
          if (ev.pointerType === "touch") return;
          if (seat.status === AVAILABLE_STATUS_ID) {
            store.getState().toggleSeat(seat.id);
            onSeatClick?.(seat.id, sectionId);
            scheduleRender();
          }
        });
      }
      // Editor mode (panOnLeftClick=false): clicks handled by the tool system,
      // sprite events are disabled to avoid conflicts with drag operations.

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
    [selectedSeatIds, hoveredSeatId, store, onSeatClick, onSeatHover, getSeatTexture, scheduleRender, panOnLeftClick],
  );

  const renderGAArea = useCallback(
    (parent: Container, ga: GeneralAdmissionArea) => {
      if (ga.shape.length < 3) return;
      const catColor = getCategoryColor(ga.categoryId);
      const g = new Graphics();
      g.poly(ga.shape.flatMap((p) => [p.x, p.y]));
      g.fill({ color: catColor, alpha: 0.25 });
      g.stroke({ color: catColor, width: 2, alpha: 0.6 });
      parent.addChild(g);
    },
    [getCategoryColor],
  );

  const renderTable = useCallback(
    (parent: Container, table: Table) => {
      const container = new Container();
      container.position.set(table.position.x, table.position.y);
      container.label = `table-${table.id}`;

      const catColor = getCategoryColor(table.categoryId);
      const g = new Graphics();

      if (table.shape === "round") {
        const radius = table.seats.length > 0
          ? Math.max(...table.seats.map((s) =>
              Math.hypot(s.position.x, s.position.y),
            )) * 0.65
          : 30;
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
    [getCategoryColor, renderSeat],
  );

  const renderSection = useCallback(
    (parent: Container, section: Section, lod: LODLevel, _visibleAABB: AABB) => {
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
              8,
            );
            g.fill({ color: catColor, alpha: 0.4 });
            g.stroke({ color: catColor, width: 2 });
          }
        }

        g.eventMode = "static";
        g.cursor = "pointer";

        let downPos: { x: number; y: number } | null = null;
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
        g.on("pointerupoutside", () => { downPos = null; });

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
    [getCategoryColor, selectedSeatIds, hoveredSeatId, getSeatTexture, zoomToSection, renderSeat],
  );

  const renderScene = useCallback(() => {
    const world = worldRef.current;
    if (!world || !venue || !readyRef.current) return;

    world.removeChildren();

    const zoom = viewport.zoom;
    const lod = getLODLevel(zoom);

    world.position.set(viewport.x * zoom, viewport.y * zoom);
    world.scale.set(zoom);

    // Draw venue bounds so even an empty canvas shows the working area
    const boundsG = new Graphics();
    boundsG.rect(0, 0, venue.bounds.width, venue.bounds.height);
    boundsG.fill({ color: 0x1e1e3a, alpha: 0.3 });
    boundsG.stroke({ color: 0x4a4a7a, width: 2 });
    world.addChild(boundsG);

    // Render background image if loaded (configurable size and position)
    if (bgTextureRef.current && bgTextureRef.current !== Texture.EMPTY) {
      const tex = bgTextureRef.current;
      const imgW = tex.width;
      const imgH = tex.height;
      const scale = Math.min(venue.bounds.width / imgW, venue.bounds.height / imgH);
      const fallbackWidth = imgW * scale;
      const fallbackHeight = imgH * scale;
      const scaledW = Math.max(1, venue.backgroundImageWidth ?? fallbackWidth);
      const scaledH = Math.max(1, venue.backgroundImageHeight ?? fallbackHeight);

      const bgSprite = new Sprite(tex);
      bgSprite.width = scaledW;
      bgSprite.height = scaledH;
      const bgX = venue.backgroundImageX ?? ((venue.bounds.width - scaledW) / 2);
      const bgY = venue.backgroundImageY ?? ((venue.bounds.height - scaledH) / 2);
      bgSprite.position.set(
        bgX,
        bgY,
      );
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

    appRef.current?.render();
  }, [venue, viewport, spatialIndex, renderSection, renderGAArea, renderTable]);

  // Keep renderRef always pointing to the latest renderScene
  renderRef.current = renderScene;

  // PixiJS initialization — uses renderRef so it never has a stale closure
  useEffect(() => {
    if (!containerRef.current) return;

    const app = new Application();
    let destroyed = false;

    app
      .init({
        resizeTo: propWidth ? undefined : containerRef.current,
        width: propWidth,
        height: propHeight,
        background: 0x1a1a2e,
        antialias: true,
        autoDensity: true,
        resolution: window.devicePixelRatio || 1,
        autoStart: false,
      })
      .then(() => {
        if (destroyed) {
          app.destroy(true);
          return;
        }
        containerRef.current!.appendChild(app.canvas as HTMLCanvasElement);
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
          textureCacheRef.current.create(
            app.renderer,
            currentVenue.categories,
            currentVenue.seatStatuses,
            SEAT_RADIUS,
          );
          viewport.fitBounds(venueAABB(currentVenue));
        }

        readyRef.current = true;
        // Use renderRef so we always call the latest version
        scheduleRender();
      });

    return () => {
      destroyed = true;
      readyRef.current = false;
      cancelAnimationFrame(rafRef.current);
      if (appRef.current) {
        appRef.current.destroy(true, { children: true });
        appRef.current = null;
      }
      textureCacheRef.current.destroy();
    };
  }, []);

  // Rebuild textures only when categories change, fit view only on first venue load
  const prevVenueIdRef = useRef<string | null>(null);
  const prevCatJsonRef = useRef<string>("");
  useEffect(() => {
    if (!venue || !appRef.current || !readyRef.current) return;

    const catJson = JSON.stringify({ categories: venue.categories, statuses: venue.seatStatuses });
    if (catJson !== prevCatJsonRef.current) {
      prevCatJsonRef.current = catJson;
      textureCacheRef.current.create(
        appRef.current.renderer,
        venue.categories,
        venue.seatStatuses,
        SEAT_RADIUS,
      );
      worldRef.current?.removeChildren();
    }

    if (prevVenueIdRef.current !== venue.id) {
      prevVenueIdRef.current = venue.id;
      viewport.fitBounds(venueAABB(venue));
    }
  }, [venue]);

  // Load background image texture when it changes
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
    Assets.load<Texture>({ src: url, alias: cacheKey }).then((tex) => {
      if (cancelled) return;
      bgTextureRef.current = tex;
      scheduleRender();
    }).catch(() => {
      if (cancelled) return;
      bgTextureRef.current = null;
      scheduleRender();
    });

    return () => { cancelled = true; };
  }, [venue?.backgroundImage, scheduleRender]);

  // Re-render when viewport changes
  useEffect(() => {
    const unsub = viewport.subscribe(scheduleRender);
    return unsub;
  }, [viewport, scheduleRender]);

  // Re-render when data changes
  useEffect(() => {
    scheduleRender();
  }, [venue, selectedSeatIds, hoveredSeatId, scheduleRender]);

  // Wheel zoom — native DOM listener with { passive: false }
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      let dy = e.deltaY;

      if (e.deltaMode === 1) dy *= 40;
      else if (e.deltaMode === 2) dy *= 800;

      dy = Math.max(-300, Math.min(300, dy));
      const factor = Math.pow(2, -dy / 600);

      const rect = el.getBoundingClientRect();
      viewport.zoomAt(
        { x: e.clientX - rect.left, y: e.clientY - rect.top },
        factor,
      );
    };

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [viewport]);

  // Pan — left-click drag in viewer mode, alt+click/middle-click in editor mode
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType === "touch") return;
      const shouldPan =
        e.button === 1 ||
        (e.button === 0 && e.altKey) ||
        (e.button === 0 && panOnLeftClick);
      if (shouldPan) {
        isPanningRef.current = true;
        lastPointerRef.current = { x: e.clientX, y: e.clientY };
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
      }
    },
    [panOnLeftClick],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType === "touch") return;
      if (!isPanningRef.current) return;
      const dx = e.clientX - lastPointerRef.current.x;
      const dy = e.clientY - lastPointerRef.current.y;
      lastPointerRef.current = { x: e.clientX, y: e.clientY };
      viewport.pan(dx, dy);
    },
    [viewport],
  );

  const handlePointerUp = useCallback(() => {
    isPanningRef.current = false;
  }, []);

  // Touch gesture handling
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        touchesRef.current.set(t.identifier, { x: t.clientX, y: t.clientY });
      }

      if (touchesRef.current.size === 1) {
        const [pt] = [...touchesRef.current.values()];
        lastPointerRef.current = { x: pt.x, y: pt.y };
        // Track potential single-finger tap
        touchTapRef.current = { x: pt.x, y: pt.y, time: Date.now() };
      } else {
        // Multi-touch → not a tap
        touchTapRef.current = null;

        if (touchesRef.current.size === 2) {
          const points = [...touchesRef.current.values()];
          lastPinchDistRef.current = Math.hypot(
            points[1].x - points[0].x,
            points[1].y - points[0].y,
          );
          lastPinchCenterRef.current = {
            x: (points[0].x + points[1].x) / 2,
            y: (points[0].y + points[1].y) / 2,
          };
        }
      }
    },
    [],
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        touchesRef.current.set(t.identifier, { x: t.clientX, y: t.clientY });
      }

      // Cancel tap if finger moved significantly
      if (touchTapRef.current) {
        const t = e.changedTouches[0];
        const dist = Math.hypot(t.clientX - touchTapRef.current.x, t.clientY - touchTapRef.current.y);
        if (dist > 10) {
          touchTapRef.current = null;
          // Dismiss tooltip when starting a pan/pinch
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
          points[1].y - points[0].y,
        );
        const center = {
          x: (points[0].x + points[1].x) / 2,
          y: (points[0].y + points[1].y) / 2,
        };

        if (lastPinchDistRef.current != null && lastPinchCenterRef.current != null) {
          const factor = dist / lastPinchDistRef.current;
          const rect = containerRef.current?.getBoundingClientRect();
          if (rect) {
            viewport.zoomAt(
              { x: center.x - rect.left, y: center.y - rect.top },
              factor,
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
    [viewport, store, onSeatHover, scheduleRender],
  );

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      // Check for tap before removing touches
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

      // Single-finger tap → hit test via spatial index, pick the closest seat
      if (wasTap && touchesRef.current.size === 0 && Date.now() - wasTap.time < 300) {
        touchTapRef.current = null;
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const screenX = wasTap.x - rect.left;
        const screenY = wasTap.y - rect.top;
        const world = viewport.screenToWorld(screenX, screenY);

        // Finger-sized hit area in world units, scaled by zoom
        const hitRadius = Math.min(20, 14 / viewport.zoom);
        const hits = spatialIndex.queryPoint(world, hitRadius);
        const seatHits = hits.filter((h) => h.type === "seat" && h.seatId);

        if (seatHits.length > 0) {
          // Pick the seat whose center is closest to the tap point
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
              if (seat && seat.status === AVAILABLE_STATUS_ID) {
                store.getState().toggleSeat(seat.id);
                // Show tooltip on tap (since there's no hover on touch)
                store.getState().setHoveredSeat(seat.id);
                onSeatClick?.(seat.id, closest.sectionId);
                onSeatHover?.(seat.id, closest.sectionId);
                scheduleRender();
                return;
              }
            }
          }
        } else {
          // Tapped empty space — dismiss tooltip
          if (store.getState().hoveredSeatId) {
            store.getState().setHoveredSeat(null);
            onSeatHover?.(null, null);
            scheduleRender();
          }
        }
      }
      touchTapRef.current = null;
    },
    [viewport, spatialIndex, store, onSeatClick, onSeatHover, scheduleRender],
  );

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        width: propWidth ?? "100%",
        height: propHeight ?? "100%",
        position: "relative",
        overflow: "hidden",
        touchAction: "none",
        cursor: panOnLeftClick ? "grab" : "inherit",
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    />
  );
}
