import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SectionKind, Venue, Vec2 } from "@nex125/seatmap-core";
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
import type { SeatmapEditorTranslate } from "./i18n";
import { translateEditorText } from "./i18n";
import "./SeatmapEditor.css";

export interface SeatmapEditorProps {
  venue?: Venue;
  onChange?: (venue: Venue) => void;
  onSave?: (venue: Venue, serializedVenue: string) => void;
  fetchCategoryPrices?: (categoryIds: string[]) => Promise<Record<string, number>>;
  translate?: SeatmapEditorTranslate;
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

function easeOutBack(t: number, overshoot: number): number {
  const c1 = Math.max(0, overshoot);
  const c3 = c1 + 1;
  const p = t - 1;
  return 1 + c3 * p * p * p + c1 * p * p;
}

function getViewportStateForFitBounds(
  viewport: Viewport,
  aabb: { minX: number; minY: number; maxX: number; maxY: number },
  padding = 40,
): { x: number; y: number; zoom: number } | null {
  const contentW = aabb.maxX - aabb.minX;
  const contentH = aabb.maxY - aabb.minY;
  if (contentW <= 0 || contentH <= 0) return null;
  if (viewport.screenWidth <= 0 || viewport.screenHeight <= 0) return null;

  const minZoom = 0.05;
  const maxZoom = 4;
  const scaleX = (viewport.screenWidth - padding * 2) / contentW;
  const scaleY = (viewport.screenHeight - padding * 2) / contentH;
  const zoom = Math.min(maxZoom, Math.max(minZoom, Math.min(scaleX, scaleY)));
  const x = -(aabb.minX + contentW / 2) + viewport.screenWidth / (2 * zoom);
  const y = -(aabb.minY + contentH / 2) + viewport.screenHeight / (2 * zoom);
  return { x, y, zoom };
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
type RowDirectionArrowMode = "row-direction" | "viewer-direction";
type MotionSettings = {
  sectionDrawJelly: number;
  fitViewJelly: number;
  panInertiaJelly: number;
  pointerScrollZoomJelly: number;
  useAdvancedMotion: boolean;
  sectionDrawDurationMs: number;
  sectionDrawCenterPullPct: number;
  sectionDrawZoomBoostPct: number;
  sectionDrawOvershootPct: number;
  fitViewDurationMs: number;
  fitViewOvershootPct: number;
  panInertiaCarryPct: number;
  panInertiaFrictionPct: number;
  panInertiaMinSpeedMilli: number;
  panVelocityBlendPct: number;
  panStopDeltaMilli: number;
  panReleaseIdleMs: number;
  pointerScrollZoomDurationMs: number;
  pointerScrollZoomStrengthPct: number;
  pointerScrollZoomDeltaDivisor: number;
};

const MOTION_SETTINGS_STORAGE_KEY = "seatmap-editor-motion-settings-v1";
const DEFAULT_MOTION_SETTINGS: MotionSettings = {
  sectionDrawJelly: 46,
  fitViewJelly: 52,
  panInertiaJelly: 55,
  pointerScrollZoomJelly: 52,
  useAdvancedMotion: false,
  sectionDrawDurationMs: 620,
  sectionDrawCenterPullPct: 22,
  sectionDrawZoomBoostPct: 5,
  sectionDrawOvershootPct: 72,
  fitViewDurationMs: 680,
  fitViewOvershootPct: 90,
  panInertiaCarryPct: 73,
  panInertiaFrictionPct: 92,
  panInertiaMinSpeedMilli: 10,
  panVelocityBlendPct: 30,
  panStopDeltaMilli: 300,
  panReleaseIdleMs: 90,
  pointerScrollZoomDurationMs: 180,
  pointerScrollZoomStrengthPct: 22,
  pointerScrollZoomDeltaDivisor: 680,
};

function clampPercent(n: number): number {
  return Math.max(0, Math.min(100, n));
}

function clampRange(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function loadMotionSettings(): MotionSettings {
  if (typeof window === "undefined") return DEFAULT_MOTION_SETTINGS;
  try {
    const raw = window.localStorage.getItem(MOTION_SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_MOTION_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<MotionSettings>;
    return {
      sectionDrawJelly: clampPercent(Number(parsed.sectionDrawJelly ?? DEFAULT_MOTION_SETTINGS.sectionDrawJelly)),
      fitViewJelly: clampPercent(Number(parsed.fitViewJelly ?? DEFAULT_MOTION_SETTINGS.fitViewJelly)),
      panInertiaJelly: clampPercent(Number(parsed.panInertiaJelly ?? DEFAULT_MOTION_SETTINGS.panInertiaJelly)),
      pointerScrollZoomJelly: clampPercent(
        Number(parsed.pointerScrollZoomJelly ?? DEFAULT_MOTION_SETTINGS.pointerScrollZoomJelly),
      ),
      useAdvancedMotion: Boolean(parsed.useAdvancedMotion ?? DEFAULT_MOTION_SETTINGS.useAdvancedMotion),
      sectionDrawDurationMs: clampRange(
        Number(parsed.sectionDrawDurationMs ?? DEFAULT_MOTION_SETTINGS.sectionDrawDurationMs),
        100,
        3000,
      ),
      sectionDrawCenterPullPct: clampRange(
        Number(parsed.sectionDrawCenterPullPct ?? DEFAULT_MOTION_SETTINGS.sectionDrawCenterPullPct),
        0,
        100,
      ),
      sectionDrawZoomBoostPct: clampRange(
        Number(parsed.sectionDrawZoomBoostPct ?? DEFAULT_MOTION_SETTINGS.sectionDrawZoomBoostPct),
        0,
        50,
      ),
      sectionDrawOvershootPct: clampRange(
        Number(parsed.sectionDrawOvershootPct ?? DEFAULT_MOTION_SETTINGS.sectionDrawOvershootPct),
        0,
        180,
      ),
      fitViewDurationMs: clampRange(
        Number(parsed.fitViewDurationMs ?? DEFAULT_MOTION_SETTINGS.fitViewDurationMs),
        100,
        3000,
      ),
      fitViewOvershootPct: clampRange(
        Number(parsed.fitViewOvershootPct ?? DEFAULT_MOTION_SETTINGS.fitViewOvershootPct),
        0,
        180,
      ),
      panInertiaCarryPct: clampRange(
        Number(parsed.panInertiaCarryPct ?? DEFAULT_MOTION_SETTINGS.panInertiaCarryPct),
        0,
        95,
      ),
      panInertiaFrictionPct: clampRange(
        Number(parsed.panInertiaFrictionPct ?? DEFAULT_MOTION_SETTINGS.panInertiaFrictionPct),
        70,
        99,
      ),
      panInertiaMinSpeedMilli: clampRange(
        Number(parsed.panInertiaMinSpeedMilli ?? DEFAULT_MOTION_SETTINGS.panInertiaMinSpeedMilli),
        1,
        50,
      ),
      panVelocityBlendPct: clampRange(
        Number(parsed.panVelocityBlendPct ?? DEFAULT_MOTION_SETTINGS.panVelocityBlendPct),
        5,
        95,
      ),
      panStopDeltaMilli: clampRange(
        Number(parsed.panStopDeltaMilli ?? DEFAULT_MOTION_SETTINGS.panStopDeltaMilli),
        0,
        4000,
      ),
      panReleaseIdleMs: clampRange(
        Number(parsed.panReleaseIdleMs ?? DEFAULT_MOTION_SETTINGS.panReleaseIdleMs),
        0,
        400,
      ),
      pointerScrollZoomDurationMs: clampRange(
        Number(parsed.pointerScrollZoomDurationMs ?? DEFAULT_MOTION_SETTINGS.pointerScrollZoomDurationMs),
        60,
        600,
      ),
      pointerScrollZoomStrengthPct: clampRange(
        Number(parsed.pointerScrollZoomStrengthPct ?? DEFAULT_MOTION_SETTINGS.pointerScrollZoomStrengthPct),
        8,
        55,
      ),
      pointerScrollZoomDeltaDivisor: clampRange(
        Number(parsed.pointerScrollZoomDeltaDivisor ?? DEFAULT_MOTION_SETTINGS.pointerScrollZoomDeltaDivisor),
        250,
        1400,
      ),
    };
  } catch {
    return DEFAULT_MOTION_SETTINGS;
  }
}

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
  const isRectanglePreview = mode === "rectangle" && screenPoints.length >= 3;

  return (
    <svg
      className="seatmap-editor__overlay-svg seatmap-editor__overlay-svg--polygon"
    >
      {screenPoints.length >= 2 && (
        isRectanglePreview ? (
          <polygon
            className="seatmap-editor__overlay-polygon"
            points={svgPoints}
          />
        ) : (
          <polyline
            className="seatmap-editor__overlay-polyline"
            points={svgPoints}
          />
        )
      )}
      {mode === "polygon" && screenPoints.length >= 3 && (
        <line
          className={`seatmap-editor__overlay-close-line ${closeable ? "seatmap-editor__overlay-close-line--active" : "seatmap-editor__overlay-close-line--inactive"}`}
          x1={last.x} y1={last.y} x2={first.x} y2={first.y}
          strokeDasharray="4 4"
        />
      )}
      {mode === "polygon" && screenPoints.map((p, i) => (
        <circle
          className={`seatmap-editor__overlay-point${i === 0 && closeable ? " seatmap-editor__overlay-point--first-active" : ""}`}
          key={i}
          cx={p.x}
          cy={p.y}
          r={i === 0 && closeable ? 8 : 4}
        />
      ))}
      {mode === "polygon" && points.length >= 2 && (
        <text
          className="seatmap-editor__overlay-label-text"
          x={(first.x + last.x) / 2}
          y={(first.y + last.y) / 2 - 10}
          fontSize={12}
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
      className="seatmap-editor__overlay-svg seatmap-editor__overlay-svg--drag"
    >
      {sectionScreenOutlines
        .filter((outline) => outline.length >= 3)
        .map((outline, i) => (
          <polygon
            className="seatmap-editor__overlay-drag-outline"
            key={i}
            points={outline.map((p) => `${p.x},${p.y}`).join(" ")}
          />
        ))}
      {seatScreenPoints.map((p, i) => (
        <circle
          className="seatmap-editor__overlay-drag-seat"
          key={i}
          cx={p.x}
          cy={p.y}
          r={5}
        />
      ))}
    </svg>
  );
}

function EditorInner({
  onChange,
  onSave,
  fetchCategoryPrices,
  translate,
}: {
  onChange?: (venue: Venue) => void;
  onSave?: (venue: Venue, serializedVenue: string) => void;
  fetchCategoryPrices?: (categoryIds: string[]) => Promise<Record<string, number>>;
  translate?: SeatmapEditorTranslate;
}) {
  const t = (key: string, fallback: string, values?: Record<string, string | number>) =>
    translateEditorText(translate, key, fallback, values);
  const { store, viewport, spatialIndex } = useSeatmapContext();
  const venue = useStore(store, (s) => s.venue);
  const selectedSeatIds = useStore(store, (s) => s.selectedSeatIds);
  const selectedSectionIds = useStore(store, (s) => s.selectedSectionIds);
  const selectedSectionId = useStore(store, (s) => s.selectedSectionId);
  const [, setViewportVersion] = useState(0);
  const canvasAreaRef = useRef<HTMLDivElement | null>(null);
  const [isBackgroundResizing, setIsBackgroundResizing] = useState(false);
  const [isBackgroundMoving, setIsBackgroundMoving] = useState(false);
  const [isAltPressed, setIsAltPressed] = useState(false);
  const backgroundResizeHandleRef = useRef<ResizeHandle>("se");
  const backgroundResizeAnchorRef = useRef<{ x: number; y: number } | null>(null);
  const backgroundMoveOffsetRef = useRef<{ x: number; y: number } | null>(null);

  const historyRef = useRef(new CommandHistory());
  const fitViewRafRef = useRef<number>(0);
  const applyMotionSyncRafRef = useRef<number>(0);
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
  const [sectionKind, setSectionKind] = useState<SectionKind>("section");
  const [sectionResizeEnabled, setSectionResizeEnabled] = useState(false);
  const [autoFocusNewSection, setAutoFocusNewSection] = useState(true);
  const [gridEnabled, setGridEnabled] = useState(false);
  const [isGridOptionsOpen, setIsGridOptionsOpen] = useState(false);
  const [showCanvasGrid, setShowCanvasGrid] = useState(false);
  const [canvasGridStyle, setCanvasGridStyle] = useState<CanvasGridStyle>("solid");
  const [showSectionGrid, setShowSectionGrid] = useState(true);
  const [sectionGridStyle, setSectionGridStyle] = useState<SectionGridStyle>("dots");
  const [showHints, setShowHints] = useState(true);
  const [isEditorSettingsOpen, setIsEditorSettingsOpen] = useState(false);
  const motionSettings = useMemo(() => loadMotionSettings(), []);
  const [sectionDrawJelly, setSectionDrawJelly] = useState(motionSettings.sectionDrawJelly);
  const [fitViewJelly, setFitViewJelly] = useState(motionSettings.fitViewJelly);
  const [panInertiaJelly, setPanInertiaJelly] = useState(motionSettings.panInertiaJelly);
  const [pointerScrollZoomJelly, setPointerScrollZoomJelly] = useState(motionSettings.pointerScrollZoomJelly);
  const [useAdvancedMotion, setUseAdvancedMotion] = useState(motionSettings.useAdvancedMotion);
  const [sectionDrawDurationMs, setSectionDrawDurationMs] = useState(motionSettings.sectionDrawDurationMs);
  const [sectionDrawCenterPullPct, setSectionDrawCenterPullPct] = useState(motionSettings.sectionDrawCenterPullPct);
  const [sectionDrawZoomBoostPct, setSectionDrawZoomBoostPct] = useState(motionSettings.sectionDrawZoomBoostPct);
  const [sectionDrawOvershootPct, setSectionDrawOvershootPct] = useState(motionSettings.sectionDrawOvershootPct);
  const [fitViewDurationMs, setFitViewDurationMs] = useState(motionSettings.fitViewDurationMs);
  const [fitViewOvershootPct, setFitViewOvershootPct] = useState(motionSettings.fitViewOvershootPct);
  const [panInertiaCarryPct, setPanInertiaCarryPct] = useState(motionSettings.panInertiaCarryPct);
  const [panInertiaFrictionPct, setPanInertiaFrictionPct] = useState(motionSettings.panInertiaFrictionPct);
  const [panInertiaMinSpeedMilli, setPanInertiaMinSpeedMilli] = useState(motionSettings.panInertiaMinSpeedMilli);
  const [panVelocityBlendPct, setPanVelocityBlendPct] = useState(motionSettings.panVelocityBlendPct);
  const [panStopDeltaMilli, setPanStopDeltaMilli] = useState(motionSettings.panStopDeltaMilli);
  const [panReleaseIdleMs, setPanReleaseIdleMs] = useState(motionSettings.panReleaseIdleMs);
  const [pointerScrollZoomDurationMs, setPointerScrollZoomDurationMs] = useState(motionSettings.pointerScrollZoomDurationMs);
  const [pointerScrollZoomStrengthPct, setPointerScrollZoomStrengthPct] = useState(motionSettings.pointerScrollZoomStrengthPct);
  const [pointerScrollZoomDeltaDivisor, setPointerScrollZoomDeltaDivisor] = useState(motionSettings.pointerScrollZoomDeltaDivisor);
  const [seatsPerRow, setSeatsPerRow] = useState(10);
  const [rowsCount, setRowsCount] = useState(1);
  const [rowOrientationDeg, setRowOrientationDeg] = useState(0);
  const [rowDirectionArrowMode, setRowDirectionArrowMode] = useState<RowDirectionArrowMode>("row-direction");
  const [rowPreviewPoint, setRowPreviewPoint] = useState<Vec2 | null>(null);
  const [cursorScreenPoint, setCursorScreenPoint] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const payload: MotionSettings = {
      sectionDrawJelly,
      fitViewJelly,
      panInertiaJelly,
      pointerScrollZoomJelly,
      useAdvancedMotion,
      sectionDrawDurationMs,
      sectionDrawCenterPullPct,
      sectionDrawZoomBoostPct,
      sectionDrawOvershootPct,
      fitViewDurationMs,
      fitViewOvershootPct,
      panInertiaCarryPct,
      panInertiaFrictionPct,
      panInertiaMinSpeedMilli,
      panVelocityBlendPct,
      panStopDeltaMilli,
      panReleaseIdleMs,
      pointerScrollZoomDurationMs,
      pointerScrollZoomStrengthPct,
      pointerScrollZoomDeltaDivisor,
    };
    window.localStorage.setItem(MOTION_SETTINGS_STORAGE_KEY, JSON.stringify(payload));
  }, [
    sectionDrawJelly,
    fitViewJelly,
    panInertiaJelly,
    pointerScrollZoomJelly,
    useAdvancedMotion,
    sectionDrawDurationMs,
    sectionDrawCenterPullPct,
    sectionDrawZoomBoostPct,
    sectionDrawOvershootPct,
    fitViewDurationMs,
    fitViewOvershootPct,
    panInertiaCarryPct,
    panInertiaFrictionPct,
    panInertiaMinSpeedMilli,
    panVelocityBlendPct,
    panStopDeltaMilli,
    panReleaseIdleMs,
    pointerScrollZoomDurationMs,
    pointerScrollZoomStrengthPct,
    pointerScrollZoomDeltaDivisor,
  ]);

  useEffect(() => {
    panTool.setInertiaOptions({
      panInertiaJelly,
      panInertiaCarry: useAdvancedMotion ? panInertiaCarryPct / 100 : undefined,
      panInertiaFriction: useAdvancedMotion ? panInertiaFrictionPct / 100 : undefined,
      panInertiaMinSpeed: useAdvancedMotion ? panInertiaMinSpeedMilli / 1000 : undefined,
      panVelocityBlend: useAdvancedMotion ? panVelocityBlendPct / 100 : undefined,
      panStopDelta: useAdvancedMotion ? panStopDeltaMilli / 1000 : undefined,
      panReleaseIdleMs: useAdvancedMotion ? panReleaseIdleMs : undefined,
    });
  }, [
    panTool,
    panInertiaJelly,
    useAdvancedMotion,
    panInertiaCarryPct,
    panInertiaFrictionPct,
    panInertiaMinSpeedMilli,
    panVelocityBlendPct,
    panStopDeltaMilli,
    panReleaseIdleMs,
  ]);

  const handleResetMotionSettings = useCallback(() => {
    setSectionDrawJelly(DEFAULT_MOTION_SETTINGS.sectionDrawJelly);
    setFitViewJelly(DEFAULT_MOTION_SETTINGS.fitViewJelly);
    setPanInertiaJelly(DEFAULT_MOTION_SETTINGS.panInertiaJelly);
    setPointerScrollZoomJelly(DEFAULT_MOTION_SETTINGS.pointerScrollZoomJelly);
    setUseAdvancedMotion(DEFAULT_MOTION_SETTINGS.useAdvancedMotion);
    setSectionDrawDurationMs(DEFAULT_MOTION_SETTINGS.sectionDrawDurationMs);
    setSectionDrawCenterPullPct(DEFAULT_MOTION_SETTINGS.sectionDrawCenterPullPct);
    setSectionDrawZoomBoostPct(DEFAULT_MOTION_SETTINGS.sectionDrawZoomBoostPct);
    setSectionDrawOvershootPct(DEFAULT_MOTION_SETTINGS.sectionDrawOvershootPct);
    setFitViewDurationMs(DEFAULT_MOTION_SETTINGS.fitViewDurationMs);
    setFitViewOvershootPct(DEFAULT_MOTION_SETTINGS.fitViewOvershootPct);
    setPanInertiaCarryPct(DEFAULT_MOTION_SETTINGS.panInertiaCarryPct);
    setPanInertiaFrictionPct(DEFAULT_MOTION_SETTINGS.panInertiaFrictionPct);
    setPanInertiaMinSpeedMilli(DEFAULT_MOTION_SETTINGS.panInertiaMinSpeedMilli);
    setPanVelocityBlendPct(DEFAULT_MOTION_SETTINGS.panVelocityBlendPct);
    setPanStopDeltaMilli(DEFAULT_MOTION_SETTINGS.panStopDeltaMilli);
    setPanReleaseIdleMs(DEFAULT_MOTION_SETTINGS.panReleaseIdleMs);
    setPointerScrollZoomDurationMs(DEFAULT_MOTION_SETTINGS.pointerScrollZoomDurationMs);
    setPointerScrollZoomStrengthPct(DEFAULT_MOTION_SETTINGS.pointerScrollZoomStrengthPct);
    setPointerScrollZoomDeltaDivisor(DEFAULT_MOTION_SETTINGS.pointerScrollZoomDeltaDivisor);
  }, []);

  const animateBasicKnobValues = useCallback((
    targets: {
      section: number;
      fit: number;
      pan: number;
      pointerZoom: number;
    },
  ) => {
    if (applyMotionSyncRafRef.current) {
      cancelAnimationFrame(applyMotionSyncRafRef.current);
      applyMotionSyncRafRef.current = 0;
    }

    const start = {
      section: sectionDrawJelly,
      fit: fitViewJelly,
      pan: panInertiaJelly,
      pointerZoom: pointerScrollZoomJelly,
    };
    const startedAt = performance.now();
    const durationMs = 260;
    const easeOutCubicLocal = (t: number) => 1 - (1 - t) * (1 - t) * (1 - t);

    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / durationMs);
      const eased = easeOutCubicLocal(progress);
      const nextSection = Math.round(start.section + (targets.section - start.section) * eased);
      const nextFit = Math.round(start.fit + (targets.fit - start.fit) * eased);
      const nextPan = Math.round(start.pan + (targets.pan - start.pan) * eased);
      const nextPointerZoom = Math.round(start.pointerZoom + (targets.pointerZoom - start.pointerZoom) * eased);

      setSectionDrawJelly(clampPercent(nextSection));
      setFitViewJelly(clampPercent(nextFit));
      setPanInertiaJelly(clampPercent(nextPan));
      setPointerScrollZoomJelly(clampPercent(nextPointerZoom));

      if (progress < 1) {
        applyMotionSyncRafRef.current = requestAnimationFrame(tick);
        return;
      }
      applyMotionSyncRafRef.current = 0;
    };

    applyMotionSyncRafRef.current = requestAnimationFrame(tick);
  }, [sectionDrawJelly, fitViewJelly, panInertiaJelly, pointerScrollZoomJelly]);

  const handleApplyAdvancedToBasic = useCallback(() => {
    const sectionFromZoomBoost = (clampRange(sectionDrawZoomBoostPct, 0, 50) / 100 - 0.01) / 0.08;
    const sectionFromCenterPull = (clampRange(sectionDrawCenterPullPct, 0, 100) / 100 - 0.12) / 0.22;
    const sectionFromDuration = (clampRange(sectionDrawDurationMs, 100, 3000) - 380) / 520;
    const sectionFromOvershoot = (clampRange(sectionDrawOvershootPct, 0, 180) / 100 - 0.08) / 0.48;
    const nextSectionDrawJelly = clampPercent(
      Math.round(((sectionFromZoomBoost + sectionFromCenterPull + sectionFromDuration + sectionFromOvershoot) / 4) * 100),
    );

    const fitFromDuration = (clampRange(fitViewDurationMs, 100, 3000) - 360) / 620;
    const fitFromOvershoot = (clampRange(fitViewOvershootPct, 0, 180) / 100 - 0.2) / 0.9;
    const nextFitViewJelly = clampPercent(Math.round(((fitFromDuration + fitFromOvershoot) / 2) * 100));

    const panFromCarry = (clampRange(panInertiaCarryPct, 0, 95) / 100 - 0.58) / 0.28;
    const panFromFriction = (clampRange(panInertiaFrictionPct, 70, 99) / 100 - 0.88) / 0.08;
    const panFromMinSpeed = (0.012 - clampRange(panInertiaMinSpeedMilli, 1, 50) / 1000) / 0.004;
    const nextPanInertiaJelly = clampPercent(Math.round(((panFromCarry + panFromFriction + panFromMinSpeed) / 3) * 100));

    const zoomFromDuration = (clampRange(pointerScrollZoomDurationMs, 60, 600) - 90) / 220;
    const zoomFromSensitivity = (clampRange(pointerScrollZoomDeltaDivisor, 250, 1400) - 520) / 380;
    const zoomFromStrength = (0.33 - clampRange(pointerScrollZoomStrengthPct, 8, 55) / 100) / 0.14;
    const nextPointerScrollZoomJelly = clampPercent(
      Math.round(((zoomFromDuration + zoomFromSensitivity + zoomFromStrength) / 3) * 100),
    );

    animateBasicKnobValues({
      section: nextSectionDrawJelly,
      fit: nextFitViewJelly,
      pan: nextPanInertiaJelly,
      pointerZoom: nextPointerScrollZoomJelly,
    });
  }, [
    animateBasicKnobValues,
    sectionDrawZoomBoostPct,
    sectionDrawCenterPullPct,
    sectionDrawDurationMs,
    sectionDrawOvershootPct,
    fitViewDurationMs,
    fitViewOvershootPct,
    panInertiaCarryPct,
    panInertiaFrictionPct,
    panInertiaMinSpeedMilli,
    pointerScrollZoomDurationMs,
    pointerScrollZoomStrengthPct,
    pointerScrollZoomDeltaDivisor,
  ]);

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
  const rowOrientationKnobDeg = useMemo(
    () => (
      rowDirectionArrowMode === "row-direction"
        ? (((rowOrientationDeg + 90) % 360) + 360) % 360
        : rowOrientationDeg
    ),
    [rowDirectionArrowMode, rowOrientationDeg],
  );
  const handleRowOrientationKnobChange = useCallback(
    (deg: number) => {
      const mapped = rowDirectionArrowMode === "row-direction" ? deg - 90 : deg;
      handleRowOrientationChange(mapped);
    },
    [rowDirectionArrowMode, handleRowOrientationChange],
  );
  const handleSectionToolVariantChange = useCallback(
    (kind: SectionKind, mode: SectionCreationMode) => {
      setSectionKind(kind);
      setSectionMode(mode);
    },
    [],
  );

  useEffect(() => {
    addSectionTool.setMode(sectionMode);
  }, [addSectionTool, sectionMode]);

  useEffect(() => {
    addSectionTool.setSectionKind(sectionKind);
  }, [addSectionTool, sectionKind]);

  const focusSectionGently = useCallback(
    (sectionId: string) => {
      const currentVenue = store.getState().venue;
      if (!currentVenue) return;
      const section = currentVenue.sections.find((entry) => entry.id === sectionId);
      if (!section) return;
      if (viewport.screenWidth <= 0 || viewport.screenHeight <= 0) return;

      const startX = viewport.x;
      const startY = viewport.y;
      const startZoom = viewport.zoom;
      const jelly = Math.max(0, Math.min(100, sectionDrawJelly)) / 100;
      const zoomBoost = useAdvancedMotion
        ? clampRange(sectionDrawZoomBoostPct, 0, 50) / 100
        : 0.01 + jelly * 0.08;
      const targetZoom = Math.min(4, Math.max(0.05, startZoom * (1 + zoomBoost)));
      const centeredX = viewport.screenWidth / (2 * targetZoom) - section.position.x;
      const centeredY = viewport.screenHeight / (2 * targetZoom) - section.position.y;
      const centerPull = useAdvancedMotion
        ? clampRange(sectionDrawCenterPullPct, 0, 100) / 100
        : 0.12 + jelly * 0.22;
      const targetX = startX + (centeredX - startX) * centerPull;
      const targetY = startY + (centeredY - startY) * centerPull;
      const durationMs = useAdvancedMotion
        ? clampRange(sectionDrawDurationMs, 100, 3000)
        : 380 + jelly * 520;
      const overshoot = useAdvancedMotion
        ? clampRange(sectionDrawOvershootPct, 0, 180) / 100
        : 0.08 + jelly * 0.48;
      const startedAt = performance.now();

      const animate = (now: number) => {
        const elapsed = now - startedAt;
        const progress = Math.min(1, elapsed / durationMs);
        const eased = progress >= 1 ? 1 : easeOutBack(progress, overshoot);

        viewport.x = startX + (targetX - startX) * eased;
        viewport.y = startY + (targetY - startY) * eased;
        viewport.setZoom(startZoom + (targetZoom - startZoom) * eased);

        if (progress < 1) {
          requestAnimationFrame(animate);
        }
      };

      requestAnimationFrame(animate);
    },
    [store, viewport, sectionDrawJelly, useAdvancedMotion, sectionDrawZoomBoostPct, sectionDrawCenterPullPct, sectionDrawDurationMs, sectionDrawOvershootPct],
  );

  useEffect(() => {
    addSectionTool.onSectionCreated = (sectionId) => {
      if (!autoFocusNewSection) return;
      focusSectionGently(sectionId);
    };

    return () => {
      addSectionTool.onSectionCreated = undefined;
    };
  }, [addSectionTool, autoFocusNewSection, focusSectionGently]);

  const sectionHintText = useMemo(() => {
    if (activeToolName === "select" && sectionResizeEnabled) {
      return t("seatmapEditor.hints.resizeMode", "Resize mode: drag inside section to move it, drag corners to resize, drag sides to move edges, click a side to add a polygon point.");
    }
    if (activeToolName !== "add-section") return null;
    if (sectionMode === "rectangle") {
      if (addSectionTool.hasPendingDraft()) {
        return t("seatmapEditor.hints.rectangleFinish", "Click opposite corner to finish. Esc to cancel.");
      }
      return t("seatmapEditor.hints.rectangleStart", "Click first corner to start rectangle.");
    }
    if (addSectionTool.hasPendingDraft()) {
      return t("seatmapEditor.hints.polygonContinue", "Click to add points. Click first point to close. Esc to cancel.");
    }
    return t("seatmapEditor.hints.polygonStart", "Click to place first polygon point.");
  }, [activeToolName, sectionMode, addSectionTool, sectionResizeEnabled, t]);
  const rowPresetRows = [1, 2, 3, 4];
  const rowPresetSeats = [8, 10, 12, 16];

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
      if (name !== activeToolName) {
        setIsGridOptionsOpen(false);
        setIsEditorSettingsOpen(false);
      }
      activeToolRef.current.onDeactivate();
      const tool = toolMap[name] ?? selectTool;
      tool.onActivate(viewport, store);
      activeToolRef.current = tool;
      setActiveToolName(name);
    },
    [activeToolName, toolMap, selectTool, viewport, store],
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
          alert(t("seatmapEditor.errors.invalidVenueJson", "Invalid venue JSON file"));
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }, [store, spatialIndex, viewport]);

  const stopFitViewAnimation = useCallback(() => {
    if (fitViewRafRef.current) {
      cancelAnimationFrame(fitViewRafRef.current);
      fitViewRafRef.current = 0;
    }
  }, []);

  const animateFitView = useCallback(
    (bounds: { minX: number; minY: number; maxX: number; maxY: number }) => {
      const target = getViewportStateForFitBounds(viewport, bounds, 40);
      if (!target) return;

      stopFitViewAnimation();
      const startX = viewport.x;
      const startY = viewport.y;
      const startZoom = viewport.zoom;
      const jelly = Math.max(0, Math.min(100, fitViewJelly)) / 100;
      const durationMs = useAdvancedMotion
        ? clampRange(fitViewDurationMs, 100, 3000)
        : 360 + jelly * 620;
      const overshoot = useAdvancedMotion
        ? clampRange(fitViewOvershootPct, 0, 180) / 100
        : 0.2 + jelly * 0.9;
      const startedAt = performance.now();

      const animate = (now: number) => {
        const elapsed = now - startedAt;
        const progress = Math.min(1, elapsed / durationMs);
        const eased = progress >= 1 ? 1 : easeOutBack(progress, overshoot);

        viewport.x = startX + (target.x - startX) * eased;
        viewport.y = startY + (target.y - startY) * eased;
        viewport.setZoom(startZoom + (target.zoom - startZoom) * eased);

        if (progress < 1) {
          fitViewRafRef.current = requestAnimationFrame(animate);
          return;
        }
        fitViewRafRef.current = 0;
      };

      fitViewRafRef.current = requestAnimationFrame(animate);
    },
    [viewport, stopFitViewAnimation, fitViewJelly, useAdvancedMotion, fitViewDurationMs, fitViewOvershootPct],
  );

  const handleFitView = useCallback(() => {
    if (!venue) return;
    animateFitView(venueAABB(venue));
  }, [venue, animateFitView]);

  useEffect(() => () => stopFitViewAnimation(), [stopFitViewAnimation]);
  useEffect(() => () => {
    if (applyMotionSyncRafRef.current) {
      cancelAnimationFrame(applyMotionSyncRafRef.current);
      applyMotionSyncRafRef.current = 0;
    }
  }, []);

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
    // Background editing should be explicit so section selection/drag stays primary.
    const isBackgroundEditActive = isAltPressed || isBackgroundMoving || isBackgroundResizing;
    if (!isBackgroundEditActive) return null;

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
      <div className="seatmap-editor__background-overlay">
        <div
          className="seatmap-editor__background-frame"
          style={{
            left: topLeft.x,
            top: topLeft.y,
            width: Math.max(1, topRight.x - topLeft.x),
            height: Math.max(1, bottomLeft.y - topLeft.y),
            cursor: isBackgroundMoving ? "grabbing" : "default",
          }}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            // Allow normal section interactions through the background frame.
            // Background drag is an explicit Alt+drag gesture.
            if (!e.altKey) return;
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
            className="seatmap-editor__background-handle"
            style={{
              left: handle.left - 5,
              top: handle.top - 5,
              cursor: handle.cursor,
            }}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              // Keep resize handles explicit so they do not interfere with section selection/move.
              if (!e.altKey) return;
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
        className="seatmap-editor__overlay-svg seatmap-editor__overlay-svg--section-resize"
      >
        <polygon
          className="seatmap-editor__overlay-section-outline"
          points={outlinePoints}
        />
        {sideMidpoints.map((p, i) => (
          <rect
            className="seatmap-editor__overlay-section-side"
            key={`side-${i}`}
            x={p.x - 5}
            y={p.y - 5}
            width={10}
            height={10}
            rx={2}
          />
        ))}
        {corners.map((p, i) => (
          <circle
            className="seatmap-editor__overlay-section-corner"
            key={`corner-${i}`}
            cx={p.x}
            cy={p.y}
            r={5}
          />
        ))}
        {hint && (
          <>
            <rect
              className="seatmap-editor__overlay-label-box"
              x={hint.x - 88}
              y={hint.y - 32}
              width={176}
              height={20}
              rx={6}
            />
            <text
              className="seatmap-editor__overlay-label-text"
              x={hint.x}
              y={hint.y - 18}
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

    const displayAngleRad =
      rowDirectionArrowMode === "row-direction"
        ? preview.worldAngleRad + Math.PI / 2
        : preview.worldAngleRad;
    const origin = viewport.worldToScreen(preview.worldX, preview.worldY);
    const lineLengthPx = 78;
    const end = {
      x: origin.x + Math.cos(displayAngleRad) * lineLengthPx,
      y: origin.y + Math.sin(displayAngleRad) * lineLengthPx,
    };
    const arrowSizePx = 11;
    const leftWing = {
      x: end.x - Math.cos(displayAngleRad - Math.PI / 6) * arrowSizePx,
      y: end.y - Math.sin(displayAngleRad - Math.PI / 6) * arrowSizePx,
    };
    const rightWing = {
      x: end.x - Math.cos(displayAngleRad + Math.PI / 6) * arrowSizePx,
      y: end.y - Math.sin(displayAngleRad + Math.PI / 6) * arrowSizePx,
    };
    const displayAngleDeg = ((((displayAngleRad * 180) / Math.PI) + 90) % 360 + 360) % 360;
    const orientationLabel = rowDirectionArrowMode === "row-direction"
      ? t("seatmapEditor.orientation.rowDirection", "Row direction")
      : t("seatmapEditor.orientation.viewerDirection", "Viewer direction");

    return (
      <svg
        className="seatmap-editor__overlay-svg seatmap-editor__overlay-svg--row-direction"
      >
        <line
          className="seatmap-editor__overlay-row-direction-line"
          x1={origin.x}
          y1={origin.y}
          x2={end.x}
          y2={end.y}
          strokeWidth={3}
          strokeLinecap="round"
        />
        <polygon
          className="seatmap-editor__overlay-row-direction-arrow"
          points={`${end.x},${end.y} ${leftWing.x},${leftWing.y} ${rightWing.x},${rightWing.y}`}
        />
        <circle
          className="seatmap-editor__overlay-row-direction-origin"
          cx={origin.x}
          cy={origin.y}
          r={5}
          strokeWidth={1.5}
        />
        <rect
          className="seatmap-editor__overlay-label-box"
          x={origin.x + 10}
          y={origin.y - 28}
          width={90}
          height={20}
          rx={5}
        />
        <text
          className="seatmap-editor__overlay-label-text"
          x={origin.x + 55}
          y={origin.y - 14}
        >
          {`${orientationLabel} ${Math.round(displayAngleDeg)}°`}
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

  const handleDeleteSelectedObjects = useCallback(() => {
    const state = store.getState();
    const currentVenue = state.venue;
    if (!currentVenue) return;

    const selectedSeatIdSet = new Set(state.selectedSeatIds);
    const selectedSectionIdSet = new Set(state.selectedSectionIds);
    if (selectedSeatIdSet.size === 0 && selectedSectionIdSet.size === 0) return;

    const previousVenue = currentVenue;
    const nextVenue: Venue = {
      ...currentVenue,
      sections: currentVenue.sections
        .filter((section) => !selectedSectionIdSet.has(section.id))
        .map((section) => ({
          ...section,
          rows: section.rows.map((row) => ({
            ...row,
            seats: row.seats.filter((seat) => !selectedSeatIdSet.has(seat.id)),
          })),
        })),
      tables: currentVenue.tables.map((table) => ({
        ...table,
        seats: table.seats.filter((seat) => !selectedSeatIdSet.has(seat.id)),
      })),
    };

    historyRef.current.execute({
      description: "Delete selected objects",
      execute: () => {
        store.getState().setVenue(nextVenue);
        store.getState().clearSelection();
      },
      undo: () => {
        store.getState().setVenue(previousVenue);
      },
    });
  }, [store]);

  const renderActiveToolOptionsOverlay = () => {
    const stopPointerPropagation = (e: React.PointerEvent<HTMLDivElement>) => e.stopPropagation();
    const renderOverlay = (content: React.ReactNode) => (
      <div className="seatmap-editor__tool-options-overlay">
        <div
          className="seatmap-editor__tool-options-shell"
          onPointerDown={stopPointerPropagation}
          onPointerMove={stopPointerPropagation}
          onPointerUp={stopPointerPropagation}
        >
          {content}
        </div>
      </div>
    );
    const renderSwitch = (label: string, checked: boolean, onToggle: () => void) => (
      <label className="seatmap-editor__switch">
        <span>{label}</span>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          onClick={onToggle}
          className={`seatmap-editor__switch-track${checked ? " is-checked" : ""}`}
        >
          <span className="seatmap-editor__switch-thumb" />
        </button>
      </label>
    );
    const renderRange = (
      label: string,
      value: number,
      onChange: (next: number) => void,
      hint: string,
      options?: {
        min?: number;
        max?: number;
        step?: number;
        valueFormatter?: (n: number) => string;
        disabled?: boolean;
        displayAsKnob?: boolean;
        knobMode?: "vertical" | "dial360";
        knobFillStartDeg?: number;
        valuePlacement?: "header" | "knob";
        knobRightContent?: React.ReactNode;
        compactKnobLayout?: boolean;
        knobLayout?: "default" | "label-value-knob";
        knobNamespace?: "motion" | "tool";
      },
    ) => {
      const min = options?.min ?? 0;
      const max = options?.max ?? 100;
      const step = options?.step ?? 1;
      const displayValue = options?.valueFormatter ? options.valueFormatter(value) : Math.round(value);
      const normalized = max > min ? (value - min) / (max - min) : 0;
      const clampedNormalized = clampRange(normalized, 0, 1);
      const isDial360 = options?.knobMode === "dial360";
      const knobFillStartDeg = options?.knobFillStartDeg ?? (isDial360 ? -90 : -130);
      const knobAngle = isDial360
        ? knobFillStartDeg + clampedNormalized * 360
        : -130 + clampedNormalized * 260;
      const knobFillPercent = isDial360
        ? clampedNormalized * 100
        : clampedNormalized * ((260 / 360) * 100);
      const knobDisabled = Boolean(options?.disabled);
      const showKnob = Boolean(options?.displayAsKnob);
      const valuePlacement = options?.valuePlacement ?? "header";
      const compactKnobLayout = Boolean(options?.compactKnobLayout) && showKnob;
      const isLabelValueKnobLayout = showKnob && options?.knobLayout === "label-value-knob";
      const knobNamespace = options?.knobNamespace ?? "motion";
      const tooltipText = knobDisabled
        ? "Disabled while advanced overrides are enabled."
        : hint;
      const commitClampedValue = (raw: number) => {
        const clamped = clampRange(raw, min, max);
        const stepped = Math.round((clamped - min) / step) * step + min;
        onChange(clampRange(stepped, min, max));
      };

      return (
        <label
          className={`seatmap-editor__motion-slider${compactKnobLayout ? " seatmap-editor__motion-slider--compact-knob" : ""}${isLabelValueKnobLayout ? " seatmap-editor__motion-slider--label-value-knob" : ""}${knobDisabled ? " is-disabled" : ""}`}
        >
          {!isLabelValueKnobLayout && (
            <div className="seatmap-editor__motion-slider-header">
              <span className="seatmap-editor__label" title={label}>{label}</span>
              {valuePlacement === "header" && (
                <span className="seatmap-editor__motion-slider-value">
                  {displayValue}
                </span>
              )}
            </div>
          )}
          {showKnob ? (
            <div className={`seatmap-editor__motion-knob-row${isLabelValueKnobLayout ? " seatmap-editor__motion-knob-row--label-value-knob" : ""}`}>
              {isLabelValueKnobLayout && (
                <span className="seatmap-editor__label" title={label}>{label}</span>
              )}
              {isLabelValueKnobLayout && (
                <span className="seatmap-editor__motion-slider-value">
                  {displayValue}
                </span>
              )}
              <button
                type="button"
                className="seatmap-editor__motion-knob"
                aria-label={label}
                title={tooltipText}
                disabled={knobDisabled}
                onPointerDown={(e) => {
                  if (knobDisabled) return;
                  e.preventDefault();
                  const pointerId = e.pointerId;
                  const target = e.currentTarget;
                  target.setPointerCapture(pointerId);
                  const range = max - min;
                  const getDialValue = (clientX: number, clientY: number) => {
                    const rect = target.getBoundingClientRect();
                    const centerX = rect.left + rect.width / 2;
                    const centerY = rect.top + rect.height / 2;
                    const angle = Math.atan2(clientY - centerY, clientX - centerX);
                    const clockwiseFromUpDeg = ((((angle * 180) / Math.PI) + 90) % 360 + 360) % 360;
                    return min + (clockwiseFromUpDeg / 360) * range;
                  };

                  let handleMove: (ev: PointerEvent) => void;
                  if (isDial360) {
                    commitClampedValue(getDialValue(e.clientX, e.clientY));
                    handleMove = (ev: PointerEvent) => {
                      commitClampedValue(getDialValue(ev.clientX, ev.clientY));
                    };
                  } else {
                    const startY = e.clientY;
                    const startValue = value;
                    const dragHeightPx = 180;
                    handleMove = (ev: PointerEvent) => {
                      const deltaY = startY - ev.clientY;
                      commitClampedValue(startValue + (deltaY / dragHeightPx) * range);
                    };
                  }
                  const handleUp = () => {
                    target.removeEventListener("pointermove", handleMove);
                    target.removeEventListener("pointerup", handleUp);
                    target.removeEventListener("pointercancel", handleUp);
                  };
                  target.addEventListener("pointermove", handleMove);
                  target.addEventListener("pointerup", handleUp);
                  target.addEventListener("pointercancel", handleUp);
                }}
              >
                <span
                  className={`seatmap-editor__motion-knob-ring${knobNamespace === "tool" ? " seatmap-editor__motion-knob-ring--tool" : " seatmap-editor__motion-knob-ring--motion"}`}
                  style={{
                    [knobNamespace === "tool" ? "--tool-knob-fill" : "--motion-knob-fill"]: `${Math.round(knobFillPercent)}%`,
                    [knobNamespace === "tool" ? "--tool-knob-start-angle" : "--motion-knob-start-angle"]: `${knobFillStartDeg}deg`,
                  }}
                />
                <span
                  className="seatmap-editor__motion-knob-indicator"
                  style={{ transform: `translate(-50%, -100%) rotate(${knobAngle}deg)` }}
                />
              </button>
              {valuePlacement === "knob" && (
                <span className="seatmap-editor__motion-slider-value seatmap-editor__motion-slider-value--knob">
                  {displayValue}
                </span>
              )}
              {options?.knobRightContent && (
                <div className="seatmap-editor__motion-knob-right-content">
                  {options.knobRightContent}
                </div>
              )}
            </div>
          ) : (
            <input
              type="range"
              min={min}
              max={max}
              step={step}
              value={value}
              onChange={(e) => commitClampedValue(Number(e.target.value) || 0)}
              disabled={knobDisabled}
              className="seatmap-editor__panel-range"
              title={tooltipText}
            />
          )}
        </label>
      );
    };
    const renderOptionCard = (title: string, body: React.ReactNode, className?: string) => (
      <div className={`seatmap-editor__option-card${className ? ` ${className}` : ""}`}>
        <span className="seatmap-editor__option-card-title seatmap-editor__option-card-title--group">{title}</span>
        <div className="seatmap-editor__option-card-subdivider" />
        <div className="seatmap-editor__option-card-body">
          {body}
        </div>
      </div>
    );
    const renderGridOptionsCard = () => (
      renderOptionCard(
        "Grid options",
        <>
          {renderSwitch("Grid", gridEnabled, () => setGridEnabled((v) => !v))}
          <div className="seatmap-editor__option-card-divider" />
          <div className="seatmap-editor__option-row">
            {renderSwitch("Canvas grid", showCanvasGrid, () => setShowCanvasGrid((v) => !v))}
            <select
              value={canvasGridStyle}
              onChange={(e) => setCanvasGridStyle(e.target.value as CanvasGridStyle)}
              className="seatmap-editor__select"
              disabled={!gridEnabled || !showCanvasGrid}
            >
              <option value="solid">Solid</option>
              <option value="dashed">Dashed</option>
              <option value="dotted">Dotted</option>
            </select>
          </div>
          <div className="seatmap-editor__option-row">
            {renderSwitch("Section grid", showSectionGrid, () => setShowSectionGrid((v) => !v))}
            <select
              value={sectionGridStyle}
              onChange={(e) => setSectionGridStyle(e.target.value as SectionGridStyle)}
              className="seatmap-editor__select"
              disabled={!gridEnabled || !showSectionGrid}
            >
              <option value="dots">Dots</option>
              <option value="cross">Cross</option>
            </select>
          </div>
        </>,
      )
    );
    const renderMotionSettingsCard = () => (
      renderOptionCard(
        "Editor motion",
        <div className="seatmap-editor__motion-layout">
          <div className="seatmap-editor__motion-column seatmap-editor__motion-column--basic">
            <span className="seatmap-editor__option-card-title">Basic</span>
            <div className="seatmap-editor__motion-control-grid">
              {renderRange(
                "Section draw zoom jelly",
                sectionDrawJelly,
                setSectionDrawJelly,
                "Controls how floaty auto-focus feels after drawing a section.",
                { disabled: useAdvancedMotion, displayAsKnob: true, knobLayout: "label-value-knob" },
              )}
              {renderRange(
                "Fit zoom jelly",
                fitViewJelly,
                setFitViewJelly,
                "Controls smoothness and duration of Fit action.",
                { disabled: useAdvancedMotion, displayAsKnob: true, knobLayout: "label-value-knob" },
              )}
              {renderRange(
                "Canvas pan inertia",
                panInertiaJelly,
                setPanInertiaJelly,
                "Controls glide amount after you release a pan drag.",
                { disabled: useAdvancedMotion, displayAsKnob: true, knobLayout: "label-value-knob" },
              )}
              {renderRange(
                "Pointer scroll zoom jelly",
                pointerScrollZoomJelly,
                setPointerScrollZoomJelly,
                "Controls how smooth pointer wheel zoom feels.",
                { disabled: useAdvancedMotion, displayAsKnob: true, knobLayout: "label-value-knob" },
              )}
            </div>
            <div className="seatmap-editor__option-row seatmap-editor__option-row--end seatmap-editor__motion-basic-actions">
              <button
                type="button"
                className="seatmap-editor__panel-button seatmap-editor__panel-button--tiny"
                onClick={handleResetMotionSettings}
              >
                Reset to defaults
              </button>
            </div>
            {renderSwitch("Use advanced overrides", useAdvancedMotion, () => setUseAdvancedMotion((v) => !v))}
          </div>

          {useAdvancedMotion && (
            <div className="seatmap-editor__motion-column seatmap-editor__motion-column--advanced">
              <div className="seatmap-editor__motion-advanced-header">
                <span className="seatmap-editor__option-card-title">Advanced</span>
              </div>
              <span className="seatmap-editor__option-card-title seatmap-editor__option-card-title--subtle">Section</span>
              <div className="seatmap-editor__motion-control-grid is-knob-grid">
                {renderRange(
                  "Draw duration",
                  sectionDrawDurationMs,
                  setSectionDrawDurationMs,
                  "Animation duration in milliseconds.",
                  {
                    min: 100,
                    max: 3000,
                    step: 10,
                    valueFormatter: (n) => `${Math.round(n)}ms`,
                    displayAsKnob: true,
                    compactKnobLayout: true,
                  },
                )}
                {renderRange(
                  "Center pull",
                  sectionDrawCenterPullPct,
                  setSectionDrawCenterPullPct,
                  "How strongly section draw focus moves toward section center.",
                  {
                    min: 0,
                    max: 100,
                    step: 1,
                    valueFormatter: (n) => `${Math.round(n)}%`,
                    displayAsKnob: true,
                    compactKnobLayout: true,
                  },
                )}
                {renderRange(
                  "Zoom boost",
                  sectionDrawZoomBoostPct,
                  setSectionDrawZoomBoostPct,
                  "Additional zoom applied during section draw focus.",
                  {
                    min: 0,
                    max: 50,
                    step: 1,
                    valueFormatter: (n) => `${Math.round(n)}%`,
                    displayAsKnob: true,
                    compactKnobLayout: true,
                  },
                )}
                {renderRange(
                  "Overshoot",
                  sectionDrawOvershootPct,
                  setSectionDrawOvershootPct,
                  "Spring amount near the end of section auto-focus.",
                  {
                    min: 0,
                    max: 180,
                    step: 1,
                    valueFormatter: (n) => `${Math.round(n)}%`,
                    displayAsKnob: true,
                    compactKnobLayout: true,
                  },
                )}
              </div>
              <div className="seatmap-editor__motion-group-divider" />

              <span className="seatmap-editor__option-card-title seatmap-editor__option-card-title--subtle">Fit</span>
              <div className="seatmap-editor__motion-control-grid is-knob-grid">
                {renderRange(
                  "Duration",
                  fitViewDurationMs,
                  setFitViewDurationMs,
                  "Animation duration for Fit action.",
                  {
                    min: 100,
                    max: 3000,
                    step: 10,
                    valueFormatter: (n) => `${Math.round(n)}ms`,
                    displayAsKnob: true,
                    compactKnobLayout: true,
                  },
                )}
                {renderRange(
                  "Overshoot",
                  fitViewOvershootPct,
                  setFitViewOvershootPct,
                  "Spring amount near the end of Fit movement.",
                  {
                    min: 0,
                    max: 180,
                    step: 1,
                    valueFormatter: (n) => `${Math.round(n)}%`,
                    displayAsKnob: true,
                    compactKnobLayout: true,
                  },
                )}
              </div>
              <div className="seatmap-editor__motion-group-divider" />

              <span className="seatmap-editor__option-card-title seatmap-editor__option-card-title--subtle">Pan</span>
              <div className="seatmap-editor__motion-control-grid is-knob-grid">
                {renderRange(
                  "Inertia carry",
                  panInertiaCarryPct,
                  setPanInertiaCarryPct,
                  "Velocity retained at pan release.",
                  {
                    min: 0,
                    max: 95,
                    step: 1,
                    valueFormatter: (n) => `${Math.round(n)}%`,
                    displayAsKnob: true,
                    compactKnobLayout: true,
                  },
                )}
                {renderRange(
                  "Inertia friction",
                  panInertiaFrictionPct,
                  setPanInertiaFrictionPct,
                  "Per-frame damping (higher = longer glide).",
                  {
                    min: 70,
                    max: 99,
                    step: 1,
                    valueFormatter: (n) => `${Math.round(n)}%`,
                    displayAsKnob: true,
                    compactKnobLayout: true,
                  },
                )}
                {renderRange(
                  "Stop speed",
                  panInertiaMinSpeedMilli,
                  setPanInertiaMinSpeedMilli,
                  "Stop threshold in px/ms x1000.",
                  {
                    min: 1,
                    max: 50,
                    step: 1,
                    valueFormatter: (n) => `${Math.round(n)}`,
                    displayAsKnob: true,
                    compactKnobLayout: true,
                  },
                )}
                {renderRange(
                  "Velocity blend",
                  panVelocityBlendPct,
                  setPanVelocityBlendPct,
                  "How quickly release velocity follows latest drag samples.",
                  {
                    min: 5,
                    max: 95,
                    step: 1,
                    valueFormatter: (n) => `${Math.round(n)}%`,
                    displayAsKnob: true,
                    compactKnobLayout: true,
                  },
                )}
                {renderRange(
                  "Stop delta",
                  panStopDeltaMilli,
                  setPanStopDeltaMilli,
                  "Treat movement below this px x1000 as stopped while dragging.",
                  {
                    min: 0,
                    max: 4000,
                    step: 10,
                    valueFormatter: (n) => `${Math.round(n)}`,
                    displayAsKnob: true,
                    compactKnobLayout: true,
                  },
                )}
                {renderRange(
                  "Release idle",
                  panReleaseIdleMs,
                  setPanReleaseIdleMs,
                  "If pointer pauses this long before release, inertia is dropped.",
                  {
                    min: 0,
                    max: 400,
                    step: 5,
                    valueFormatter: (n) => `${Math.round(n)}ms`,
                    displayAsKnob: true,
                    compactKnobLayout: true,
                  },
                )}
              </div>
              <div className="seatmap-editor__motion-group-divider" />

              <span className="seatmap-editor__option-card-title seatmap-editor__option-card-title--subtle">Pointer scroll zoom</span>
              <div className="seatmap-editor__motion-control-grid is-knob-grid">
                {renderRange(
                  "Duration",
                  pointerScrollZoomDurationMs,
                  setPointerScrollZoomDurationMs,
                  "Wheel zoom easing duration.",
                  {
                    min: 60,
                    max: 600,
                    step: 5,
                    valueFormatter: (n) => `${Math.round(n)}ms`,
                    displayAsKnob: true,
                    compactKnobLayout: true,
                  },
                )}
                {renderRange(
                  "Strength",
                  pointerScrollZoomStrengthPct,
                  setPointerScrollZoomStrengthPct,
                  "Per-frame zoom blend amount (higher = snappier response).",
                  {
                    min: 8,
                    max: 55,
                    step: 1,
                    valueFormatter: (n) => `${Math.round(n)}%`,
                    displayAsKnob: true,
                    compactKnobLayout: true,
                  },
                )}
                {renderRange(
                  "Sensitivity",
                  pointerScrollZoomDeltaDivisor,
                  setPointerScrollZoomDeltaDivisor,
                  "Wheel delta divisor (higher = less sensitive).",
                  {
                    min: 250,
                    max: 1400,
                    step: 10,
                    valueFormatter: (n) => `${Math.round(n)}`,
                    displayAsKnob: true,
                    compactKnobLayout: true,
                  },
                )}
              </div>
              <div className="seatmap-editor__motion-advanced-actions">
                <button
                  type="button"
                  className="seatmap-editor__panel-button seatmap-editor__panel-button--tiny"
                  onClick={handleApplyAdvancedToBasic}
                  title="Recalculate basic knobs from advanced settings"
                >
                  Apply to basic
                </button>
              </div>
            </div>
          )}
        </div>,
        `seatmap-editor__option-card--motion${useAdvancedMotion ? " is-advanced-open" : ""}`,
      )
    );

    if (activeToolName === "add-section") {
      return renderOverlay(
        <>
          <span className="seatmap-editor__tool-options-title">Tool Options</span>
          <div className="seatmap-editor__tool-options-divider" />
            {renderOptionCard("Section", (
              <div className="seatmap-editor__option-row">
                <button
                  onClick={() => handleSectionToolVariantChange("section", "rectangle")}
                  className={`seatmap-editor__segmented-button${sectionKind === "section" && sectionMode === "rectangle" ? " is-active" : ""}`}
                >
                  Rectangle
                </button>
                <button
                  onClick={() => handleSectionToolVariantChange("section", "polygon")}
                  className={`seatmap-editor__segmented-button${sectionKind === "section" && sectionMode === "polygon" ? " is-active" : ""}`}
                >
                  Polygon
                </button>
              </div>
            ))}
            {renderOptionCard("Stage", (
              <div className="seatmap-editor__option-row">
                <button
                  onClick={() => handleSectionToolVariantChange("stage", "rectangle")}
                  className={`seatmap-editor__segmented-button${sectionKind === "stage" && sectionMode === "rectangle" ? " is-active" : ""}`}
                >
                  Rectangle
                </button>
                <button
                  onClick={() => handleSectionToolVariantChange("stage", "polygon")}
                  className={`seatmap-editor__segmented-button${sectionKind === "stage" && sectionMode === "polygon" ? " is-active" : ""}`}
                >
                  Polygon
                </button>
              </div>
            ))}
            {renderOptionCard("Dancefloor", (
              <div className="seatmap-editor__option-row">
                <button
                  onClick={() => handleSectionToolVariantChange("dancefloor", "rectangle")}
                  className={`seatmap-editor__segmented-button${sectionKind === "dancefloor" && sectionMode === "rectangle" ? " is-active" : ""}`}
                >
                  Rectangle
                </button>
                <button
                  onClick={() => handleSectionToolVariantChange("dancefloor", "polygon")}
                  className={`seatmap-editor__segmented-button${sectionKind === "dancefloor" && sectionMode === "polygon" ? " is-active" : ""}`}
                >
                  Polygon
                </button>
              </div>
            ))}
            {renderOptionCard("Section resize", (
              <button
                onClick={() => handleToggleSectionResize(true)}
                className={`seatmap-editor__segmented-button${sectionResizeEnabled ? " is-active" : ""}`}
                title="Enable section corner/side resizing"
              >
                {sectionResizeEnabled ? "Resize On" : "Resize Off"}
              </button>
            ))}
            {renderOptionCard("Auto focus", (
              renderSwitch("Zoom to new section", autoFocusNewSection, () =>
                setAutoFocusNewSection((current) => !current),
              )
            ))}
            {isGridOptionsOpen && renderGridOptionsCard()}
            {isEditorSettingsOpen && renderMotionSettingsCard()}
        </>
      );
    }

    if (activeToolName === "select") {
      return renderOverlay(
        <>
          <span className="seatmap-editor__tool-options-title">Tool Options</span>
          <div className="seatmap-editor__tool-options-divider" />
          {renderOptionCard("Section resize", (
              <button
                onClick={() => handleToggleSectionResize(false)}
                className={`seatmap-editor__segmented-button${sectionResizeEnabled ? " is-active" : ""}`}
              >
                {sectionResizeEnabled ? "Resize On" : "Resize Off"}
              </button>
          ))}
          {isGridOptionsOpen && renderGridOptionsCard()}
          {isEditorSettingsOpen && renderMotionSettingsCard()}
        </>
      );
    }

    if (activeToolName !== "add-row") {
      if (!isGridOptionsOpen && !isEditorSettingsOpen) return null;
      return renderOverlay(
        <>
          <span className="seatmap-editor__tool-options-title">Tool Options</span>
          <div className="seatmap-editor__tool-options-divider" />
          {isGridOptionsOpen && renderGridOptionsCard()}
          {isEditorSettingsOpen && renderMotionSettingsCard()}
        </>
      );
    }

    return renderOverlay(
      <>
        <span className="seatmap-editor__tool-options-title">Tool Options</span>
        <div className="seatmap-editor__tool-options-divider" />
        {renderOptionCard("Row layout", (
          <div className="seatmap-editor__row-layout-body">
            <div className="seatmap-editor__row-layout-controls">
              <label className="seatmap-editor__label seatmap-editor__option-row">
                  Seats:
                  <div className="seatmap-editor__input-stepper">
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={seatsPerRow}
                      onChange={(e) =>
                        handleSeatsPerRowChange(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))
                      }
                      className="seatmap-editor__input seatmap-editor__input--stepper"
                    />
                    <button
                      type="button"
                      className="seatmap-editor__stepper-button"
                      aria-label="Increase seats per row"
                      onClick={() => handleSeatsPerRowChange(seatsPerRow + 1)}
                    >
                      +
                    </button>
                    <button
                      type="button"
                      className="seatmap-editor__stepper-button"
                      aria-label="Decrease seats per row"
                      onClick={() => handleSeatsPerRowChange(seatsPerRow - 1)}
                    >
                      -
                    </button>
                  </div>
              </label>

              <label className="seatmap-editor__label seatmap-editor__option-row">
                  Rows:
                  <div className="seatmap-editor__input-stepper">
                    <input
                        type="number"
                        min={1}
                        max={100}
                        value={rowsCount}
                        onChange={(e) =>
                            handleRowsCountChange(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))
                        }
                        className="seatmap-editor__input seatmap-editor__input--stepper"
                    />
                    <button
                      type="button"
                      className="seatmap-editor__stepper-button"
                      aria-label="Increase rows"
                      onClick={() => handleRowsCountChange(rowsCount + 1)}
                    >
                      +
                    </button>
                    <button
                      type="button"
                      className="seatmap-editor__stepper-button"
                      aria-label="Decrease rows"
                      onClick={() => handleRowsCountChange(rowsCount - 1)}
                    >
                      -
                    </button>
                  </div>
              </label>

              <div className="seatmap-editor__option-card-title">
                  Total seats to add: {seatsPerRow * Math.max(1, rowsCount)}
              </div>
            </div>
            <div className="seatmap-editor__row-layout-separator" />
            <div className="seatmap-editor__row-presets">
              <table className="seatmap-editor__row-presets-table">
                <tbody>
                  {rowPresetRows.map((rowPreset) => (
                    <tr key={`row-preset-${rowPreset}`}>
                      <th scope="row" className="seatmap-editor__row-preset-row-label">
                        {rowPreset}
                      </th>
                      {rowPresetSeats.map((seatPreset) => {
                        const isActive = rowsCount === rowPreset && seatsPerRow === seatPreset;
                        return (
                          <td key={`${rowPreset}-${seatPreset}`}>
                            <button
                              type="button"
                              className={`seatmap-editor__row-preset-button${isActive ? " is-active" : ""}`}
                              onClick={() => {
                                handleRowsCountChange(rowPreset);
                                handleSeatsPerRowChange(seatPreset);
                              }}
                            >
                              {seatPreset}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}

        {renderOptionCard("Orientation", (
          <>
          <div className="seatmap-editor__option-row seatmap-editor__orientation-toggle">
              <span
                className={`seatmap-editor__orientation-label${rowDirectionArrowMode === "viewer-direction" ? " is-active" : ""}`}
              >
                Viewer direction
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={rowDirectionArrowMode === "row-direction"}
                onClick={() =>
                  setRowDirectionArrowMode((mode) =>
                    mode === "row-direction" ? "viewer-direction" : "row-direction",
                  )
                }
                className={`seatmap-editor__switch-track seatmap-editor__switch-track--wide${rowDirectionArrowMode === "row-direction" ? " is-checked" : ""}`}
                title="Toggle arrow orientation mode"
              >
                <span
                  className="seatmap-editor__switch-thumb seatmap-editor__switch-thumb--wide"
                  style={{
                    transform:
                      rowDirectionArrowMode === "row-direction"
                        ? "translateX(22px)"
                        : "translateX(0)",
                  }}
                />
              </button>
              <span
                className={`seatmap-editor__orientation-label${rowDirectionArrowMode === "row-direction" ? " is-active" : ""}`}
              >
                Row direction
              </span>
          </div>

          {renderRange(
            "Orientation",
            rowOrientationKnobDeg,
            handleRowOrientationKnobChange,
            "Drag vertically on the knob to set row orientation.",
            {
              min: 0,
              max: 359,
              step: 1,
              valueFormatter: (n) => `${Math.round(n)}°`,
              displayAsKnob: true,
              knobMode: "dial360",
              knobFillStartDeg: 0,
              knobNamespace: "tool",
              valuePlacement: "knob",
              knobRightContent: (
                <button
                  onClick={handleRotateRowOrientationQuarterTurn}
                  className="seatmap-editor__segmented-button"
                  title="Rotate row direction by 90 degrees"
                >
                  +90°
                </button>
              ),
            },
          )}

          <div className="seatmap-editor__hint-text">
              {rowDirectionArrowMode === "row-direction"
                ? "Arrow: row direction (viewer +90°)"
                : "Arrow: viewer direction (0° = up, 90° = right)"}
          </div>
          </>
        ))}
        {isGridOptionsOpen && renderGridOptionsCard()}
        {isEditorSettingsOpen && renderMotionSettingsCard()}
      </>
    );
  };

  // Keyboard shortcuts — skip when user is typing in an input field
  useEffect(() => {
    const isTyping = () => {
      const activeElement = document.activeElement as HTMLElement | null;
      if (!activeElement) return false;
      const tag = activeElement.tagName;
      return (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        activeElement.isContentEditable
      );
    };
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Alt") {
        setIsAltPressed(true);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey) historyRef.current.redo();
        else historyRef.current.undo();
        return;
      }
      if (isTyping()) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        handleDeleteSelectedObjects();
        return;
      }
      if (e.key === "Escape" && activeToolName === "add-section") {
        e.preventDefault();
        addSectionTool.cancelDrawing();
        return;
      }
      if (e.key === "v" || e.key === "2") setActiveTool("select");
      if (e.key === "h" || e.key === "1") setActiveTool("pan");
      if (e.key === "s" || e.key === "3") setActiveTool("add-section");
      if (e.key === "r" || e.key === "4") setActiveTool("add-row");
      if (e.key === "a" || e.key === "5") setActiveTool("add-seat");
      if (e.key === " ") {
        e.preventDefault();
      }
    };
    const upHandler = (e: KeyboardEvent) => {
      if (e.key === "Alt") {
        setIsAltPressed(false);
      }
      if (isTyping()) return;
      if (e.key === " ") {
        e.preventDefault();
        setActiveTool(activeToolName === "pan" ? lastNonPanToolNameRef.current : "pan");
      }
    };
    const blurHandler = () => {
      setIsAltPressed(false);
    };
    window.addEventListener("keydown", handler);
    window.addEventListener("keyup", upHandler);
    window.addEventListener("blur", blurHandler);
    return () => {
      window.removeEventListener("keydown", handler);
      window.removeEventListener("keyup", upHandler);
      window.removeEventListener("blur", blurHandler);
    };
  }, [setActiveTool, activeToolName, handleDeleteSelectedObjects, addSectionTool]);

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
      const rect = e.currentTarget.getBoundingClientRect();
      setCursorScreenPoint({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
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

  return (
    <div className="seatmap-editor seatmap-editor--root">
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
        showHints={showHints}
        onToggleHints={() => setShowHints((current) => !current)}
        isEditorSettingsOpen={isEditorSettingsOpen}
        onToggleEditorSettings={() => setIsEditorSettingsOpen((current) => !current)}
        translate={translate}
      />

      <div className="seatmap-editor__canvas-layout">
        <div
          ref={canvasAreaRef}
          className="seatmap-editor__canvas-area"
          style={{ cursor: (toolMap[activeToolName] ?? selectTool).cursor }}
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={handleCanvasPointerMove}
          onPointerUp={handleCanvasPointerUp}
          onPointerCancel={handleCanvasPointerCancel}
          onPointerLeave={() => setCursorScreenPoint(null)}
        >
          <SeatmapCanvas
            panOnLeftClick={false}
            showGridLines={gridEnabled && showCanvasGrid}
            showSectionGridDots={gridEnabled && showSectionGrid}
            canvasGridLineStyle={canvasGridStyle}
            sectionGridMarkerStyle={sectionGridStyle}
            panInertiaJelly={panInertiaJelly}
            panInertiaCarry={useAdvancedMotion ? panInertiaCarryPct / 100 : undefined}
            panInertiaFriction={useAdvancedMotion ? panInertiaFrictionPct / 100 : undefined}
            panInertiaMinSpeed={useAdvancedMotion ? panInertiaMinSpeedMilli / 1000 : undefined}
            pointerScrollZoomJelly={pointerScrollZoomJelly}
            pointerScrollZoomDurationMs={useAdvancedMotion ? pointerScrollZoomDurationMs : undefined}
            pointerScrollZoomStrengthPct={useAdvancedMotion ? pointerScrollZoomStrengthPct : undefined}
            pointerScrollZoomDeltaDivisor={useAdvancedMotion ? pointerScrollZoomDeltaDivisor : undefined}
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
          {showHints && sectionHintText && cursorScreenPoint && (
            <div
              className="seatmap-editor__hint-bubble"
              style={{
                left: cursorScreenPoint.x + 14,
                top: cursorScreenPoint.y + 14,
              }}
            >
              {sectionHintText}
            </div>
          )}
        </div>

        <div className="seatmap-editor__sidebar">
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
            translate={translate}
          />
          {selectedSeatIds.size === 0 && (
            <>
              <div className="seatmap-editor__sidebar-separator" />
              <LayerPanel
                venue={venue}
                selectedSeatIds={selectedSeatIds}
                selectedSectionIds={selectedSectionIds}
                onSelectSection={handleSelectSection}
                translate={translate}
              />
              <div className="seatmap-editor__sidebar-separator" />
              <CategoryManager
                venue={venue}
                history={historyRef.current}
                store={store}
                fetchCategoryPrices={fetchCategoryPrices}
                translate={translate}
              />
            </>
          )}
          {selectedSeatIds.size === 0 && selectedSectionIds.size === 0 && (
            <>
              <div className="seatmap-editor__sidebar-separator" />
              <StatusManager
                venue={venue}
                history={historyRef.current}
                store={store}
                translate={translate}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function SeatmapEditor({ venue, onChange, onSave, fetchCategoryPrices, translate, className }: SeatmapEditorProps) {
  return (
    <SeatmapProvider venue={venue}>
      <div className={className ? `seatmap-editor__host ${className}` : "seatmap-editor__host"}>
        <EditorInner onChange={onChange} onSave={onSave} fetchCategoryPrices={fetchCategoryPrices} translate={translate} />
      </div>
    </SeatmapProvider>
  );
}
