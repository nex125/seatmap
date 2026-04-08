import type { CSSProperties } from "react";

export interface ToolbarProps {
  activeTool: string;
  onToolChange: (tool: string) => void;
  gridEnabled: boolean;
  isGridOptionsOpen: boolean;
  onToggleGridOptions: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onFitView: () => void;
  onSave: () => void;
  onLoad: () => void;
  style?: CSSProperties;
}

const tools = [
  { id: "pan", label: "Pan", icon: "✋" },
  { id: "select", label: "Select", icon: "↖" },
  { id: "add-section", label: "Section", icon: "▢" },
  { id: "add-row", label: "Row", icon: "⋯" },
  { id: "add-seat", label: "Seat", icon: "+" },
];

const btnBase: CSSProperties = {
  padding: "6px 10px",
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: "#3a3836",
  borderRadius: 6,
  background: "#242424",
  color: "#e5e2e1",
  cursor: "pointer",
  fontSize: 13,
  fontFamily: "system-ui",
  display: "flex",
  alignItems: "center",
  gap: 4,
};

const activeBtnStyle: CSSProperties = {
  ...btnBase,
  background: "#2e2e2e",
  borderColor: "#6e6642",
};

export function Toolbar({
  activeTool,
  onToolChange,
  gridEnabled,
  isGridOptionsOpen,
  onToggleGridOptions,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onFitView,
  onSave,
  onLoad,
  style,
}: ToolbarProps) {
  return (
    <div
      style={{
        display: "flex",
        background: "#181818",
        borderBottom: "1px solid #2b2a29",
        ...style,
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 4,
          padding: "8px 12px",
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        {tools.map((tool) => (
          <button
            key={tool.id}
            onClick={() => onToolChange(tool.id)}
            style={activeTool === tool.id ? activeBtnStyle : btnBase}
            title={tool.label}
          >
            <span>{tool.icon}</span>
            <span>{tool.label}</span>
          </button>
        ))}

        <div style={{ width: 1, height: 24, background: "#353331", margin: "0 6px" }} />

        <button onClick={onUndo} disabled={!canUndo} style={{ ...btnBase, opacity: canUndo ? 1 : 0.4 }} title="Undo (Ctrl+Z)">
          ↩ Undo
        </button>
        <button onClick={onRedo} disabled={!canRedo} style={{ ...btnBase, opacity: canRedo ? 1 : 0.4 }} title="Redo (Ctrl+Shift+Z)">
          ↪ Redo
        </button>

        <div style={{ width: 1, height: 24, background: "#353331", margin: "0 6px" }} />

        <button onClick={onFitView} style={btnBase} title="Fit to view">
          ⊞ Fit
        </button>
        <button
          onClick={onToggleGridOptions}
          style={{
            ...(isGridOptionsOpen ? activeBtnStyle : btnBase),
            borderColor: gridEnabled ? "#7f7340" : (isGridOptionsOpen ? activeBtnStyle.borderColor : btnBase.borderColor),
            boxShadow: gridEnabled ? "0 0 0 1px #7f7340 inset" : "none",
          }}
          title="Show grid options"
        >
          # Grid
        </button>

        <div style={{ width: 1, height: 24, background: "#353331", margin: "0 6px" }} />

        <button onClick={onSave} style={btnBase} title="Export venue as JSON">
          ↓ Save
        </button>
        <button onClick={onLoad} style={btnBase} title="Import venue from JSON">
          ↑ Load
        </button>
      </div>
    </div>
  );
}
