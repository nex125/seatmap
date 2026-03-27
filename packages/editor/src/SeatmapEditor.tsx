import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Venue } from "@nex125/seatmap-core";
import { CommandHistory, venueAABB, serializeVenue, deserializeVenue, type Viewport } from "@nex125/seatmap-core";
import { SeatmapProvider, SeatmapCanvas, useSeatmapContext } from "@nex125/seatmap-react";
import { useStore } from "zustand";
import { PanTool } from "./tools/PanTool";
import { SelectTool } from "./tools/SelectTool";
import { AddSectionTool } from "./tools/AddSectionTool";
import { AddRowTool } from "./tools/AddRowTool";
import { AddSeatTool } from "./tools/AddSeatTool";
import type { BaseTool, ToolPointerEvent } from "./tools/BaseTool";
import { Toolbar } from "./panels/Toolbar";
import { PropertyPanel } from "./panels/PropertyPanel";
import { CategoryManager } from "./panels/CategoryManager";
import { LayerPanel } from "./panels/LayerPanel";

export interface SeatmapEditorProps {
  venue?: Venue;
  onChange?: (venue: Venue) => void;
  className?: string;
}

function PolygonPreviewOverlay({
  points,
  closeable,
  viewport,
}: {
  points: Array<{ x: number; y: number }>;
  closeable: boolean;
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
      {screenPoints.length >= 3 && (
        <line
          x1={last.x} y1={last.y} x2={first.x} y2={first.y}
          stroke={closeable ? "rgba(100, 255, 100, 0.8)" : "rgba(100, 180, 255, 0.3)"}
          strokeWidth={closeable ? 2 : 1}
          strokeDasharray="4 4"
        />
      )}
      {screenPoints.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={i === 0 && closeable ? 8 : 4}
          fill={i === 0 && closeable ? "rgba(100, 255, 100, 0.8)" : "rgba(100, 180, 255, 0.8)"}
        />
      ))}
      {points.length >= 2 && (
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

function EditorInner({ onChange }: { onChange?: (venue: Venue) => void }) {
  const { store, viewport, spatialIndex } = useSeatmapContext();
  const venue = useStore(store, (s) => s.venue);
  const selectedSeatIds = useStore(store, (s) => s.selectedSeatIds);

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

  const [seatsPerRow, setSeatsPerRow] = useState(10);
  const handleSeatsPerRowChange = useCallback(
    (n: number) => {
      setSeatsPerRow(n);
      addRowTool.seatsPerRow = n;
    },
    [addRowTool],
  );

  const setActiveTool = useCallback(
    (name: string) => {
      activeToolRef.current.onDeactivate();
      const tool = toolMap[name] ?? selectTool;
      tool.onActivate(viewport, store);
      activeToolRef.current = tool;
      setActiveToolName(name);
    },
    [toolMap, selectTool, viewport, store],
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
      onChange?.(venue);
    }
  }, [venue, spatialIndex, onChange]);

  const handleSave = useCallback(() => {
    const v = store.getState().venue;
    if (!v) return;
    const json = serializeVenue(v);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${v.name.replace(/\s+/g, "_").toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [store]);

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
        store.getState().setVenue({
          ...v,
          backgroundImage: dataUrl,
          backgroundImageOpacity: v.backgroundImageOpacity ?? 0.5,
        });
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

  const handleSelectSection = useCallback(
    (sectionId: string) => {
      if (!venue) return;
      const section = venue.sections.find((s) => s.id === sectionId);
      if (!section) return;
      const allSeatIds = section.rows.flatMap((r) => r.seats.map((s) => s.id));
      store.getState().setSelection(allSeatIds);
    },
    [venue, store],
  );

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
        setActiveTool("pan");
      }
    };
    const upHandler = (e: KeyboardEvent) => {
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

  // Tool pointer event adapter for the canvas overlay
  const handleCanvasPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      // Capture so drag operations complete even if pointer leaves the canvas area
      e.currentTarget.setPointerCapture(e.pointerId);
      const rect = e.currentTarget.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      const world = viewport.screenToWorld(screenX, screenY);
      const toolEvent: ToolPointerEvent = {
        worldX: world.x,
        worldY: world.y,
        screenX: e.clientX,
        screenY: e.clientY,
        shiftKey: e.shiftKey,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        button: e.button,
      };
      activeToolRef.current.onPointerDown(toolEvent, viewport, store);
    },
    [viewport, store],
  );

  const handleCanvasPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      const world = viewport.screenToWorld(screenX, screenY);
      const toolEvent: ToolPointerEvent = {
        worldX: world.x,
        worldY: world.y,
        screenX: e.clientX,
        screenY: e.clientY,
        shiftKey: e.shiftKey,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        button: e.button,
      };
      activeToolRef.current.onPointerMove(toolEvent, viewport, store);
    },
    [viewport, store],
  );

  const handleCanvasPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      const world = viewport.screenToWorld(screenX, screenY);
      const toolEvent: ToolPointerEvent = {
        worldX: world.x,
        worldY: world.y,
        screenX: e.clientX,
        screenY: e.clientY,
        shiftKey: e.shiftKey,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        button: e.button,
      };
      activeToolRef.current.onPointerUp(toolEvent, viewport, store);
    },
    [viewport, store],
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
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={() => historyRef.current.undo()}
        onRedo={() => historyRef.current.redo()}
        onFitView={handleFitView}
        onSave={handleSave}
        onLoad={handleLoad}
        seatsPerRow={seatsPerRow}
        onSeatsPerRowChange={handleSeatsPerRowChange}
      />

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <div
          style={{ flex: 1, position: "relative", cursor: (toolMap[activeToolName] ?? selectTool).cursor }}
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={handleCanvasPointerMove}
          onPointerUp={handleCanvasPointerUp}
        >
          <SeatmapCanvas panOnLeftClick={false} />
          {polygonPoints.length > 0 && (
            <PolygonPreviewOverlay
              points={polygonPoints}
              closeable={polygonCloseable}
              viewport={viewport}
            />
          )}
        </div>

        <div style={sidebarStyle}>
          <PropertyPanel
            venue={venue}
            selectedSeatIds={selectedSeatIds}
            history={historyRef.current}
            store={store}
            onUploadBackground={handleUploadBackground}
            onRemoveBackground={handleRemoveBackground}
            onBackgroundOpacityChange={handleBackgroundOpacityChange}
          />
          <div style={{ height: 1, background: "#2a2a4a", margin: "0 16px" }} />
          <LayerPanel
            venue={venue}
            selectedSeatIds={selectedSeatIds}
            onSelectSection={handleSelectSection}
          />
          <div style={{ height: 1, background: "#2a2a4a", margin: "0 16px" }} />
          <CategoryManager
            venue={venue}
            history={historyRef.current}
            store={store}
          />
        </div>
      </div>
    </div>
  );
}

export function SeatmapEditor({ venue, onChange, className }: SeatmapEditorProps) {
  return (
    <SeatmapProvider venue={venue}>
      <div className={className} style={{ width: "100%", height: "100%" }}>
        <EditorInner onChange={onChange} />
      </div>
    </SeatmapProvider>
  );
}
