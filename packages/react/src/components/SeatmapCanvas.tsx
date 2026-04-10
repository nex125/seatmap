import { useCallback, useEffect, useRef } from "react";
import { Application, Container, Graphics, Sprite, Texture, Assets, Text } from "pixi.js";
import {
  getLODLevel,
  LODLevel,
  venueAABB,
  CategoryTextureCache,
  AVAILABLE_STATUS_ID,
  isAreaSeatSection,
  isStageSection,
  pointInPolygon,
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
const SNAP_GRID_STEP = 20;
const MAJOR_GRID_EVERY = 5;
const SECTION_DOT_ALPHA = 0.4;
const SECTION_DOT_RADIUS = 1.4;
const MAX_SECTION_DOTS = 12000;
const SECTION_CROSS_SIZE = 2.6;

function getSectionLabelPosition(section: Section): { x: number; y: number } | null {
  const points = section.outline.length > 2
    ? section.outline
    : section.rows.flatMap((row) => row.seats.map((seat) => seat.position));
  if (points.length === 0) return null;

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    y: (Math.min(...ys) + Math.max(...ys)) / 2,
  };
}

function getSectionLocalBounds(section: Section): { minX: number; minY: number; maxX: number; maxY: number } | null {
  const points = section.outline.length > 2
    ? section.outline
    : section.rows.flatMap((row) => row.seats.map((seat) => seat.position));
  if (points.length === 0) return null;

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

function sectionLocalToWorld(section: Section, local: { x: number; y: number }): { x: number; y: number } {
  const cos = Math.cos(section.rotation);
  const sin = Math.sin(section.rotation);
  return {
    x: section.position.x + local.x * cos - local.y * sin,
    y: section.position.y + local.x * sin + local.y * cos,
  };
}

function isWorldPointVisible(point: { x: number; y: number }, visibleAABB: AABB, margin = 0): boolean {
  return (
    point.x >= visibleAABB.minX - margin &&
    point.x <= visibleAABB.maxX + margin &&
    point.y >= visibleAABB.minY - margin &&
    point.y <= visibleAABB.maxY + margin
  );
}

function drawRoundedPolygonPath(
  graphics: Graphics,
  points: Array<{ x: number; y: number }>,
  cornerRadius: number,
): boolean {
  if (points.length < 3) return false;
  const radius = Math.max(0, cornerRadius);
  if (radius <= 0) {
    graphics.poly(points.flatMap((p) => [p.x, p.y]));
    return true;
  }

  const starts: Array<{ x: number; y: number }> = [];
  const ends: Array<{ x: number; y: number }> = [];

  for (let i = 0; i < points.length; i++) {
    const prev = points[(i - 1 + points.length) % points.length]!;
    const current = points[i]!;
    const next = points[(i + 1) % points.length]!;

    const inVecX = prev.x - current.x;
    const inVecY = prev.y - current.y;
    const outVecX = next.x - current.x;
    const outVecY = next.y - current.y;
    const inLen = Math.hypot(inVecX, inVecY);
    const outLen = Math.hypot(outVecX, outVecY);

    if (inLen < 1e-4 || outLen < 1e-4) {
      starts.push({ x: current.x, y: current.y });
      ends.push({ x: current.x, y: current.y });
      continue;
    }

    const limitedRadius = Math.min(radius, inLen / 2, outLen / 2);
    const inUnitX = inVecX / inLen;
    const inUnitY = inVecY / inLen;
    const outUnitX = outVecX / outLen;
    const outUnitY = outVecY / outLen;

    starts.push({
      x: current.x + inUnitX * limitedRadius,
      y: current.y + inUnitY * limitedRadius,
    });
    ends.push({
      x: current.x + outUnitX * limitedRadius,
      y: current.y + outUnitY * limitedRadius,
    });
  }

  graphics.moveTo(starts[0]!.x, starts[0]!.y);
  for (let i = 0; i < points.length; i++) {
    const current = points[i]!;
    const end = ends[i]!;
    const nextStart = starts[(i + 1) % points.length]!;
    graphics.quadraticCurveTo(current.x, current.y, end.x, end.y);
    graphics.lineTo(nextStart.x, nextStart.y);
  }
  graphics.closePath();
  return true;
}

export interface SeatmapCanvasProps {
  width?: number;
  height?: number;
  className?: string;
  /** When true, left-click drag pans the map (viewer mode). Default: true. */
  panOnLeftClick?: boolean;
  /** When true, render a positioning grid inside venue bounds. Default: false. */
  showGrid?: boolean;
  /** When true, render global snap grid lines. Default: false. */
  showGridLines?: boolean;
  /** When true, render section-local snap dots beneath section content. Default: false. */
  showSectionGridDots?: boolean;
  /** Style for canvas grid line rendering. Default: "solid". */
  canvasGridLineStyle?: "solid" | "dashed" | "dotted";
  /** Style for section snap markers. Default: "dots". */
  sectionGridMarkerStyle?: "dots" | "cross";
  /** When true, render section labels. Default: false. */
  showSectionLabels?: boolean;
  /** When false, disables seat hover state updates and tooltip triggers. Default: true. */
  enableSeatHover?: boolean;
  onSeatClick?: (seatId: string, sectionId: string) => void;
  onSeatHover?: (seatId: string | null, sectionId: string | null) => void;
}

export function SeatmapCanvas({
  width: propWidth,
  height: propHeight,
  className,
  panOnLeftClick = true,
  showGrid = false,
  showGridLines,
  showSectionGridDots,
  canvasGridLineStyle = "solid",
  sectionGridMarkerStyle = "dots",
  showSectionLabels = false,
  enableSeatHover = true,
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
  const labelTextCacheRef = useRef<Map<string, Text>>(new Map());

  // Touch tracking
  const touchesRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const lastPinchDistRef = useRef<number | null>(null);
  const lastPinchCenterRef = useRef<{ x: number; y: number } | null>(null);

  // Touch tap detection — handled at the container level, not per-sprite
  const touchTapRef = useRef<{ x: number; y: number; time: number } | null>(null);

  const { store, viewport, spatialIndex } = useSeatmapContext();
  const isGridLinesVisible = showGridLines ?? showGrid;
  const isSectionDotsVisible = showSectionGridDots ?? showGrid;
  const venue = useStore(store, (s) => s.venue);
  const selectedSeatIds = useStore(store, (s) => s.selectedSeatIds);
  const selectedSectionIds = useStore(store, (s) => s.selectedSectionIds);
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
  const isSeatInteractable = useCallback(
    (seat: Seat): boolean => seat.status === AVAILABLE_STATUS_ID || selectedSeatIds.has(seat.id),
    [selectedSeatIds],
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
    if (!readyRef.current) return;
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      if (!readyRef.current) return;
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
      const canToggleSeat = isSeatInteractable(seat);

      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5);
      sprite.position.set(seat.position.x, seat.position.y);
      sprite.eventMode = "static";
      sprite.cursor = canToggleSeat ? "pointer" : "default";

      if (panOnLeftClick) {
        // Viewer mode: sprite handles mouse clicks directly.
        // Touch taps are handled at the container level via spatial index.
        sprite.on("pointerdown", (ev) => {
          if (ev.pointerType === "touch") return;
          if (canToggleSeat) {
            store.getState().toggleSeat(seat.id);
            onSeatClick?.(seat.id, sectionId);
            scheduleRender();
          }
        });
      }
      // Editor mode (panOnLeftClick=false): clicks handled by the tool system,
      // sprite events are disabled to avoid conflicts with drag operations.

      if (enableSeatHover) {
        sprite.on("pointerenter", (ev) => {
          if (ev.pointerType === "touch") return;
          if (isPanningRef.current) return;
          if (store.getState().hoveredSeatId === seat.id) return;
          store.getState().setHoveredSeat(seat.id);
          onSeatHover?.(seat.id, sectionId);
        });

        sprite.on("pointerleave", (ev) => {
          if (ev.pointerType === "touch") return;
          if (isPanningRef.current) return;
          if (store.getState().hoveredSeatId === seat.id) {
            store.getState().setHoveredSeat(null);
            onSeatHover?.(null, null);
          }
        });
      }

      parent.addChild(sprite);
    },
    [selectedSeatIds, hoveredSeatId, store, onSeatClick, onSeatHover, getSeatTexture, scheduleRender, panOnLeftClick, enableSeatHover, isSeatInteractable],
  );

  const renderDancefloorSeatArea = useCallback(
    (parent: Container, section: Section, seat: Seat) => {
      const isSelected = selectedSeatIds.has(seat.id);
      const isHovered = hoveredSeatId === seat.id;
      const sectionColor = getCategoryColor(seat.categoryId || section.categoryId);
      const fillAlpha = isSelected ? 0.5 : isHovered ? 0.4 : 0.26;
      const strokeColor = isSelected ? 0x4dabf7 : sectionColor;
      const strokeWidth = isSelected ? 3 : 2;
      const canToggleSeat = isSeatInteractable(seat);

      const area = new Graphics();
      if (section.outline.length >= 3) {
        drawRoundedPolygonPath(area, section.outline, 8);
      } else {
        const bounds = getSectionLocalBounds(section);
        if (!bounds) return;
        area.rect(bounds.minX, bounds.minY, bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
      }
      area.fill({ color: sectionColor, alpha: fillAlpha });
      area.stroke({ color: strokeColor, width: strokeWidth, alpha: 0.95, join: "round" });

      if (panOnLeftClick) {
        area.eventMode = "static";
        area.cursor = canToggleSeat ? "pointer" : "default";
        area.on("pointerdown", (ev) => {
          if (ev.pointerType === "touch") return;
          if (canToggleSeat) {
            store.getState().toggleSeat(seat.id);
            onSeatClick?.(seat.id, section.id);
            scheduleRender();
          }
        });
      } else {
        area.eventMode = "none";
      }

      if (enableSeatHover) {
        area.on("pointerenter", (ev) => {
          if (ev.pointerType === "touch") return;
          if (isPanningRef.current) return;
          if (store.getState().hoveredSeatId === seat.id) return;
          store.getState().setHoveredSeat(seat.id);
          onSeatHover?.(seat.id, section.id);
        });
        area.on("pointerleave", (ev) => {
          if (ev.pointerType === "touch") return;
          if (isPanningRef.current) return;
          if (store.getState().hoveredSeatId === seat.id) {
            store.getState().setHoveredSeat(null);
            onSeatHover?.(null, null);
          }
        });
      }

      parent.addChild(area);
    },
    [
      selectedSeatIds,
      hoveredSeatId,
      getCategoryColor,
      panOnLeftClick,
      store,
      onSeatClick,
      scheduleRender,
      enableSeatHover,
      onSeatHover,
      isSeatInteractable,
    ],
  );

  const renderGAArea = useCallback(
    (parent: Container, ga: GeneralAdmissionArea) => {
      if (ga.shape.length < 3) return;
      const catColor = getCategoryColor(ga.categoryId);
      const g = new Graphics();
      g.poly(ga.shape.flatMap((p) => [p.x, p.y]));
      g.fill({ color: catColor, alpha: 0.25 });
      g.stroke({ color: catColor, width: 2, alpha: 0.6, join: "round" });
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
    (parent: Container, section: Section, lod: LODLevel, zoom: number, visibleAABB: AABB) => {
      const sectionContainer = new Container();
      sectionContainer.label = `section-${section.id}`;

      const catColor = getCategoryColor(section.categoryId);
      if (isSectionDotsVisible && lod !== LODLevel.Overview) {
        const dotLayer = new Graphics();
        const sourcePoints = section.outline.length > 2
          ? section.outline
          : section.rows.flatMap((row) => row.seats.map((seat) => seat.position));

        if (sourcePoints.length > 0) {
          const xs = sourcePoints.map((p) => p.x);
          const ys = sourcePoints.map((p) => p.y);
          const minX = Math.min(...xs);
          const maxX = Math.max(...xs);
          const minY = Math.min(...ys);
          const maxY = Math.max(...ys);
          const hasOutline = section.outline.length > 2;

          let step = SNAP_GRID_STEP;
          while (
            ((Math.floor((maxX - minX) / step) + 1) * (Math.floor((maxY - minY) / step) + 1)) > MAX_SECTION_DOTS &&
            step < SNAP_GRID_STEP * 8
          ) {
            step *= 2;
          }

          const startX = Math.ceil(minX / step) * step;
          const endX = Math.floor(maxX / step) * step;
          const startY = Math.ceil(minY / step) * step;
          const endY = Math.floor(maxY / step) * step;

          for (let y = startY; y <= endY; y += step) {
            for (let x = startX; x <= endX; x += step) {
              if (hasOutline && !pointInPolygon({ x, y }, section.outline)) continue;
              if (sectionGridMarkerStyle === "cross") {
                dotLayer.moveTo(x - SECTION_CROSS_SIZE, y);
                dotLayer.lineTo(x + SECTION_CROSS_SIZE, y);
                dotLayer.moveTo(x, y - SECTION_CROSS_SIZE);
                dotLayer.lineTo(x, y + SECTION_CROSS_SIZE);
              } else {
                dotLayer.circle(x, y, SECTION_DOT_RADIUS);
              }
            }
          }
          if (sectionGridMarkerStyle === "cross") {
            dotLayer.stroke({
              color: 0xb6b0ae,
              alpha: SECTION_DOT_ALPHA,
              width: 0.8,
            });
          } else {
            dotLayer.fill({ color: 0xb6b0ae, alpha: SECTION_DOT_ALPHA });
          }
          sectionContainer.addChild(dotLayer);
        }
      }

      if (lod === LODLevel.Overview) {
        const g = new Graphics();
        if (section.outline.length > 2) {
          drawRoundedPolygonPath(g, section.outline, 8);
          g.fill({ color: catColor, alpha: 0.5 });
          g.stroke({ color: catColor, width: 2, join: "round" });
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
              12,
            );
            g.fill({ color: catColor, alpha: 0.4 });
            g.stroke({ color: catColor, width: 2, join: "round" });
          }
        }

        if (panOnLeftClick) {
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
        }

        sectionContainer.addChild(g);
      } else if (lod === LODLevel.Section) {
        if (section.outline.length > 2) {
          const bg = new Graphics();
          drawRoundedPolygonPath(bg, section.outline, 8);
          bg.fill({ color: catColor, alpha: 0.3 });
          bg.stroke({ color: catColor, width: 2, alpha: 0.6, join: "round" });
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
          drawRoundedPolygonPath(bg, section.outline, 8);
          bg.fill({ color: catColor, alpha: 0.15 });
          bg.stroke({ color: catColor, width: 1.5, alpha: 0.5, join: "round" });
          sectionContainer.addChild(bg);
        }
        if (isAreaSeatSection(section)) {
          const areaSeat = section.rows.flatMap((row) => row.seats)[0];
          if (areaSeat) {
            renderDancefloorSeatArea(sectionContainer, section, areaSeat);
          }
        } else {
          for (const row of section.rows) {
            for (const seat of row.seats) {
              renderSeat(sectionContainer, seat, section.id);
            }
          }
        }
      }

      const shouldShowFixedAreaLabel = isStageSection(section) || isAreaSeatSection(section);
      if ((showSectionLabels && lod !== LODLevel.Detail) || shouldShowFixedAreaLabel) {
        const bounds = getSectionLocalBounds(section);
        const localWidth = bounds ? bounds.maxX - bounds.minX : 0;
        const localHeight = bounds ? bounds.maxY - bounds.minY : 0;
        const pixelWidth = localWidth * zoom;
        const pixelHeight = localHeight * zoom;
        const canShowOverviewLabel =
          shouldShowFixedAreaLabel || lod !== LODLevel.Overview || (pixelWidth >= 80 && pixelHeight >= 36);
        const labelPos = getSectionLabelPosition(section);
        const sectionLabelWorld = labelPos ? sectionLocalToWorld(section, labelPos) : null;
        const sectionLabelVisible = sectionLabelWorld
          ? isWorldPointVisible(sectionLabelWorld, visibleAABB, 30 / Math.max(zoom, 0.0001))
          : false;
        if ((shouldShowFixedAreaLabel || (canShowOverviewLabel && sectionLabelVisible)) && labelPos && section.label.trim().length > 0) {
          const sectionLabelKey = `section:${section.id}:${lod}:${section.label}`;
          let sectionLabel = labelTextCacheRef.current.get(sectionLabelKey);
          if (!sectionLabel) {
            const textResolution = 1;
            sectionLabel = new Text({
              text: section.label,
              resolution: textResolution,
              style: {
                fill: 0xffffff,
                fontSize: lod === LODLevel.Overview ? 68 : 60,
                fontWeight: "700",
                stroke: { color: 0x111126, width: 6 },
                padding: 6,
              },
            });
            sectionLabel.eventMode = "none";
            labelTextCacheRef.current.set(sectionLabelKey, sectionLabel);
          }
          sectionLabel.anchor.set(0.5);
          sectionLabel.position.set(labelPos.x, labelPos.y);
          sectionLabel.rotation = -section.rotation;
          sectionLabel.alpha = lod === LODLevel.Overview ? 1 : 0.95;
          sectionContainer.addChild(sectionLabel);
        }
      }

      sectionContainer.position.set(section.position.x, section.position.y);
      sectionContainer.rotation = section.rotation;

      if (selectedSectionIds.has(section.id)) {
        const highlight = new Graphics();
        if (section.outline.length > 2) {
          drawRoundedPolygonPath(highlight, section.outline, 8);
        } else {
          const seats = section.rows.flatMap((r) => r.seats);
          if (seats.length > 0) {
            const xs = seats.map((s) => s.position.x);
            const ys = seats.map((s) => s.position.y);
            const pad = 10;
            const minX = Math.min(...xs) - pad;
            const minY = Math.min(...ys) - pad;
            const maxX = Math.max(...xs) + pad;
            const maxY = Math.max(...ys) + pad;
            highlight.rect(minX, minY, maxX - minX, maxY - minY);
          }
        }
        highlight.stroke({ color: 0x4dabf7, width: 4, alpha: 0.8, alignment: 1, join: "round" });
        highlight.fill({ color: 0x4dabf7, alpha: 0.1 });
        sectionContainer.addChild(highlight);
      }

      parent.addChild(sectionContainer);
    },
    [
      getCategoryColor,
      zoomToSection,
      renderSeat,
      renderDancefloorSeatArea,
      isSectionDotsVisible,
      sectionGridMarkerStyle,
      showSectionLabels,
      selectedSectionIds,
    ],
  );

  const renderScene = useCallback(() => {
    const app = appRef.current;
    const world = worldRef.current;
    if (!app || !world || !venue || !readyRef.current) return;

    world.removeChildren();

    const zoom = viewport.zoom;
    const lod = getLODLevel(zoom);

    world.position.set(viewport.x * zoom, viewport.y * zoom);
    world.scale.set(zoom);

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

    if (isGridLinesVisible) {
      const gridStep = SNAP_GRID_STEP;
      const strokeWidthMinor = 1 / Math.max(zoom, 0.0001);
      const strokeWidthMajor = 1.4 / Math.max(zoom, 0.0001);
      const minorGrid = new Graphics();
      const majorGrid = new Graphics();
      const width = venue.bounds.width;
      const height = venue.bounds.height;
      const epsilon = gridStep * 0.0001;

      const drawStyledLine = (
        g: Graphics,
        x1: number,
        y1: number,
        x2: number,
        y2: number,
      ) => {
        if (canvasGridLineStyle === "solid") {
          g.moveTo(x1, y1);
          g.lineTo(x2, y2);
          return;
        }

        const vertical = x1 === x2;
        const start = vertical ? Math.min(y1, y2) : Math.min(x1, x2);
        const end = vertical ? Math.max(y1, y2) : Math.max(x1, x2);

        if (canvasGridLineStyle === "dashed") {
          const dash = 8;
          const gap = 6;
          for (let p = start; p < end; p += dash + gap) {
            const segEnd = Math.min(p + dash, end);
            if (vertical) {
              g.moveTo(x1, p);
              g.lineTo(x1, segEnd);
            } else {
              g.moveTo(p, y1);
              g.lineTo(segEnd, y1);
            }
          }
          return;
        }

        const dotGap = 8;
        const dotRadius = 0.7 / Math.max(zoom, 0.0001);
        for (let p = start; p <= end; p += dotGap) {
          if (vertical) g.circle(x1, p, dotRadius);
          else g.circle(p, y1, dotRadius);
        }
      };

      for (let x = 0; x <= width + epsilon; x += gridStep) {
        const index = Math.round(x / gridStep);
        const target = index % MAJOR_GRID_EVERY === 0 ? majorGrid : minorGrid;
        drawStyledLine(target, x, 0, x, height);
      }

      for (let y = 0; y <= height + epsilon; y += gridStep) {
        const index = Math.round(y / gridStep);
        const target = index % MAJOR_GRID_EVERY === 0 ? majorGrid : minorGrid;
        drawStyledLine(target, 0, y, width, y);
      }

      if (canvasGridLineStyle === "dotted") {
        minorGrid.fill({ color: 0x5a5653, alpha: 0.2 });
        majorGrid.fill({ color: 0x8a7f46, alpha: 0.28 });
      } else {
        minorGrid.stroke({ color: 0x5a5653, width: strokeWidthMinor, alpha: 0.2 });
        majorGrid.stroke({ color: 0x8a7f46, width: strokeWidthMajor, alpha: 0.28 });
      }
      world.addChild(minorGrid);
      world.addChild(majorGrid);
    }

    const visibleAABB = viewport.getVisibleAABB();
    const visibleItems = spatialIndex.queryViewport(visibleAABB);
    const visibleSectionIds = new Set(visibleItems.map((item) => item.sectionId));

    for (const section of venue.sections) {
      if (!visibleSectionIds.has(section.id)) continue;
      renderSection(world, section, lod, zoom, visibleAABB);
    }

    for (const ga of venue.gaAreas) {
      renderGAArea(world, ga);
    }

    for (const table of venue.tables) {
      renderTable(world, table);
    }

    if (!readyRef.current || appRef.current !== app) return;
    if ((app.renderer as { destroyed?: boolean }).destroyed) return;
    app.render();
  }, [
    venue,
    viewport,
    spatialIndex,
    renderSection,
    renderGAArea,
    renderTable,
    isGridLinesVisible,
    canvasGridLineStyle,
    sectionGridMarkerStyle,
    selectedSectionIds,
  ]);

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
        background: 0x181818,
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
      worldRef.current = null;
      labelTextCacheRef.current.clear();
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
      labelTextCacheRef.current.clear();
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
  }, [venue, selectedSeatIds, selectedSectionIds, hoveredSeatId, scheduleRender]);

  // Hard-off path for labels: drop all label caches immediately.
  useEffect(() => {
    if (showSectionLabels) return;
    labelTextCacheRef.current.clear();
    scheduleRender();
  }, [showSectionLabels, scheduleRender]);

  // Ensure grid visibility toggles immediately without waiting for other updates.
  useEffect(() => {
    scheduleRender();
  }, [isGridLinesVisible, isSectionDotsVisible, canvasGridLineStyle, sectionGridMarkerStyle, scheduleRender]);

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
        if (enableSeatHover && store.getState().hoveredSeatId) {
          store.getState().setHoveredSeat(null);
          onSeatHover?.(null, null);
        }
        lastPointerRef.current = { x: e.clientX, y: e.clientY };
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      }
    },
    [panOnLeftClick, store, onSeatHover, enableSeatHover],
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
          if (enableSeatHover && store.getState().hoveredSeatId) {
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
    [viewport, store, onSeatHover, scheduleRender, enableSeatHover],
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
              if (seat && isSeatInteractable(seat)) {
                store.getState().toggleSeat(seat.id);
                // Show tooltip on tap (since there's no hover on touch)
                if (enableSeatHover) {
                  store.getState().setHoveredSeat(seat.id);
                }
                onSeatClick?.(seat.id, closest.sectionId);
                if (enableSeatHover) {
                  onSeatHover?.(seat.id, closest.sectionId);
                }
                scheduleRender();
                return;
              }
            }
          }
        } else {
          // Tapped empty space — dismiss tooltip
          if (enableSeatHover && store.getState().hoveredSeatId) {
            store.getState().setHoveredSeat(null);
            onSeatHover?.(null, null);
            scheduleRender();
          }
        }
      }
      touchTapRef.current = null;
    },
    [viewport, spatialIndex, store, onSeatClick, onSeatHover, scheduleRender, enableSeatHover, isSeatInteractable],
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
