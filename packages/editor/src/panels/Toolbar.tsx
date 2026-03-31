import type { CSSProperties } from "react";

export interface ToolbarProps {
  activeTool: string;
  onToolChange: (tool: string) => void;
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
  border: "1px solid #3a3a5a",
  borderRadius: 6,
  background: "#2a2a4a",
  color: "#e0e0e0",
  cursor: "pointer",
  fontSize: 13,
  fontFamily: "system-ui",
  display: "flex",
  alignItems: "center",
  gap: 4,
};

const activeBtnStyle: CSSProperties = {
  ...btnBase,
  background: "#4a4a7a",
  borderColor: "#6a6aaa",
};

export function Toolbar({
  activeTool,
  onToolChange,
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
        background: "#1a1a2e",
        borderBottom: "1px solid #2a2a4a",
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

        <div style={{ width: 1, height: 24, background: "#3a3a5a", margin: "0 6px" }} />

        <button onClick={onUndo} disabled={!canUndo} style={{ ...btnBase, opacity: canUndo ? 1 : 0.4 }} title="Undo (Ctrl+Z)">
          ↩ Undo
        </button>
        <button onClick={onRedo} disabled={!canRedo} style={{ ...btnBase, opacity: canRedo ? 1 : 0.4 }} title="Redo (Ctrl+Shift+Z)">
          ↪ Redo
        </button>

        <div style={{ width: 1, height: 24, background: "#3a3a5a", margin: "0 6px" }} />

        <button onClick={onFitView} style={btnBase} title="Fit to view">
          ⊞ Fit
        </button>

        <div style={{ width: 1, height: 24, background: "#3a3a5a", margin: "0 6px" }} />

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
