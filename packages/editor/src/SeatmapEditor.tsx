import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Venue, Vec2 } from "@nex125/seatmap-core";
import { CommandHistory, venueAABB, serializeVenue, deserializeVenue, type Viewport } from "@nex125/seatmap-core";
import { SeatmapProvider, SeatmapCanvas, useSeatmapContext } from "@nex125/seatmap-react";
import { useStore } from "zustand";
import { PanTool } from "./tools/PanTool";
import { SelectTool } from "./tools/SelectTool";
import { AddSectionTool, type SectionCreationMode } from "./tools/AddSectionTool";
import { AddRowTool } from "./tools/AddRowTool";
import { AddSeatTool } from "./tools/AddSeatTool";
import type { BaseTool, ToolPointerEvent } from "./tools/BaseTool";
import { Toolbar } from "./panels/Toolbar";
import { PropertyPanel } from "./panels/PropertyPanel";
import { CategoryManager } from "./panels/CategoryManager";
import { LayerPanel } from "./panels/LayerPanel";
import { StatusManager } from "./panels/StatusManager";

export interface SeatmapEditorProps {
  venue?: Venue;
  onChange?: (venue: Venue) => void;
  onSave?: (venue: Venue, serializedVenue: string) => void;
  fetchCategoryPrices?: (categoryIds: string[]) => Promise<Record<string, number>>;
  className?: string;
}

function fitBackgroundToBounds(
  boundsWidth: number,
  boundsHeight: number,
  imageWidth: number,
  imageHeight: number,
) {
  const safeImageWidth = Math.max(1, imageWidth);
  const safeImageHeight = Math.max(1, imageHeight);
  const scale = Math.min(boundsWidth / safeImageWidth, boundsHeight / safeImageHeight);
  return {
    width: Math.max(1, safeImageWidth * scale),
    height: Math.max(1, safeImageHeight * scale),
    aspectRatio: safeImageWidth / safeImageHeight,
  };
}

function getBackgroundRectInWorld(venue: Venue) {
  const width = Math.max(1, venue.backgroundImageWidth ?? venue.bounds.width);
  const height = Math.max(1, venue.backgroundImageHeight ?? venue.bounds.height);
  const centeredX = (venue.bounds.width - width) / 2;
  const centeredY = (venue.bounds.height - height) / 2;
  return {
    x: venue.backgroundImageX ?? centeredX,
    y: venue.backgroundImageY ?? centeredY,
    width,
    height,
  };
}

type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
type CanvasGridStyle = "solid" | "dashed" | "dotted";
type SectionGridStyle = "dots" | "cross";

function PolygonPreviewOverlay({
  points,
  closeable,
  mode,
  viewport,
}: {
  points: Array<{ x: number; y: number }>;
  closeable: boolean;
  mode: SectionCreationMode;
  viewport: Viewport;
}) {
  if (points.length === 0) return null;

  const screenPoints = points.map((p) => viewport.worldToScreen(p.x, p.y));
  const svgPoints = screenPoints.map((p) => `${p.x},${p.y}`).join(" ");
  const first = screenPoints[0];
  const last = screenPoints[screenPoints.length - 1];

  return (
    <svg
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 10,
      }}
    >
      {screenPoints.length >= 2 && (
        <polyline
          points={svgPoints}
          fill="rgba(100, 180, 255, 0.1)"
          stroke="rgba(100, 180, 255, 0.8)"
          strokeWidth={2}
          strokeDasharray="6 4"
        />
      )}
      {mode === "polygon" && screenPoints.length >= 3 && (
        <line
          x1={last.x} y1={last.y} x2={first.x} y2={first.y}
          stroke={closeable ? "rgba(100, 255, 100, 0.8)" : "rgba(100, 180, 255, 0.3)"}
          strokeWidth={closeable ? 2 : 1}
          strokeDasharray="4 4"
        />
      )}
      {mode === "polygon" && screenPoints.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={i === 0 && closeable ? 8 : 4}
          fill={i === 0 && closeable ? "rgba(100, 255, 100, 0.8)" : "rgba(100, 180, 255, 0.8)"}
        />
      ))}
      {mode === "polygon" && points.length >= 2 && (
        <text
          x={(first.x + last.x) / 2}
          y={(first.y + last.y) / 2 - 10}
          fill="#e0e0e0"
          fontSize={12}
          fontFamily="system-ui"
          textAnchor="middle"
        >
          {points.length} points {closeable ? "(click first point to close)" : ""}
        </text>
      )}
    </svg>
  );
}

function DragPreviewOverlay({
  sectionOutlines,
  seatPoints,
  viewport,
}: {
  sectionOutlines: Array<Array<{ x: number; y: number }>>;
  seatPoints: Array<{ x: number; y: number }>;
  viewport: Viewport;
}) {
  if (sectionOutlines.length === 0 && seatPoints.length === 0) return null;

  const sectionScreenOutlines = sectionOutlines.map((outline) =>
    outline.map((p) => viewport.worldToScreen(p.x, p.y)),
  );
  const seatScreenPoints = seatPoints.map((p) => viewport.worldToScreen(p.x, p.y));

  return (
    <svg
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 14,
      }}
    >
      {sectionScreenOutlines
        .filter((outline) => outline.length >= 3)
        .map((outline, i) => (
          <polygon
            key={i}
            points={outline.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="rgba(110, 190, 255, 0.16)"
            stroke="rgba(110, 190, 255, 0.95)"
            strokeWidth={2}
            strokeDasharray="8 6"
          />
        ))}
      {seatScreenPoints.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={5}
          fill="rgba(110, 190, 255, 0.35)"
          stroke="rgba(110, 190, 255, 0.95)"
          strokeWidth={1.5}
        />
      ))}
    </svg>
  );
}

function EditorInner({
  onChange,
  onSave,
  fetchCategoryPrices,
}: {
  onChange?: (venue: Venue) => void;
  onSave?: (venue: Venue, serializedVenue: string) => void;
  fetchCategoryPrices?: (categoryIds: string[]) => Promise<Record<string, number>>;
}) {
  const { store, viewport, spatialIndex } = useSeatmapContext();
  const venue = useStore(store, (s) => s.venue);
  const selectedSeatIds = useStore(store, (s) => s.selectedSeatIds);
  const selectedSectionIds = useStore(store, (s) => s.selectedSectionIds);
  const selectedSectionId = useStore(store, (s) => s.selectedSectionId);
  const [, setViewportVersion] = useState(0);
  const canvasAreaRef = useRef<HTMLDivElement | null>(null);
  const [isBackgroundResizing, setIsBackgroundResizing] = useState(false);
  const [isBackgroundMoving, setIsBackgroundMoving] = useState(false);
  const backgroundResizeHandleRef = useRef<ResizeHandle>("se");
  const backgroundResizeAnchorRef = useRef<{ x: number; y: number } | null>(null);
  const backgroundMoveOffsetRef = useRef<{ x: number; y: number } | null>(null);

  const historyRef = useRef(new CommandHistory());
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const panTool = useMemo(() => new PanTool(), []);
  const selectTool = useMemo(() => new SelectTool(spatialIndex, historyRef.current), [spatialIndex]);
  const [polygonPoints, setPolygonPoints] = useState<Array<{ x: number; y: number }>>([]);
  const [polygonCloseable, setPolygonCloseable] = useState(false);

  const addSectionTool = useMemo(
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
    [],
  );
  const addRowTool = useMemo(
    () => new AddRowTool(historyRef.current, spatialIndex),
    [spatialIndex],
  );
  const addSeatTool = useMemo(
    () => new AddSeatTool(historyRef.current, spatialIndex),
    [spatialIndex],
  );

  const toolMap = useMemo<Record<string, BaseTool>>(
    () => ({
      pan: panTool,
      select: selectTool,
      "add-section": addSectionTool,
      "add-row": addRowTool,
      "add-seat": addSeatTool,
    }),
    [panTool, selectTool, addSectionTool, addRowTool, addSeatTool],
  );

  const [activeToolName, setActiveToolName] = useState("pan");
  const activeToolRef = useRef<BaseTool>(panTool);
  const lastNonPanToolNameRef = useRef<string>("select");
  const sectionResizeReturnToAddSectionRef = useRef(false);
  const [, setDragPreviewVersion] = useState(0);

  const [sectionMode, setSectionMode] = useState<SectionCreationMode>("rectangle");
  const [sectionResizeEnabled, setSectionResizeEnabled] = useState(false);
  const [gridEnabled, setGridEnabled] = useState(false);
  const [isGridOptionsOpen, setIsGridOptionsOpen] = useState(false);
  const [showCanvasGrid, setShowCanvasGrid] = useState(false);
  const [canvasGridStyle, setCanvasGridStyle] = useState<CanvasGridStyle>("solid");
  const [showSectionGrid, setShowSectionGrid] = useState(true);
  const [sectionGridStyle, setSectionGridStyle] = useState<SectionGridStyle>("dots");
  const [seatsPerRow, setSeatsPerRow] = useState(10);
  const [rowsCount, setRowsCount] = useState(1);
  const [rowOrientationDeg, setRowOrientationDeg] = useState(0);
  const [rowPreviewPoint, setRowPreviewPoint] = useState<Vec2 | null>(null);
  const handleSeatsPerRowChange = useCallback(
    (n: number) => {
      setSeatsPerRow(n);
      addRowTool.seatsPerRow = n;
    },
    [addRowTool],
  );
  const handleRowsCountChange = useCallback(
    (n: number) => {
      const clamped = Math.max(1, Math.min(100, n));
      setRowsCount(clamped);
      addRowTool.rowsCount = clamped;
    },
    [addRowTool],
  );
  const handleRowOrientationChange = useCallback(
    (deg: number) => {
      const normalized = ((Math.round(deg) % 360) + 360) % 360;
      setRowOrientationDeg(normalized);
      addRowTool.rowOrientationDeg = normalized;
    },
    [addRowTool],
  );
  const handleRotateRowOrientationQuarterTurn = useCallback(
    () => {
      handleRowOrientationChange(rowOrientationDeg + 90);
    },
    [handleRowOrientationChange, rowOrientationDeg],
  );
  const handleSectionModeChange = useCallback(
    (mode: SectionCreationMode) => {
      setSectionMode(mode);
    },
    [],
  );

  useEffect(() => {
    addSectionTool.setMode(sectionMode);
  }, [addSectionTool, sectionMode]);

  useEffect(() => {
    selectTool.setSectionResizeEnabled(sectionResizeEnabled);
  }, [selectTool, sectionResizeEnabled]);

  useEffect(() => {
    if (activeToolName !== "add-row") {
      setRowPreviewPoint(null);
    }
  }, [activeToolName]);

  const setActiveTool = useCallback(
    (name: string) => {
      if (name !== "pan") {
        lastNonPanToolNameRef.current = name;
      }
      activeToolRef.current.onDeactivate();
      const tool = toolMap[name] ?? selectTool;
      tool.onActivate(viewport, store);
      activeToolRef.current = tool;
      setActiveToolName(name);
    },
    [toolMap, selectTool, viewport, store],
  );
  const handleToggleSectionResize = useCallback(
    (fromAddSection = false) => {
      if (!sectionResizeEnabled) {
        sectionResizeReturnToAddSectionRef.current = fromAddSection;
        setSectionResizeEnabled(true);
        setActiveTool("select");
        return;
      }
      setSectionResizeEnabled(false);
      const shouldReturnToAddSection = sectionResizeReturnToAddSectionRef.current;
      sectionResizeReturnToAddSectionRef.current = false;
      if (shouldReturnToAddSection) {
        setActiveTool("add-section");
      }
    },
    [sectionResizeEnabled, setActiveTool],
  );

  useEffect(() => {
    const unsub = historyRef.current.subscribe(() => {
      setCanUndo(historyRef.current.canUndo);
      setCanRedo(historyRef.current.canRedo);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (venue) {
      spatialIndex.buildFromSections(venue.sections);
    }
  }, [venue, spatialIndex]);

  useEffect(() => {
    const unsub = viewport.subscribe(() => {
      setViewportVersion((v) => v + 1);
    });
    return unsub;
  }, [viewport]);

  const handleSave = useCallback(() => {
    const v = store.getState().venue;
    if (!v) return;
    const json = serializeVenue(v);
    onChange?.(v);
    if (onSave) {
      onSave(v, json);
      return;
    }
    console.log(v);
  }, [store, onChange, onSave]);

  const handleLoad = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const loaded = deserializeVenue(reader.result as string);
          store.getState().setVenue(loaded);
          spatialIndex.buildFromSections(loaded.sections);
          viewport.fitBounds(venueAABB(loaded));
          historyRef.current.clear();
        } catch {
          alert("Invalid venue JSON file");
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }, [store, spatialIndex, viewport]);

  const handleFitView = useCallback(() => {
    if (!venue) return;
    viewport.fitBounds(venueAABB(venue));
  }, [venue, viewport]);

  const handleUploadBackground = useCallback(() => {
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
        const dataUrl = reader.result as string;
        const image = new Image();
        image.onload = () => {
          const currentVenue = store.getState().venue;
          if (!currentVenue) return;
          const fitted = fitBackgroundToBounds(
            currentVenue.bounds.width,
            currentVenue.bounds.height,
            image.naturalWidth,
            image.naturalHeight,
          );
          store.getState().setVenue({
            ...currentVenue,
            backgroundImage: dataUrl,
            backgroundImageOpacity: currentVenue.backgroundImageOpacity ?? 0.5,
            backgroundImageWidth: fitted.width,
            backgroundImageHeight: fitted.height,
            backgroundImageX: (currentVenue.bounds.width - fitted.width) / 2,
            backgroundImageY: (currentVenue.bounds.height - fitted.height) / 2,
            backgroundImageAspectRatio: fitted.aspectRatio,
            backgroundImageKeepAspectRatio: currentVenue.backgroundImageKeepAspectRatio ?? true,
          });
        };
        image.onerror = () => {
          const currentVenue = store.getState().venue;
          if (!currentVenue) return;
          store.getState().setVenue({
            ...currentVenue,
            backgroundImage: dataUrl,
            backgroundImageOpacity: currentVenue.backgroundImageOpacity ?? 0.5,
          });
        };
        image.src = dataUrl;
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }, [store]);

  const handleRemoveBackground = useCallback(() => {
    const v = store.getState().venue;
    if (!v) return;
    store.getState().setVenue({
      ...v,
      backgroundImage: undefined,
      backgroundImageOpacity: undefined,
      backgroundImageWidth: undefined,
      backgroundImageHeight: undefined,
      backgroundImageX: undefined,
      backgroundImageY: undefined,
      backgroundImageAspectRatio: undefined,
      backgroundImageKeepAspectRatio: undefined,
    });
  }, [store]);

  const handleBackgroundOpacityChange = useCallback(
    (opacity: number) => {
      const v = store.getState().venue;
      if (!v) return;
      store.getState().setVenue({ ...v, backgroundImageOpacity: opacity });
    },
    [store],
  );

  const handleBackgroundSizeChange = useCallback(
    ({ width, height }: { width?: number; height?: number }) => {
      const v = store.getState().venue;
      if (!v || !v.backgroundImage) return;
      const currentRect = getBackgroundRectInWorld(v);
      const centerX = currentRect.x + currentRect.width / 2;
      const centerY = currentRect.y + currentRect.height / 2;

      const currentWidth = Math.max(1, v.backgroundImageWidth ?? v.bounds.width);
      const currentHeight = Math.max(1, v.backgroundImageHeight ?? v.bounds.height);
      const keepAspectRatio = v.backgroundImageKeepAspectRatio ?? true;
      const aspectRatio = v.backgroundImageAspectRatio ?? (currentWidth / currentHeight);

      let nextWidth = width ?? currentWidth;
      let nextHeight = height ?? currentHeight;

      if (keepAspectRatio) {
        const safeAspectRatio = aspectRatio > 0 ? aspectRatio : (currentWidth / currentHeight);
        if (width !== undefined && height === undefined) {
          nextHeight = nextWidth / safeAspectRatio;
        } else if (height !== undefined && width === undefined) {
          nextWidth = nextHeight * safeAspectRatio;
        } else if (width !== undefined && height !== undefined) {
          const widthFromHeight = nextHeight * safeAspectRatio;
          const heightFromWidth = nextWidth / safeAspectRatio;
          if (widthFromHeight >= nextWidth) {
            nextWidth = widthFromHeight;
          } else {
            nextHeight = heightFromWidth;
          }
        }
      }

      nextWidth = Math.max(1, Math.round(nextWidth));
      nextHeight = Math.max(1, Math.round(nextHeight));

      store.getState().setVenue({
        ...v,
        backgroundImageWidth: nextWidth,
        backgroundImageHeight: nextHeight,
        backgroundImageX: centerX - nextWidth / 2,
        backgroundImageY: centerY - nextHeight / 2,
      });
    },
    [store],
  );

  const handleBackgroundKeepAspectRatioChange = useCallback(
    (keepAspectRatio: boolean) => {
      const v = store.getState().venue;
      if (!v || !v.backgroundImage) return;
      const currentWidth = Math.max(1, v.backgroundImageWidth ?? v.bounds.width);
      const currentHeight = Math.max(1, v.backgroundImageHeight ?? v.bounds.height);
      const originalAspectRatio = v.backgroundImageAspectRatio ?? (currentWidth / currentHeight);
      const safeAspectRatio = originalAspectRatio > 0 ? originalAspectRatio : (currentWidth / currentHeight);
      store.getState().setVenue({
        ...v,
        backgroundImageKeepAspectRatio: keepAspectRatio,
        backgroundImageWidth: keepAspectRatio ? currentWidth : v.backgroundImageWidth,
        backgroundImageHeight: keepAspectRatio ? Math.max(1, Math.round(currentWidth / safeAspectRatio)) : v.backgroundImageHeight,
      });
    },
    [store],
  );

  useEffect(() => {
    if (!venue?.backgroundImage) return;

    const needsAspectData =
      venue.backgroundImageWidth === undefined ||
      venue.backgroundImageHeight === undefined ||
      venue.backgroundImageAspectRatio === undefined;
    const needsKeepAspectFlag = venue.backgroundImageKeepAspectRatio === undefined;
    const needsPositionData = venue.backgroundImageX === undefined || venue.backgroundImageY === undefined;
    if (!needsAspectData && !needsKeepAspectFlag && !needsPositionData) return;

    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (cancelled) return;
      const currentVenue = store.getState().venue;
      if (!currentVenue?.backgroundImage) return;

      const fitted = fitBackgroundToBounds(
        currentVenue.bounds.width,
        currentVenue.bounds.height,
        image.naturalWidth,
        image.naturalHeight,
      );
      const nextWidth = currentVenue.backgroundImageWidth ?? fitted.width;
      const nextHeight = currentVenue.backgroundImageHeight ?? fitted.height;
      const nextAspectRatio =
        currentVenue.backgroundImageAspectRatio ?? fitted.aspectRatio;
      const nextKeepAspectRatio = currentVenue.backgroundImageKeepAspectRatio ?? true;
      const nextX = currentVenue.backgroundImageX ?? ((currentVenue.bounds.width - nextWidth) / 2);
      const nextY = currentVenue.backgroundImageY ?? ((currentVenue.bounds.height - nextHeight) / 2);

      store.getState().setVenue({
        ...currentVenue,
        backgroundImageWidth: nextWidth,
        backgroundImageHeight: nextHeight,
        backgroundImageX: nextX,
        backgroundImageY: nextY,
        backgroundImageAspectRatio: nextAspectRatio,
        backgroundImageKeepAspectRatio: nextKeepAspectRatio,
      });
    };
    image.onerror = () => {
      if (cancelled) return;
      const currentVenue = store.getState().venue;
      if (!currentVenue?.backgroundImage) return;
      const fallbackWidth = currentVenue.backgroundImageWidth ?? currentVenue.bounds.width;
      const fallbackHeight = currentVenue.backgroundImageHeight ?? currentVenue.bounds.height;
      store.getState().setVenue({
        ...currentVenue,
        backgroundImageX: currentVenue.backgroundImageX ?? ((currentVenue.bounds.width - fallbackWidth) / 2),
        backgroundImageY: currentVenue.backgroundImageY ?? ((currentVenue.bounds.height - fallbackHeight) / 2),
        backgroundImageKeepAspectRatio: currentVenue.backgroundImageKeepAspectRatio ?? true,
      });
    };
    image.src = venue.backgroundImage;

    return () => {
      cancelled = true;
    };
  }, [
    venue?.backgroundImage,
    venue?.backgroundImageWidth,
    venue?.backgroundImageHeight,
    venue?.backgroundImageX,
    venue?.backgroundImageY,
    venue?.backgroundImageAspectRatio,
    venue?.backgroundImageKeepAspectRatio,
    store,
  ]);

  useEffect(() => {
    if (!isBackgroundResizing) return;

    const onPointerMove = (e: PointerEvent) => {
      const currentVenue = store.getState().venue;
      const canvasArea = canvasAreaRef.current;
      if (!currentVenue?.backgroundImage || !canvasArea) return;
      const anchor = backgroundResizeAnchorRef.current;
      if (!anchor) return;

      const rect = canvasArea.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      const world = viewport.screenToWorld(screenX, screenY);
      const handle = backgroundResizeHandleRef.current;
      const keepAspectRatio = currentVenue.backgroundImageKeepAspectRatio ?? true;
      const originalAspectRatio =
        currentVenue.backgroundImageAspectRatio ??
        ((currentVenue.backgroundImageWidth ?? currentVenue.bounds.width) /
          (currentVenue.backgroundImageHeight ?? currentVenue.bounds.height));
      const safeAspectRatio = originalAspectRatio > 0 ? originalAspectRatio : 1;

      const isLeft = handle === "nw" || handle === "w" || handle === "sw";
      const isRight = handle === "ne" || handle === "e" || handle === "se";
      const isTop = handle === "nw" || handle === "n" || handle === "ne";
      const isBottom = handle === "sw" || handle === "s" || handle === "se";

      let nextWidth = Math.max(
        1,
        isLeft ? (anchor.x - world.x) : isRight ? (world.x - anchor.x) : (currentVenue.backgroundImageWidth ?? currentVenue.bounds.width),
      );
      let nextHeight = Math.max(
        1,
        isTop ? (anchor.y - world.y) : isBottom ? (world.y - anchor.y) : (currentVenue.backgroundImageHeight ?? currentVenue.bounds.height),
      );
      let nextX = isLeft ? (anchor.x - nextWidth) : isRight ? anchor.x : getBackgroundRectInWorld(currentVenue).x;
      let nextY = isTop ? (anchor.y - nextHeight) : isBottom ? anchor.y : getBackgroundRectInWorld(currentVenue).y;

      if (keepAspectRatio) {
        if (handle === "w" || handle === "e") {
          nextHeight = nextWidth / safeAspectRatio;
          nextY = anchor.y - nextHeight / 2;
        } else if (handle === "n" || handle === "s") {
          nextWidth = nextHeight * safeAspectRatio;
          nextX = anchor.x - nextWidth / 2;
        } else {
          const widthFromHeight = nextHeight * safeAspectRatio;
          const heightFromWidth = nextWidth / safeAspectRatio;
          if (widthFromHeight >= nextWidth) {
            nextWidth = widthFromHeight;
          } else {
            nextHeight = heightFromWidth;
          }
          nextX = isLeft ? (anchor.x - nextWidth) : anchor.x;
          nextY = isTop ? (anchor.y - nextHeight) : anchor.y;
        }
      }

      store.getState().setVenue({
        ...currentVenue,
        backgroundImageWidth: Math.max(1, Math.round(nextWidth)),
        backgroundImageHeight: Math.max(1, Math.round(nextHeight)),
        backgroundImageX: nextX,
        backgroundImageY: nextY,
      });
    };

    const onPointerUp = () => {
      backgroundResizeAnchorRef.current = null;
      setIsBackgroundResizing(false);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [isBackgroundResizing, store, viewport]);

  useEffect(() => {
    if (!isBackgroundMoving) return;

    const onPointerMove = (e: PointerEvent) => {
      const currentVenue = store.getState().venue;
      const canvasArea = canvasAreaRef.current;
      const offset = backgroundMoveOffsetRef.current;
      if (!currentVenue?.backgroundImage || !canvasArea || !offset) return;

      const rect = canvasArea.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      const world = viewport.screenToWorld(screenX, screenY);

      store.getState().setVenue({
        ...currentVenue,
        backgroundImageX: world.x - offset.x,
        backgroundImageY: world.y - offset.y,
      });
    };

    const onPointerUp = () => {
      backgroundMoveOffsetRef.current = null;
      setIsBackgroundMoving(false);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [isBackgroundMoving, store, viewport]);

  const renderBackgroundResizeOverlay = () => {
    if (!venue?.backgroundImage) return null;
    if (activeToolName !== "select") return null;

    const rectWorld = getBackgroundRectInWorld(venue);
    const topLeft = viewport.worldToScreen(rectWorld.x, rectWorld.y);
    const topRight = viewport.worldToScreen(rectWorld.x + rectWorld.width, rectWorld.y);
    const bottomLeft = viewport.worldToScreen(rectWorld.x, rectWorld.y + rectWorld.height);
    const bottomRight = viewport.worldToScreen(rectWorld.x + rectWorld.width, rectWorld.y + rectWorld.height);

    const midTop = { x: (topLeft.x + topRight.x) / 2, y: (topLeft.y + topRight.y) / 2 };
    const midBottom = { x: (bottomLeft.x + bottomRight.x) / 2, y: (bottomLeft.y + bottomRight.y) / 2 };
    const midLeft = { x: (topLeft.x + bottomLeft.x) / 2, y: (topLeft.y + bottomLeft.y) / 2 };
    const midRight = { x: (topRight.x + bottomRight.x) / 2, y: (topRight.y + bottomRight.y) / 2 };

    const handles: Array<{
      left: number;
      top: number;
      cursor: React.CSSProperties["cursor"];
      handle: ResizeHandle;
    }> = [
      { left: topLeft.x, top: topLeft.y, cursor: "nwse-resize", handle: "nw" },
      { left: topRight.x, top: topRight.y, cursor: "nesw-resize", handle: "ne" },
      { left: bottomLeft.x, top: bottomLeft.y, cursor: "nesw-resize", handle: "sw" },
      { left: bottomRight.x, top: bottomRight.y, cursor: "nwse-resize", handle: "se" },
      { left: midLeft.x, top: midLeft.y, cursor: "ew-resize", handle: "w" },
      { left: midRight.x, top: midRight.y, cursor: "ew-resize", handle: "e" },
      { left: midTop.x, top: midTop.y, cursor: "ns-resize", handle: "n" },
      { left: midBottom.x, top: midBottom.y, cursor: "ns-resize", handle: "s" },
    ];

    return (
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 15 }}>
        <div
          style={{
            position: "absolute",
            left: topLeft.x,
            top: topLeft.y,
            width: Math.max(1, topRight.x - topLeft.x),
            height: Math.max(1, bottomLeft.y - topLeft.y),
            border: "1px dashed rgba(130, 190, 255, 0.9)",
            boxShadow: "0 0 0 1px rgba(30, 30, 50, 0.8) inset",
            pointerEvents: "auto",
            cursor: isBackgroundMoving ? "grabbing" : "grab",
          }}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
            const currentVenue = store.getState().venue;
            const canvasArea = canvasAreaRef.current;
            if (!currentVenue?.backgroundImage || !canvasArea) return;
            const backgroundRect = getBackgroundRectInWorld(currentVenue);
            const canvasRect = canvasArea.getBoundingClientRect();
            const screenX = e.clientX - canvasRect.left;
            const screenY = e.clientY - canvasRect.top;
            const world = viewport.screenToWorld(screenX, screenY);
            backgroundMoveOffsetRef.current = {
              x: world.x - backgroundRect.x,
              y: world.y - backgroundRect.y,
            };
            setIsBackgroundMoving(true);
          }}
        />
        {handles.map((handle, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: handle.left - 5,
              top: handle.top - 5,
              width: 10,
              height: 10,
              borderRadius: 2,
              background: "#82beff",
              border: "1px solid #1f2f5f",
              cursor: handle.cursor,
              pointerEvents: "auto",
            }}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              e.preventDefault();
              e.stopPropagation();
              const currentVenue = store.getState().venue;
              if (!currentVenue?.backgroundImage) return;
              const backgroundRect = getBackgroundRectInWorld(currentVenue);
              const centerX = backgroundRect.x + backgroundRect.width / 2;
              const centerY = backgroundRect.y + backgroundRect.height / 2;
              let anchor = { x: backgroundRect.x, y: backgroundRect.y };
              if (handle.handle === "nw") anchor = { x: backgroundRect.x + backgroundRect.width, y: backgroundRect.y + backgroundRect.height };
              if (handle.handle === "ne") anchor = { x: backgroundRect.x, y: backgroundRect.y + backgroundRect.height };
              if (handle.handle === "sw") anchor = { x: backgroundRect.x + backgroundRect.width, y: backgroundRect.y };
              if (handle.handle === "se") anchor = { x: backgroundRect.x, y: backgroundRect.y };
              if (handle.handle === "w") anchor = { x: backgroundRect.x + backgroundRect.width, y: centerY };
              if (handle.handle === "e") anchor = { x: backgroundRect.x, y: centerY };
              if (handle.handle === "n") anchor = { x: centerX, y: backgroundRect.y + backgroundRect.height };
              if (handle.handle === "s") anchor = { x: centerX, y: backgroundRect.y };
              backgroundResizeHandleRef.current = handle.handle;
              backgroundResizeAnchorRef.current = anchor;
              setIsBackgroundResizing(true);
            }}
          />
        ))}
      </div>
    );
  };

  const renderSectionResizeOverlay = () => {
    if (activeToolName !== "select" || !sectionResizeEnabled || !venue) return null;
    const resizeOverlay = selectTool.getSectionResizeHandlesPreview(venue, selectedSeatIds, selectedSectionId);
    if (!resizeOverlay) return null;

    const corners = resizeOverlay.corners.map((p) => viewport.worldToScreen(p.x, p.y));
    const sideMidpoints = resizeOverlay.sideMidpoints.map((p) => viewport.worldToScreen(p.x, p.y));
    const outlinePoints = corners.map((p) => `${p.x},${p.y}`).join(" ");
    const hint = resizeOverlay.mergeHint
      ? viewport.worldToScreen(resizeOverlay.mergeHint.position.x, resizeOverlay.mergeHint.position.y)
      : null;

    return (
      <svg
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
          zIndex: 16,
        }}
      >
        <polygon
          points={outlinePoints}
          fill="rgba(255, 193, 110, 0.08)"
          stroke="rgba(255, 193, 110, 0.9)"
          strokeWidth={1.5}
          strokeDasharray="7 4"
        />
        {sideMidpoints.map((p, i) => (
          <rect
            key={`side-${i}`}
            x={p.x - 5}
            y={p.y - 5}
            width={10}
            height={10}
            rx={2}
            fill="rgba(255, 193, 110, 0.9)"
            stroke="rgba(45, 36, 20, 0.95)"
            strokeWidth={1}
          />
        ))}
        {corners.map((p, i) => (
          <circle
            key={`corner-${i}`}
            cx={p.x}
            cy={p.y}
            r={5}
            fill="#ffd38a"
            stroke="rgba(45, 36, 20, 0.95)"
            strokeWidth={1.2}
          />
        ))}
        {hint && (
          <>
            <rect
              x={hint.x - 88}
              y={hint.y - 32}
              width={176}
              height={20}
              rx={6}
              fill="rgba(15, 15, 25, 0.9)"
              stroke="rgba(255, 193, 110, 0.65)"
              strokeWidth={1}
            />
            <text
              x={hint.x}
              y={hint.y - 18}
              fill="#ffd38a"
              fontSize={11}
              fontFamily="system-ui"
              textAnchor="middle"
            >
              {resizeOverlay.mergeHint?.message}
            </text>
          </>
        )}
      </svg>
    );
  };

  const renderRowOrientationOverlay = () => {
    if (activeToolName !== "add-row" || !rowPreviewPoint || !venue) return null;
    const preview = addRowTool.getPlacementPreview(rowPreviewPoint.x, rowPreviewPoint.y, venue);
    if (!preview) return null;

    const origin = viewport.worldToScreen(preview.worldX, preview.worldY);
    const lineLengthPx = 78;
    const end = {
      x: origin.x + Math.cos(preview.worldAngleRad) * lineLengthPx,
      y: origin.y + Math.sin(preview.worldAngleRad) * lineLengthPx,
    };
    const arrowSizePx = 11;
    const leftWing = {
      x: end.x - Math.cos(preview.worldAngleRad - Math.PI / 6) * arrowSizePx,
      y: end.y - Math.sin(preview.worldAngleRad - Math.PI / 6) * arrowSizePx,
    };
    const rightWing = {
      x: end.x - Math.cos(preview.worldAngleRad + Math.PI / 6) * arrowSizePx,
      y: end.y - Math.sin(preview.worldAngleRad + Math.PI / 6) * arrowSizePx,
    };
    // Keep tooltip convention aligned with row orientation input:
    // 0deg = up, 90deg = right, clockwise positive.
    const worldAngleDeg = ((((preview.worldAngleRad * 180) / Math.PI) + 90) % 360 + 360) % 360;

    return (
      <svg
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
          zIndex: 17,
        }}
      >
        <line
          x1={origin.x}
          y1={origin.y}
          x2={end.x}
          y2={end.y}
          stroke="rgba(255, 213, 122, 0.95)"
          strokeWidth={3}
          strokeLinecap="round"
        />
        <polygon
          points={`${end.x},${end.y} ${leftWing.x},${leftWing.y} ${rightWing.x},${rightWing.y}`}
          fill="rgba(255, 213, 122, 0.95)"
        />
        <circle
          cx={origin.x}
          cy={origin.y}
          r={5}
          fill="rgba(255, 213, 122, 0.28)"
          stroke="rgba(255, 213, 122, 0.95)"
          strokeWidth={1.5}
        />
        <rect
          x={origin.x + 10}
          y={origin.y - 28}
          width={90}
          height={20}
          rx={5}
          fill="rgba(15, 15, 25, 0.9)"
          stroke="rgba(255, 213, 122, 0.65)"
          strokeWidth={1}
        />
        <text
          x={origin.x + 55}
          y={origin.y - 14}
          fill="#ffd57a"
          fontSize={11}
          fontFamily="system-ui"
          textAnchor="middle"
        >
          {`Row angle ${Math.round(worldAngleDeg)}deg`}
        </text>
      </svg>
    );
  };

  const handleSelectSection = useCallback(
    (sectionId: string, options?: { multi?: boolean }) => {
      if (!venue) return;
      if (options?.multi) {
        store.getState().toggleSection(sectionId);
        return;
      }
      store.getState().clearSelection();
      store.getState().selectSection(sectionId);
    },
    [venue, store],
  );

  const renderActiveToolOptionsOverlay = () => {
    const switchTrackBase: React.CSSProperties = {
      width: 34,
      height: 20,
      borderRadius: 999,
      border: "1px solid #4a4a6a",
      padding: 2,
      display: "inline-flex",
      alignItems: "center",
      transition: "all 0.12s ease",
    };
    const switchThumbBase: React.CSSProperties = {
      width: 14,
      height: 14,
      borderRadius: "50%",
      background: "#e0e0e0",
      transition: "transform 0.12s ease",
    };
    const renderSwitch = (label: string, checked: boolean, onToggle: () => void) => (
      <label
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          color: "#d0d0e0",
          fontSize: 12,
          fontFamily: "system-ui",
          userSelect: "none",
        }}
      >
        <span>{label}</span>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          onClick={onToggle}
          style={{
            ...switchTrackBase,
            background: checked ? "#2d6a3d" : "#2a2a4a",
            borderColor: checked ? "#57b26f" : "#4a4a6a",
            cursor: "pointer",
          }}
        >
          <span
            style={{
              ...switchThumbBase,
              transform: checked ? "translateX(14px)" : "translateX(0)",
            }}
          />
        </button>
      </label>
    );
    const selectStyle: React.CSSProperties = {
      padding: "4px 8px",
      background: "#2a2a4a",
      border: "1px solid #3a3a5a",
      borderRadius: 4,
      color: "#e0e0e0",
      fontSize: 12,
      fontFamily: "system-ui",
      cursor: "pointer",
    };
    const renderGridOptionsCard = () => (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          gap: 8,
          padding: "8px 10px",
          border: "1px solid #3a3a5a",
          borderRadius: 6,
          background: "rgba(42, 42, 74, 0.65)",
        }}
      >
        <span
          style={{
            color: "#c7c7df",
            fontSize: 12,
            fontFamily: "system-ui",
            fontWeight: 600,
          }}
        >
          Grid options
        </span>
        {renderSwitch("Grid", gridEnabled, () => setGridEnabled((v) => !v))}
        <div style={{ width: "100%", height: 1, background: "#3a3a5a" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {renderSwitch("Canvas grid", showCanvasGrid, () => setShowCanvasGrid((v) => !v))}
          <select
            value={canvasGridStyle}
            onChange={(e) => setCanvasGridStyle(e.target.value as CanvasGridStyle)}
            style={selectStyle}
            disabled={!gridEnabled || !showCanvasGrid}
          >
            <option value="solid">Solid</option>
            <option value="dashed">Dashed</option>
            <option value="dotted">Dotted</option>
          </select>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {renderSwitch("Section grid", showSectionGrid, () => setShowSectionGrid((v) => !v))}
          <select
            value={sectionGridStyle}
            onChange={(e) => setSectionGridStyle(e.target.value as SectionGridStyle)}
            style={selectStyle}
            disabled={!gridEnabled || !showSectionGrid}
          >
            <option value="dots">Dots</option>
            <option value="cross">Cross</option>
          </select>
        </div>
      </div>
    );

    if (activeToolName === "add-section") {
      return (
        <div
          style={{
            position: "absolute",
            top: 12,
            left: 12,
            right: 12,
            zIndex: 20,
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 12px",
              border: "1px solid #3a3a5a",
              borderRadius: 8,
              background: "rgba(21, 21, 40, 0.92)",
              backdropFilter: "blur(2px)",
              pointerEvents: "auto",
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerMove={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
          >
            <span
              style={{
                color: "#c7c7df",
                fontSize: 12,
                fontFamily: "system-ui",
                fontWeight: 600,
                letterSpacing: 0.2,
              }}
            >
              Tool Options
            </span>
            <div style={{ width: 1, height: 18, background: "#3a3a5a" }} />
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                gap: 8,
                padding: "8px 10px",
                border: "1px solid #3a3a5a",
                borderRadius: 6,
                background: "rgba(42, 42, 74, 0.65)",
              }}
            >
              <span
                style={{
                  color: "#c7c7df",
                  fontSize: 12,
                  fontFamily: "system-ui",
                  fontWeight: 600,
                }}
              >
                Section shape
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <button
                  onClick={() => handleSectionModeChange("rectangle")}
                  style={{
                    padding: "4px 8px",
                    borderRadius: 6,
                    border: "1px solid #3a3a5a",
                    background: sectionMode === "rectangle" ? "#4a4a7a" : "#2a2a4a",
                    color: sectionMode === "rectangle" ? "#ffffff" : "#d0d0e0",
                    cursor: "pointer",
                    fontSize: 12,
                    fontFamily: "system-ui",
                    fontWeight: 600,
                  }}
                >
                  Rectangle
                </button>
                <button
                  onClick={() => handleSectionModeChange("polygon")}
                  style={{
                    padding: "4px 8px",
                    borderRadius: 6,
                    border: "1px solid #3a3a5a",
                    background: sectionMode === "polygon" ? "#4a4a7a" : "#2a2a4a",
                    color: sectionMode === "polygon" ? "#ffffff" : "#d0d0e0",
                    cursor: "pointer",
                    fontSize: 12,
                    fontFamily: "system-ui",
                    fontWeight: 600,
                  }}
                >
                  Polygon
                </button>
              </div>
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                gap: 8,
                padding: "8px 10px",
                border: "1px solid #3a3a5a",
                borderRadius: 6,
                background: "rgba(42, 42, 74, 0.65)",
              }}
            >
              <span
                style={{
                  color: "#c7c7df",
                  fontSize: 12,
                  fontFamily: "system-ui",
                  fontWeight: 600,
                }}
              >
                Section resize
              </span>
              <button
                onClick={() => handleToggleSectionResize(true)}
                style={{
                  padding: "4px 8px",
                  borderRadius: 6,
                  border: "1px solid #3a3a5a",
                  background: sectionResizeEnabled ? "#8a6a32" : "#2a2a4a",
                  color: sectionResizeEnabled ? "#fff3d8" : "#d0d0e0",
                  cursor: "pointer",
                  fontSize: 12,
                  fontFamily: "system-ui",
                  fontWeight: 600,
                }}
                title="Enable section corner/side resizing"
              >
                {sectionResizeEnabled ? "Resize On" : "Resize Off"}
              </button>
            </div>
            {isGridOptionsOpen && renderGridOptionsCard()}
          </div>
        </div>
      );
    }

    if (activeToolName === "select") {
      return (
        <div
          style={{
            position: "absolute",
            top: 12,
            left: 12,
            right: 12,
            zIndex: 20,
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 12px",
              border: "1px solid #3a3a5a",
              borderRadius: 8,
              background: "rgba(21, 21, 40, 0.92)",
              backdropFilter: "blur(2px)",
              pointerEvents: "auto",
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerMove={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
          >
            <span
              style={{
                color: "#c7c7df",
                fontSize: 12,
                fontFamily: "system-ui",
                fontWeight: 600,
              }}
            >
              Tool Options
            </span>
            <div style={{ width: 1, height: 18, background: "#3a3a5a" }} />
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                gap: 8,
                padding: "8px 10px",
                border: "1px solid #3a3a5a",
                borderRadius: 6,
                background: "rgba(42, 42, 74, 0.65)",
              }}
            >
              <span
                style={{
                  color: "#c7c7df",
                  fontSize: 12,
                  fontFamily: "system-ui",
                  fontWeight: 600,
                }}
              >
                Section resize
              </span>
              <button
                onClick={() => handleToggleSectionResize(false)}
                style={{
                  padding: "4px 8px",
                  borderRadius: 6,
                  border: "1px solid #3a3a5a",
                  background: sectionResizeEnabled ? "#8a6a32" : "#2a2a4a",
                  color: sectionResizeEnabled ? "#fff3d8" : "#d0d0e0",
                  cursor: "pointer",
                  fontSize: 12,
                  fontFamily: "system-ui",
                  fontWeight: 600,
                }}
              >
                {sectionResizeEnabled ? "Resize On" : "Resize Off"}
              </button>
            </div>
            {isGridOptionsOpen && renderGridOptionsCard()}
          </div>
        </div>
      );
    }

    if (activeToolName !== "add-row") {
      if (!isGridOptionsOpen) return null;
      return (
        <div
          style={{
            position: "absolute",
            top: 12,
            left: 12,
            right: 12,
            zIndex: 20,
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 12px",
              border: "1px solid #3a3a5a",
              borderRadius: 8,
              background: "rgba(21, 21, 40, 0.92)",
              backdropFilter: "blur(2px)",
              pointerEvents: "auto",
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerMove={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
          >
            <span
              style={{
                color: "#c7c7df",
                fontSize: 12,
                fontFamily: "system-ui",
                fontWeight: 600,
              }}
            >
              Tool Options
            </span>
            <div style={{ width: 1, height: 18, background: "#3a3a5a" }} />
            {renderGridOptionsCard()}
          </div>
        </div>
      );
    }

    return (
      <div
        style={{
          position: "absolute",
          top: 12,
          left: 12,
          right: 12,
          zIndex: 20,
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 12px",
            border: "1px solid #3a3a5a",
            borderRadius: 8,
            background: "rgba(21, 21, 40, 0.92)",
            backdropFilter: "blur(2px)",
            pointerEvents: "auto",
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerMove={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
        >
          <span
            style={{
              color: "#c7c7df",
              fontSize: 12,
              fontFamily: "system-ui",
              fontWeight: 600,
              letterSpacing: 0.2,
            }}
          >
            Tool Options
          </span>
          <div style={{ width: 1, height: 18, background: "#3a3a5a" }} />
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              gap: 8,
              padding: "8px 10px",
              border: "1px solid #3a3a5a",
              borderRadius: 6,
              background: "rgba(42, 42, 74, 0.65)",
            }}
          >
            <span
              style={{
                color: "#c7c7df",
                fontSize: 12,
                fontFamily: "system-ui",
                fontWeight: 600,
              }}
            >
              Row layout
            </span>
            <label
              style={{
                color: "#9e9e9e",
                fontSize: 12,
                fontFamily: "system-ui",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              Seats/row:
              <input
                type="number"
                min={1}
                max={100}
                value={seatsPerRow}
                onChange={(e) =>
                  handleSeatsPerRowChange(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))
                }
                style={{
                  width: 56,
                  padding: "3px 6px",
                  background: "#2a2a4a",
                  border: "1px solid #3a3a5a",
                  borderRadius: 4,
                  color: "#e0e0e0",
                  fontSize: 13,
                  fontFamily: "system-ui",
                }}
              />
            </label>

            <label
                style={{
                  color: "#9e9e9e",
                  fontSize: 12,
                  fontFamily: "system-ui",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
            >
              Rows:
              <input
                  type="number"
                  min={1}
                  max={100}
                  value={rowsCount}
                  onChange={(e) =>
                      handleRowsCountChange(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))
                  }
                  style={{
                    width: 56,
                    padding: "3px 6px",
                    background: "#2a2a4a",
                    border: "1px solid #3a3a5a",
                    borderRadius: 4,
                    color: "#e0e0e0",
                    fontSize: 13,
                    fontFamily: "system-ui",
                  }}
              />
            </label>

            <div
              style={{
                color: "#c7c7df",
                fontSize: 12,
                fontFamily: "system-ui",
                fontWeight: 600,
              }}
            >
              Total seats to add: {seatsPerRow * Math.max(1, rowsCount)}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              gap: 8,
              padding: "8px 10px",
              border: "1px solid #3a3a5a",
              borderRadius: 6,
              background: "rgba(42, 42, 74, 0.65)",
            }}
          >
            <span
              style={{
                color: "#c7c7df",
                fontSize: 12,
                fontFamily: "system-ui",
                fontWeight: 600,
              }}
            >
              Orientation
            </span>

            <label
              style={{
                color: "#9e9e9e",
                fontSize: 12,
                fontFamily: "system-ui",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              Orientation:
              <input
                type="number"
                min={0}
                max={359}
                value={rowOrientationDeg}
                onChange={(e) => handleRowOrientationChange(parseInt(e.target.value, 10) || 0)}
                style={{
                  width: 56,
                  padding: "3px 6px",
                  background: "#2a2a4a",
                  border: "1px solid #3a3a5a",
                  borderRadius: 4,
                  color: "#e0e0e0",
                  fontSize: 13,
                  fontFamily: "system-ui",
                }}
              />
              <span style={{ color: "#9e9e9e" }}>deg</span>
              <button
                onClick={handleRotateRowOrientationQuarterTurn}
                style={{
                  padding: "3px 6px",
                  borderRadius: 4,
                  border: "1px solid #3a3a5a",
                  background: "#2a2a4a",
                  color: "#d0d0e0",
                  cursor: "pointer",
                  fontSize: 12,
                  fontFamily: "system-ui",
                  fontWeight: 600,
                }}
                title="Rotate row direction by 90 degrees"
              >
                +90deg
              </button>
            </label>

            <div
              style={{
                color: "#9e9e9e",
                fontSize: 11,
                fontFamily: "system-ui",
              }}
            >
              0deg = up, 90deg = right
            </div>
          </div>
          {isGridOptionsOpen && renderGridOptionsCard()}
        </div>
      </div>
    );
  };

  // Keyboard shortcuts — skip when user is typing in an input field
  useEffect(() => {
    const isTyping = () => {
      const tag = document.activeElement?.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
    };
    const handler = (e: KeyboardEvent) => {
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
      }
    };
    const upHandler = (e: KeyboardEvent) => {
      if (isTyping()) return;
      if (e.key === " ") {
        e.preventDefault();
        setActiveTool(activeToolName === "pan" ? lastNonPanToolNameRef.current : "pan");
      }
    };
    window.addEventListener("keydown", handler);
    window.addEventListener("keyup", upHandler);
    return () => {
      window.removeEventListener("keydown", handler);
      window.removeEventListener("keyup", upHandler);
    };
  }, [setActiveTool, activeToolName]);

  // Tool pointer event adapter for the canvas overlay
  const toToolPointerEvent = useCallback(
    (e: React.PointerEvent<HTMLDivElement>): ToolPointerEvent => {
      const rect = e.currentTarget.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      const world = viewport.screenToWorld(screenX, screenY);
      return {
        worldX: world.x,
        worldY: world.y,
        screenX: e.clientX,
        screenY: e.clientY,
        shiftKey: e.shiftKey,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        button: e.button,
      };
    },
    [viewport],
  );

  const bumpDragPreview = useCallback(() => {
    if (activeToolRef.current === selectTool) {
      setDragPreviewVersion((v) => v + 1);
    }
  }, [selectTool]);

  const handlePointerRelease = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const toolEvent = toToolPointerEvent(e);
      activeToolRef.current.onPointerUp(toolEvent, viewport, store);
      bumpDragPreview();
    },
    [toToolPointerEvent, viewport, store, bumpDragPreview],
  );

  const handleCanvasPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      // Capture so drag operations complete even if pointer leaves the canvas area
      e.currentTarget.setPointerCapture(e.pointerId);
      const toolEvent = toToolPointerEvent(e);
      activeToolRef.current.onPointerDown(toolEvent, viewport, store);
      bumpDragPreview();
    },
    [toToolPointerEvent, viewport, store, bumpDragPreview],
  );

  const handleCanvasPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const toolEvent = toToolPointerEvent(e);
      activeToolRef.current.onPointerMove(toolEvent, viewport, store);
      if (activeToolName === "add-row") {
        setRowPreviewPoint({ x: toolEvent.worldX, y: toolEvent.worldY });
      }
      bumpDragPreview();
    },
    [toToolPointerEvent, viewport, store, activeToolName, bumpDragPreview],
  );

  const handleCanvasPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => handlePointerRelease(e),
    [handlePointerRelease],
  );

  const handleCanvasPointerCancel = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => handlePointerRelease(e),
    [handlePointerRelease],
  );

  const sidebarStyle: React.CSSProperties = {
    width: 260,
    background: "#1a1a2e",
    borderLeft: "1px solid #2a2a4a",
    overflowY: "auto",
    flexShrink: 0,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%" }}>
      <Toolbar
        activeTool={activeToolName}
        onToolChange={setActiveTool}
        gridEnabled={gridEnabled}
        isGridOptionsOpen={isGridOptionsOpen}
        onToggleGridOptions={() => setIsGridOptionsOpen((current) => !current)}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={() => historyRef.current.undo()}
        onRedo={() => historyRef.current.redo()}
        onFitView={handleFitView}
        onSave={handleSave}
        onLoad={handleLoad}
      />

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <div
          ref={canvasAreaRef}
          style={{ flex: 1, position: "relative", cursor: (toolMap[activeToolName] ?? selectTool).cursor }}
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={handleCanvasPointerMove}
          onPointerUp={handleCanvasPointerUp}
          onPointerCancel={handleCanvasPointerCancel}
        >
          <SeatmapCanvas
            panOnLeftClick={false}
            showGridLines={gridEnabled && showCanvasGrid}
            showSectionGridDots={gridEnabled && showSectionGrid}
            canvasGridLineStyle={canvasGridStyle}
            sectionGridMarkerStyle={sectionGridStyle}
          />
          <DragPreviewOverlay
            sectionOutlines={selectTool.getSectionDragPreviews(venue)}
            seatPoints={selectTool.getSeatDragPreview(venue)}
            viewport={viewport}
          />
          {renderRowOrientationOverlay()}
          {renderSectionResizeOverlay()}
          {renderBackgroundResizeOverlay()}
          {renderActiveToolOptionsOverlay()}
          {polygonPoints.length > 0 && (
            <PolygonPreviewOverlay
              points={polygonPoints}
              closeable={polygonCloseable}
              mode={sectionMode}
              viewport={viewport}
            />
          )}
        </div>

        <div style={sidebarStyle}>
          <PropertyPanel
            venue={venue}
            selectedSeatIds={selectedSeatIds}
            selectedSectionIds={selectedSectionIds}
            history={historyRef.current}
            store={store}
            onUploadBackground={handleUploadBackground}
            onRemoveBackground={handleRemoveBackground}
            onBackgroundOpacityChange={handleBackgroundOpacityChange}
            onBackgroundSizeChange={handleBackgroundSizeChange}
            onBackgroundKeepAspectRatioChange={handleBackgroundKeepAspectRatioChange}
          />
          {selectedSeatIds.size === 0 && (
            <>
              <div style={{ height: 1, background: "#2a2a4a", margin: "0 16px" }} />
              <LayerPanel
                venue={venue}
                selectedSeatIds={selectedSeatIds}
                selectedSectionIds={selectedSectionIds}
                onSelectSection={handleSelectSection}
              />
              <div style={{ height: 1, background: "#2a2a4a", margin: "0 16px" }} />
              <CategoryManager
                venue={venue}
                history={historyRef.current}
                store={store}
                fetchCategoryPrices={fetchCategoryPrices}
              />
            </>
          )}
          {selectedSeatIds.size === 0 && selectedSectionIds.size === 0 && (
            <>
              <div style={{ height: 1, background: "#2a2a4a", margin: "0 16px" }} />
              <StatusManager
                venue={venue}
                history={historyRef.current}
                store={store}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function SeatmapEditor({ venue, onChange, onSave, fetchCategoryPrices, className }: SeatmapEditorProps) {
  return (
    <SeatmapProvider venue={venue}>
      <div className={className} style={{ width: "100%", height: "100%" }}>
        <EditorInner onChange={onChange} onSave={onSave} fetchCategoryPrices={fetchCategoryPrices} />
      </div>
    </SeatmapProvider>
  );
}
