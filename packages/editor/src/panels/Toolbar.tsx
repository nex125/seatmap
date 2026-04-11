import type { CSSProperties } from "react";
import type { SVGProps } from "react";

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
  showHints: boolean;
  onToggleHints: () => void;
  isEditorSettingsOpen: boolean;
  onToggleEditorSettings: () => void;
  style?: CSSProperties;
}

type IconProps = SVGProps<SVGSVGElement>;

function PanIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden {...props}>
      <path d="M8 11V6.6a1.6 1.6 0 1 1 3.2 0V10" strokeLinecap="round" />
      <path d="M11.2 10V5.2a1.6 1.6 0 1 1 3.2 0v5" strokeLinecap="round" />
      <path d="M14.4 10V6.8a1.6 1.6 0 1 1 3.2 0v6.2c0 4-2 6.2-6 6.2h-.4c-3.3 0-5.8-2.2-6.4-5.4l-.7-3.7a1.4 1.4 0 1 1 2.7-.6l.6 2.5" strokeLinecap="round" />
    </svg>
  );
}

function SelectIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden {...props}>
      <path d="M5 4.5v14l4.4-3 2.5 4.1 2.1-1.3-2.5-4.1 5-.3L5 4.5Z" strokeLinejoin="round" />
    </svg>
  );
}

function SectionIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden {...props}>
      <rect x="4.5" y="4.5" width="15" height="15" rx="2.5" />
      <path d="M9 9h6M9 15h6" strokeLinecap="round" />
    </svg>
  );
}

function RowIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden {...props}>
      <path d="M4.5 8h15M4.5 12h15M4.5 16h15" strokeLinecap="round" />
      <circle cx="6.4" cy="8" r="0.8" fill="currentColor" stroke="none" />
      <circle cx="6.4" cy="12" r="0.8" fill="currentColor" stroke="none" />
      <circle cx="6.4" cy="16" r="0.8" fill="currentColor" stroke="none" />
    </svg>
  );
}

function SeatIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden {...props}>
      <path d="M7 12.5V9.4a2.4 2.4 0 1 1 4.8 0v3.1" strokeLinecap="round" />
      <path d="M5 17v-3.1a1.9 1.9 0 0 1 1.9-1.9h8.2a1.9 1.9 0 0 1 1.9 1.9V17" strokeLinecap="round" />
      <path d="M4.8 17.8h14.4" strokeLinecap="round" />
    </svg>
  );
}

function UndoIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden {...props}>
      <path d="M8.5 8.5H5v3.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.2 8.7c1.8-2 4.2-3.2 7-3.2 5 0 8.8 3.7 8.8 8.5" strokeLinecap="round" />
    </svg>
  );
}

function RedoIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden {...props}>
      <path d="M15.5 8.5H19v3.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M18.8 8.7c-1.8-2-4.2-3.2-7-3.2C6.8 5.5 3 9.2 3 14" strokeLinecap="round" />
    </svg>
  );
}

function FitIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden {...props}>
      <path d="M9 4.8H4.8V9M15 4.8h4.2V9M9 19.2H4.8V15M15 19.2h4.2V15" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="8.2" y="8.2" width="7.6" height="7.6" rx="1.4" />
    </svg>
  );
}

function GridIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden {...props}>
      <rect x="5" y="5" width="14" height="14" rx="2" />
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  );
}

function HintIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden {...props}>
      <path d="M9.4 9.2a2.7 2.7 0 1 1 4.8 1.6c-.6.8-1.6 1.4-1.8 2.7" strokeLinecap="round" />
      <path d="M12 17.4h.01M8.7 19h6.6" strokeLinecap="round" />
      <path d="M12 3.8a8.2 8.2 0 1 1 0 16.4 8.2 8.2 0 0 1 0-16.4Z" />
    </svg>
  );
}

function SaveIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden {...props}>
      <path d="M12 4.5v9.2M8.4 10.7 12 14.3l3.6-3.6" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="5" y="16.2" width="14" height="3.8" rx="1.2" />
    </svg>
  );
}

function LoadIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden {...props}>
      <path d="M12 14.7V5.5M8.4 9.3 12 5.7l3.6 3.6" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="5" y="16.2" width="14" height="3.8" rx="1.2" />
    </svg>
  );
}

function SettingsIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden {...props}>
      <path d="M12 8.2a3.8 3.8 0 1 1 0 7.6 3.8 3.8 0 0 1 0-7.6Z" />
      <path
        d="m18.8 12 .9 1.6-1.5 2.6-1.8-.1a6.8 6.8 0 0 1-1.4.8L14.4 19h-3l-.6-2.1a6.8 6.8 0 0 1-1.4-.8l-1.8.1-1.5-2.6.9-1.6a6.7 6.7 0 0 1 0-1.6l-.9-1.6 1.5-2.6 1.8.1c.4-.3.9-.6 1.4-.8l.6-2.1h3l.6 2.1c.5.2 1 .5 1.4.8l1.8-.1 1.5 2.6-.9 1.6c.1.5.1 1.1 0 1.6Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const tools = [
  { id: "pan", label: "Pan", icon: PanIcon },
  { id: "select", label: "Select", icon: SelectIcon },
  { id: "add-section", label: "Section", icon: SectionIcon },
  { id: "add-row", label: "Row", icon: RowIcon },
  { id: "add-seat", label: "Seat", icon: SeatIcon },
] as const;

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
  showHints,
  onToggleHints,
  isEditorSettingsOpen,
  onToggleEditorSettings,
  style,
}: ToolbarProps) {
  const getToolbarButtonClassName = (
    isActive = false,
    isHighlighted = false,
  ) =>
    `seatmap-editor__toolbar-button${isActive ? " is-active" : ""}${isHighlighted ? " is-highlighted" : ""}`;

  return (
    <div
      className={`seatmap-editor__toolbar${showHints ? " has-shortcuts-row" : ""}`}
      style={{
        ...style,
      }}
    >
      <div className="seatmap-editor__toolbar-row seatmap-editor__toolbar-row--primary">
        {tools.map((tool) => (
          <button
            key={tool.id}
            type="button"
            onClick={() => onToolChange(tool.id)}
            className={`${getToolbarButtonClassName(activeTool === tool.id)} seatmap-editor__toolbar-tool-button`}
            title={tool.label}
          >
            <tool.icon className="seatmap-editor__toolbar-icon" />
            <span>{tool.label}</span>
          </button>
        ))}

        <div className="seatmap-editor__toolbar-divider" />

        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          className={getToolbarButtonClassName()}
          title="Undo (Ctrl+Z)"
        >
          <UndoIcon className="seatmap-editor__toolbar-icon" />
          <span>Undo</span>
        </button>
        <button
          type="button"
          onClick={onRedo}
          disabled={!canRedo}
          className={getToolbarButtonClassName()}
          title="Redo (Ctrl+Shift+Z)"
        >
          <RedoIcon className="seatmap-editor__toolbar-icon" />
          <span>Redo</span>
        </button>

        <div className="seatmap-editor__toolbar-divider" />

        <button type="button" onClick={onFitView} className={getToolbarButtonClassName()} title="Fit to view">
          <FitIcon className="seatmap-editor__toolbar-icon" />
          <span>Fit</span>
        </button>
        <button
          type="button"
          onClick={onToggleGridOptions}
          className={getToolbarButtonClassName(isGridOptionsOpen, gridEnabled)}
          title="Show grid options"
        >
          <GridIcon className="seatmap-editor__toolbar-icon" />
          <span>Grid</span>
        </button>
        <button
          type="button"
          onClick={onToggleHints}
          className={getToolbarButtonClassName(showHints, showHints)}
          title="Toggle inline editor hints"
        >
          <HintIcon className="seatmap-editor__toolbar-icon" />
          <span>Hints</span>
        </button>
        <button
          type="button"
          onClick={onToggleEditorSettings}
          className={getToolbarButtonClassName(isEditorSettingsOpen, isEditorSettingsOpen)}
          title="Editor settings"
        >
          <SettingsIcon className="seatmap-editor__toolbar-icon" />
          <span>Settings</span>
        </button>

        <div className="seatmap-editor__toolbar-divider" />

        <button type="button" onClick={onSave} className={getToolbarButtonClassName()} title="Export venue as JSON">
          <SaveIcon className="seatmap-editor__toolbar-icon" />
          <span>Save</span>
        </button>
        <button type="button" onClick={onLoad} className={getToolbarButtonClassName()} title="Import venue from JSON">
          <LoadIcon className="seatmap-editor__toolbar-icon" />
          <span>Load</span>
        </button>
        {showHints && (
          <div className="seatmap-editor__toolbar-shortcuts-panel" aria-label="Keyboard shortcuts">
            <span className="seatmap-editor__toolbar-shortcuts-title">Keyboard shortcuts</span>
            <div className="seatmap-editor__toolbar-shortcuts-row">
              <span><kbd>H</kbd> / <kbd>1</kbd> - Pan</span>
              <span><kbd>V</kbd> / <kbd>2</kbd> - Select</span>
              <span><kbd>S</kbd> / <kbd>3</kbd> - Add Section</span>
            </div>
            <div className="seatmap-editor__toolbar-shortcuts-row">
              <span><kbd>R</kbd> / <kbd>4</kbd> - Add Row</span>
              <span><kbd>A</kbd> / <kbd>5</kbd> - Add Seat</span>
              <span><kbd>Space</kbd> (toggle) - Toggle Pan</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
