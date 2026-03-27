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
  seatsPerRow: number;
  onSeatsPerRowChange: (n: number) => void;
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
  seatsPerRow,
  onSeatsPerRowChange,
  style,
}: ToolbarProps) {
  return (
    <div
      style={{
        display: "flex",
        gap: 4,
        padding: "8px 12px",
        background: "#1a1a2e",
        borderBottom: "1px solid #2a2a4a",
        alignItems: "center",
        flexWrap: "wrap",
        ...style,
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

      {activeTool === "add-row" && (
        <>
          <div style={{ width: 1, height: 24, background: "#3a3a5a", margin: "0 6px" }} />
          <label style={{ color: "#9e9e9e", fontSize: 12, fontFamily: "system-ui", display: "flex", alignItems: "center", gap: 4 }}>
            Seats/row:
            <input
              type="number"
              min={1}
              max={100}
              value={seatsPerRow}
              onChange={(e) => onSeatsPerRowChange(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))}
              style={{
                width: 50,
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
        </>
      )}

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
  );
}
