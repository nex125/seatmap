import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Venue } from "@nex125/seatmap-core";
import { deserializeVenue, generateId } from "@nex125/seatmap-core";
import { SeatmapCanvas, SeatmapProvider, TooltipOverlay, useSeatmapContext } from "@nex125/seatmap-react";
import {
  SeatmapViewer,
  getSeatmapViewerSharedThemeRootStyle,
  seatmapViewerSharedThemeClassNames,
  seatmapViewerSharedThemeRootClassName,
} from "@nex125/seatmap-viewer";
import { SeatmapEditor } from "@nex125/seatmap-editor";
import { sampleVenue } from "./sampleVenue";
import { generateLargeVenue } from "./generateLargeVenue";
import "@nex125/seatmap-viewer/theme.css";
import "@nex125/seatmap-editor/theme.css";

type Tab = "viewer" | "editor";
type VenueSize = "sample" | "5k" | "25k" | "50k" | `template:${string}`;
type EditorMode = "template" | "event";

interface TemplateRecord {
  id: string;
  name: string;
  layout: Venue;
}

const TEMPLATES_STORAGE_KEY = "seatmap-demo-templates-v1";

function createDefaultTemplateRecord(): TemplateRecord {
  return {
    id: "template-sample-hall",
    name: "Sample Hall Template",
    layout: cloneVenue(sampleVenue),
  };
}

function readTemplatesFromStorage(): TemplateRecord[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = localStorage.getItem(TEMPLATES_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as TemplateRecord[];
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item) => item && typeof item.id === "string" && typeof item.name === "string" && item.layout)
      .map((item) => ({
        id: item.id,
        name: item.name,
        layout: cloneVenue(item.layout),
      }));
  } catch {
    return [];
  }
}

function createEmptyVenue(name = "New Venue"): Venue {
  return {
    id: generateId(),
    name,
    bounds: { width: 1200, height: 900 },
    categories: [
      { id: "cat-default", name: "Standard", color: "#4caf50", backendPrice: 99 },
      { id: "cat-vip", name: "VIP", color: "#e91e63", backendPrice: 199 },
    ],
    seatStatuses: [
      { id: "available", name: "Available", color: "#4caf50" },
      { id: "locked", name: "Locked", color: "#f44336" },
      { id: "booked", name: "Booked", color: "#9e9e9e" },
    ],
    sections: [],
    gaAreas: [],
    tables: [],
  };
}

function cloneVenue(venue: Venue): Venue {
  return deserializeVenue(JSON.stringify(venue));
}

function PreviewSeatmapCanvas() {
  const { viewport } = useSeatmapContext();
  const dragStateRef = useRef<{ dragging: boolean; x: number; y: number }>({
    dragging: false,
    x: 0,
    y: 0,
  });

  return (
    <div
      style={{ width: "100%", height: "100%", position: "relative", cursor: dragStateRef.current.dragging ? "grabbing" : "grab" }}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        dragStateRef.current = { dragging: true, x: event.clientX, y: event.clientY };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (!dragStateRef.current.dragging) return;
        const dx = event.clientX - dragStateRef.current.x;
        const dy = event.clientY - dragStateRef.current.y;
        dragStateRef.current = { dragging: true, x: event.clientX, y: event.clientY };
        viewport.pan(dx, dy);
      }}
      onPointerUp={(event) => {
        dragStateRef.current = { ...dragStateRef.current, dragging: false };
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      }}
      onPointerCancel={(event) => {
        dragStateRef.current = { ...dragStateRef.current, dragging: false };
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      }}
    >
      <SeatmapCanvas showSectionLabels enableSeatHover panOnLeftClick={false} />
      <TooltipOverlay />
    </div>
  );
}

function App() {
  const [tab, setTab] = useState<Tab>("editor");
  const [venueSize, setVenueSize] = useState<VenueSize>("sample");
  const [selectedSeats, setSelectedSeats] = useState<string[]>([]);
  const [isSelectionOpen, setIsSelectionOpen] = useState(false);
  const [lastCartEventType, setLastCartEventType] = useState<string | null>(null);
  const [editorMode, setEditorMode] = useState<EditorMode>("template");

  const [templateDraft, setTemplateDraft] = useState<Venue>(() => {
    const stored = readTemplatesFromStorage();
    const seed = stored[0] ?? createDefaultTemplateRecord();
    const next = cloneVenue(seed.layout);
    next.id = seed.id;
    next.name = seed.name;
    return next;
  });
  const [templates, setTemplates] = useState<TemplateRecord[]>(() => {
    const stored = readTemplatesFromStorage();
    return stored.length > 0 ? stored : [createDefaultTemplateRecord()];
  });
  const [templateQuery, setTemplateQuery] = useState("");
  const [eventTemplateId, setEventTemplateId] = useState<string>(() => {
    const stored = readTemplatesFromStorage();
    return stored[0]?.id ?? "template-sample-hall";
  });
  const [eventDraft, setEventDraft] = useState<Venue>(() => {
    const seeded = cloneVenue(sampleVenue);
    seeded.id = "event-sample-night";
    seeded.name = "Sample Hall - Friday Night";
    return seeded;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(templates));
  }, [templates]);

  useEffect(() => {
    if (templates.some((template) => template.id === eventTemplateId)) return;
    if (templates.length > 0) {
      setEventTemplateId(templates[0].id);
    }
  }, [eventTemplateId, templates]);

  const viewerVenue = useMemo(() => {
    if (venueSize.startsWith("template:")) {
      const templateId = venueSize.slice("template:".length);
      const template = templates.find((record) => record.id === templateId);
      return template?.layout ?? sampleVenue;
    }

    switch (venueSize) {
      case "sample": return sampleVenue;
      case "5k": return generateLargeVenue(5000);
      case "25k": return generateLargeVenue(25000);
      case "50k": return generateLargeVenue(50000);
      default: return sampleVenue;
    }
  }, [templates, venueSize]);

  const filteredTemplates = useMemo(() => {
    const query = templateQuery.trim().toLowerCase();
    if (!query) return templates;
    return templates.filter((template) => template.name.toLowerCase().includes(query));
  }, [templateQuery, templates]);

  const handleLoadSchema = useCallback(() => {
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
          const importedId = (loaded.id?.trim() || `template-${generateId()}`).replace(/\s+/g, "-");
          const importedName = loaded.name?.trim() || "Imported Venue";
          const importedVenue = cloneVenue({ ...loaded, id: importedId, name: importedName });
          const importedTemplate: TemplateRecord = {
            id: importedId,
            name: importedName,
            layout: importedVenue,
          };

          setTemplates((prev) => {
            const existingIndex = prev.findIndex((template) => template.id === importedTemplate.id);
            if (existingIndex >= 0) {
              const next = [...prev];
              next[existingIndex] = importedTemplate;
              return next;
            }
            return [importedTemplate, ...prev];
          });
          setTemplateDraft(importedVenue);
          setEventTemplateId(importedId);
          setVenueSize(`template:${importedId}`);
          setSelectedSeats([]);
          setLastCartEventType(null);
        } catch {
          alert("Invalid venue JSON file");
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }, []);

  const fetchCategoryPrices = useCallback(async (categoryIds: string[]) => {
    // Keep demo behavior aligned with real state: backend is not implemented yet.
    await new Promise((resolve) => setTimeout(resolve, 300));
    void categoryIds;
    throw new Error("Backend returned error.");
  }, []);

  const handleCreateNewTemplate = useCallback(() => {
    const next = createEmptyVenue("New Template");
    next.id = `template-${generateId()}`;
    setTemplateDraft(next);
  }, []);

  const persistTemplate = useCallback((venue: Venue) => {
    const trimmedId = venue.id.trim() || `template-${generateId()}`;
    const trimmedName = venue.name.trim() || "Untitled Template";
    const savedLayout = cloneVenue({ ...venue, id: trimmedId, name: trimmedName });

    setTemplateDraft(savedLayout);
    setTemplates((prev) => {
      const nextTemplate: TemplateRecord = {
        id: trimmedId,
        name: trimmedName,
        layout: savedLayout,
      };
      const existingIndex = prev.findIndex((template) => template.id === trimmedId);
      if (existingIndex >= 0) {
        const next = [...prev];
        next[existingIndex] = nextTemplate;
        return next;
      }
      return [nextTemplate, ...prev];
    });
    setEventTemplateId(trimmedId);
  }, []);

  const handleCreateNewEvent = useCallback(() => {
    setEventDraft({
      ...createEmptyVenue("New Event"),
      id: `event-${generateId()}`,
      name: "New Event",
    });
  }, []);

  const applyTemplateToEvent = useCallback((templateId: string) => {
    const template = templates.find((record) => record.id === templateId);
    if (!template) return;

    setEventTemplateId(templateId);
    setEventDraft((prev) => {
      const seeded = cloneVenue(template.layout);
      seeded.id = prev.id.trim() || `event-${generateId()}`;
      seeded.name = prev.name.trim() || `${template.name} Event`;
      return seeded;
    });
  }, [templates]);

  const applyTemplateToEditorDraft = useCallback((templateId: string) => {
    const template = templates.find((record) => record.id === templateId);
    if (!template) return;
    setTemplateDraft(cloneVenue(template.layout));
  }, [templates]);

  const tabBtnBase: React.CSSProperties = {
    padding: "10px 20px",
    border: "1px solid var(--ds-border-subtle)",
    borderRadius: "999px",
    background: "transparent",
    color: "var(--ds-on-surface-variant)",
    cursor: "pointer",
    fontSize: 14,
    fontFamily: "var(--font-body-family), system-ui, sans-serif",
    transition: "all 0.15s",
  };

  const activeTabBtn: React.CSSProperties = {
    ...tabBtnBase,
    color: "var(--ds-on-primary)",
    border: "1px solid var(--ds-primary-border-strong)",
    background: "var(--ds-primary)",
  };

  const selectStyle: React.CSSProperties = {
    padding: "7px 10px",
    background: "var(--ds-surface-container-low)",
    border: "1px solid var(--ds-input-border)",
    borderRadius: "8px",
    color: "var(--ds-on-surface)",
    fontSize: 13,
    fontFamily: "var(--font-body-family), system-ui, sans-serif",
    cursor: "pointer",
  };

  const panelStyle: React.CSSProperties = {
    margin: 0,
    padding: 12,
    borderRadius: 12,
    border: "1px solid var(--ds-border-subtle)",
    background: "var(--ds-surface-container-low)",
    boxShadow: "var(--ds-shadow-ambient-sm)",
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  };

  const editorHostStyle: React.CSSProperties = {
    "--seatmap-editor-surface-page": "var(--ds-surface)",
    "--seatmap-editor-surface": "var(--ds-surface-container-low)",
    "--seatmap-editor-surface-elevated": "var(--ds-surface-container)",
    "--seatmap-editor-surface-muted": "color-mix(in srgb, var(--ds-surface-container-high) 72%, transparent)",
    "--seatmap-editor-control-surface": "var(--ds-surface-container-high)",
    "--seatmap-editor-border": "var(--ds-input-border)",
    "--seatmap-editor-border-subtle": "var(--ds-border-subtle)",
    "--seatmap-editor-text": "var(--ds-on-surface)",
    "--seatmap-editor-text-muted": "var(--ds-on-surface-variant)",
    "--seatmap-editor-accent": "var(--ds-primary)",
    "--seatmap-editor-accent-text": "var(--ds-on-primary)",
    "--seatmap-editor-radius-sm": "8px",
    "--seatmap-editor-radius-md": "12px",
    "--seatmap-editor-radius-pill": "999px",
    "--seatmap-editor-shadow-overlay": "var(--ds-shadow-ambient-sm)",
    flex: 1,
    position: "relative",
    overflow: "hidden",
    borderRadius: 14,
    border: "1px solid var(--ds-border-subtle)",
  } as React.CSSProperties;

  return (
    <div
      style={{
        "--font-display-family": "Manrope",
        "--font-body-family": "Inter",
        "--ds-surface": "#131313",
        "--ds-surface-container-low": "#181818",
        "--ds-surface-container": "#1e1e1e",
        "--ds-surface-container-high": "#242424",
        "--ds-surface-container-highest": "#2e2e2e",
        "--ds-surface-container-lowest": "#0f0f0f",
        "--ds-surface-variant": "#2a2826",
        "--ds-on-surface": "#e5e2e1",
        "--ds-on-surface-variant": "#9a9694",
        "--ds-outline-variant": "#5c5957",
        "--ds-primary": "#dfcd72",
        "--ds-on-primary": "#1a1816",
        "--ds-primary-gradient-end": "#8a7f46",
        "--ds-secondary": "#9064f6",
        "--ds-tertiary": "#1f6fe0",
        "--ds-border-subtle": "color-mix(in srgb, var(--ds-outline-variant) 12%, transparent)",
        "--ds-input-border": "color-mix(in srgb, var(--ds-outline-variant) 22%, transparent)",
        "--ds-primary-border-strong": "color-mix(in srgb, var(--ds-primary) 25%, transparent)",
        "--ds-shadow-ambient-sm": "0 24px 48px -14px rgb(229 226 225 / 0.06)",
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        background:
          "radial-gradient(1200px circle at 10% -10%, var(--ds-surface-variant) 0%, var(--ds-surface-container-low) 35%, var(--ds-surface) 100%)",
        color: "var(--ds-on-surface)",
        overflow: "hidden",
      } as React.CSSProperties}
    >
      <header
        style={{
          padding: "0 24px",
          background: "color-mix(in srgb, var(--ds-surface-container) 92%, transparent)",
          borderBottom: "1px solid var(--ds-border-subtle)",
          display: "flex",
          alignItems: "center",
          gap: 24,
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: 16,
            color: "var(--ds-on-surface)",
            fontFamily: "var(--font-display-family), system-ui, sans-serif",
            padding: "12px 0",
          }}
        >
          Seatmap Demo
        </h1>

        <div style={{ display: "flex", gap: 0 }}>
          <button onClick={() => setTab("viewer")} style={tab === "viewer" ? activeTabBtn : tabBtnBase}>
            Viewer
          </button>
          <button onClick={() => setTab("editor")} style={tab === "editor" ? activeTabBtn : tabBtnBase}>
            Template + Event Editor
          </button>
        </div>

        {tab === "viewer" && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <label style={{ color: "var(--ds-on-surface-variant)", fontSize: 13, fontFamily: "var(--font-body-family), system-ui, sans-serif" }}>Venue:</label>
            <select value={venueSize} onChange={(e) => setVenueSize(e.target.value as VenueSize)} style={selectStyle}>
              <option value="sample">Small Hall (stage + dancefloor)</option>
              <option value="5k">Large (5,000 seats)</option>
              <option value="25k">Arena (25,000 seats)</option>
              <option value="50k">Stadium (50,000 seats)</option>
              {templates.map((template) => (
                <option key={`viewer-template-${template.id}`} value={`template:${template.id}`}>
                  Template: {template.name}
                </option>
              ))}
            </select>
            <button
              onClick={handleLoadSchema}
              style={{
                padding: "4px 12px",
                background: "var(--ds-surface-container-low)",
                border: "1px solid var(--ds-input-border)",
                borderRadius: 8,
                color: "var(--ds-on-surface)",
                fontSize: 13,
                fontFamily: "var(--font-body-family), system-ui, sans-serif",
                cursor: "pointer",
              }}
              title="Load a venue JSON exported from the editor"
            >
              Load Schema
            </button>
          </div>
        )}

        <div style={{ marginLeft: "auto", color: "var(--ds-on-surface-variant)", fontSize: 13, fontFamily: "var(--font-body-family), system-ui, sans-serif" }}>
          {tab === "viewer"
            ? "Includes preview (hover-only) and separate seat selection (with cart)."
            : editorMode === "template"
              ? "Template Editor: create reusable base layouts."
              : "Venue Event Editor: choose a template then customize event layout."}
        </div>
      </header>

      <div style={{ flex: 1, position: "relative", overflow: "hidden", minHeight: 0, padding: 12 }}>
        {tab === "viewer" ? (
          <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, gap: 12 }}>
            <div style={panelStyle}>
              <strong style={{ color: "var(--ds-on-surface)", fontFamily: "var(--font-body-family), system-ui, sans-serif", fontSize: 13 }}>
                Event-style flow
              </strong>
              <span style={{ color: "var(--ds-on-surface-variant)", fontFamily: "var(--font-body-family), system-ui, sans-serif", fontSize: 13 }}>
                Preview is hover-only; seat selection and cart are in a separate viewer.
              </span>
              <button
                onClick={() => setIsSelectionOpen((prev) => !prev)}
                style={selectStyle}
              >
                {isSelectionOpen ? "Hide Seat Selection" : "Open Seat Selection"}
              </button>
            </div>

            <div style={panelStyle}>
              <span style={{ color: "var(--ds-on-surface)", fontFamily: "var(--font-body-family), system-ui, sans-serif", fontSize: 13 }}>
                Preview map
              </span>
              <span style={{ color: "var(--ds-on-surface-variant)", fontFamily: "var(--font-body-family), system-ui, sans-serif", fontSize: 13 }}>
                Cart hidden, click disabled, hover enabled.
              </span>
            </div>

            <div style={{ flex: isSelectionOpen ? "0 0 45%" : 1, minHeight: 280, position: "relative", overflow: "hidden" }}>
              <SeatmapProvider venue={viewerVenue} key={`preview-${venueSize}-${viewerVenue.id}`}>
                <div style={{ width: "100%", height: "100%", position: "relative" }}>
                  <PreviewSeatmapCanvas />
                  <aside
                    aria-label="Seatmap legend"
                    style={{
                      position: "absolute",
                      top: 12,
                      left: 12,
                      borderRadius: 12,
                      border: "1px solid var(--ds-input-border)",
                      background: "color-mix(in srgb, var(--ds-surface-container) 92%, transparent)",
                      color: "var(--ds-on-surface)",
                      fontFamily: "var(--font-body-family), system-ui, sans-serif",
                      fontSize: 12,
                      padding: 10,
                      minWidth: 170,
                      maxWidth: 220,
                      zIndex: 5,
                    }}
                  >
                    <div style={{ fontWeight: 600, marginBottom: 6 }}>Legend</div>
                    {viewerVenue.seatStatuses.length > 0 && (
                      <div style={{ marginBottom: viewerVenue.categories.length > 0 ? 8 : 0 }}>
                        <div style={{ opacity: 0.8, marginBottom: 4 }}>Statuses</div>
                        {viewerVenue.seatStatuses.map((status) => (
                          <div key={status.id} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                            <span style={{ width: 10, height: 10, borderRadius: 2, background: status.color, display: "inline-block" }} />
                            <span>{status.name}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {viewerVenue.categories.length > 0 && (
                      <div>
                        <div style={{ opacity: 0.8, marginBottom: 4 }}>Categories</div>
                        {viewerVenue.categories.map((category) => (
                          <div key={category.id} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                            <span style={{ width: 10, height: 10, borderRadius: 2, background: category.color, display: "inline-block" }} />
                            <span>{category.name}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </aside>
                </div>
              </SeatmapProvider>
            </div>

            {isSelectionOpen && (
              <>
                <div style={panelStyle}>
                  <span style={{ color: "var(--ds-on-surface)", fontFamily: "var(--font-body-family), system-ui, sans-serif", fontSize: 13 }}>
                    Seat selection map
                  </span>
                  <span style={{ color: "var(--ds-on-surface-variant)", fontFamily: "var(--font-body-family), system-ui, sans-serif", fontSize: 13 }}>
                    Full viewer with clickable seats and built-in cart.
                  </span>
                </div>
                <div style={{ flex: 1, minHeight: 300, position: "relative", overflow: "hidden" }}>
                  <SeatmapViewer
                    key={`selection-${venueSize}-${viewerVenue.id}`}
                    venue={viewerVenue}
                    className={seatmapViewerSharedThemeRootClassName}
                    classNames={seatmapViewerSharedThemeClassNames}
                    styles={{ root: getSeatmapViewerSharedThemeRootStyle() }}
                    onSelectionChange={setSelectedSeats}
                    onCartEvent={(event) => {
                      setLastCartEventType(event.type);
                      console.log("Cart event:", event.type, event.payload);
                    }}
                  />
                </div>
              </>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, gap: 12 }}>
            <div style={panelStyle}>
              <button
                onClick={() => setEditorMode("template")}
                style={editorMode === "template" ? activeTabBtn : tabBtnBase}
              >
                Template Editor
              </button>
              <button
                onClick={() => setEditorMode("event")}
                style={editorMode === "event" ? activeTabBtn : tabBtnBase}
              >
                Venue Event Editor
              </button>
            </div>

            {editorMode === "template" ? (
              <>
                <div style={panelStyle}>
                  <span style={{ color: "var(--ds-on-surface)", fontSize: 13, fontFamily: "var(--font-body-family), system-ui, sans-serif" }}>
                    Check the section tool in the editor toolbar. It now has separate shape and type controls.
                  </span>
                  <label style={{ color: "var(--ds-on-surface-variant)", fontSize: 13, fontFamily: "var(--font-body-family), system-ui, sans-serif" }}>
                    Load Template:
                    <select
                      value={templateDraft.id}
                      onChange={(e) => applyTemplateToEditorDraft(e.target.value)}
                      style={{ ...selectStyle, marginLeft: 8, minWidth: 260 }}
                    >
                      {templates.map((template) => (
                        <option key={`editor-template-${template.id}`} value={template.id}>
                          {template.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label style={{ color: "var(--ds-on-surface-variant)", fontSize: 13, fontFamily: "var(--font-body-family), system-ui, sans-serif" }}>
                    Template ID:
                    <input
                      value={templateDraft.id}
                      onChange={(e) => setTemplateDraft((prev) => ({ ...prev, id: e.target.value }))}
                      style={{ ...selectStyle, marginLeft: 8, minWidth: 200 }}
                    />
                  </label>
                  <label style={{ color: "var(--ds-on-surface-variant)", fontSize: 13, fontFamily: "var(--font-body-family), system-ui, sans-serif" }}>
                    Template Name:
                    <input
                      value={templateDraft.name}
                      onChange={(e) => setTemplateDraft((prev) => ({ ...prev, name: e.target.value }))}
                      style={{ ...selectStyle, marginLeft: 8, minWidth: 240 }}
                    />
                  </label>
                  <button onClick={handleCreateNewTemplate} style={selectStyle}>
                    Create New Template
                  </button>
                </div>

                <div style={editorHostStyle}>
                  <SeatmapEditor
                    venue={templateDraft}
                    fetchCategoryPrices={fetchCategoryPrices}
                    onChange={setTemplateDraft}
                    onSave={(venue) => persistTemplate(venue)}
                  />
                </div>
              </>
            ) : templates.length === 0 ? (
              <div
                style={{
                  ...panelStyle,
                  marginTop: 24,
                  justifyContent: "center",
                  flexDirection: "column",
                  textAlign: "center",
                  color: "var(--ds-on-surface-variant)",
                }}
              >
                <strong style={{ color: "var(--ds-on-surface)" }}>No templates available</strong>
                <span>Create a template first, then return to Venue Event Editor.</span>
              </div>
            ) : (
              <>
                <div style={panelStyle}>
                  <label style={{ color: "var(--ds-on-surface-variant)", fontSize: 13, fontFamily: "var(--font-body-family), system-ui, sans-serif" }}>
                    Event ID:
                    <input
                      value={eventDraft.id}
                      onChange={(e) => setEventDraft((prev) => ({ ...prev, id: e.target.value }))}
                      style={{ ...selectStyle, marginLeft: 8, minWidth: 200 }}
                    />
                  </label>
                  <label style={{ color: "var(--ds-on-surface-variant)", fontSize: 13, fontFamily: "var(--font-body-family), system-ui, sans-serif" }}>
                    Event Name:
                    <input
                      value={eventDraft.name}
                      onChange={(e) => setEventDraft((prev) => ({ ...prev, name: e.target.value }))}
                      style={{ ...selectStyle, marginLeft: 8, minWidth: 240 }}
                    />
                  </label>
                  <button onClick={handleCreateNewEvent} style={selectStyle}>
                    Create New Event
                  </button>
                </div>

                <div style={panelStyle}>
                  <label style={{ color: "var(--ds-on-surface-variant)", fontSize: 13, fontFamily: "var(--font-body-family), system-ui, sans-serif" }}>
                    Search Templates:
                    <input
                      value={templateQuery}
                      onChange={(e) => setTemplateQuery(e.target.value)}
                      placeholder="Search by template name"
                      style={{ ...selectStyle, marginLeft: 8, minWidth: 240 }}
                    />
                  </label>

                  <label style={{ color: "var(--ds-on-surface-variant)", fontSize: 13, fontFamily: "var(--font-body-family), system-ui, sans-serif" }}>
                    Template:
                    <select
                      value={eventTemplateId}
                      onChange={(e) => applyTemplateToEvent(e.target.value)}
                      style={{ ...selectStyle, marginLeft: 8, minWidth: 280 }}
                    >
                      {filteredTemplates.length === 0 ? (
                        <option value="">No matching templates</option>
                      ) : (
                        filteredTemplates.map((template) => (
                          <option key={template.id} value={template.id}>
                            {template.name}
                          </option>
                        ))
                      )}
                    </select>
                  </label>
                </div>

                <div style={editorHostStyle}>
                  <SeatmapEditor
                    venue={eventDraft}
                    fetchCategoryPrices={fetchCategoryPrices}
                    onChange={setEventDraft}
                  />
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {tab === "viewer" && isSelectionOpen && (
        <footer
          style={{
            padding: "12px 24px",
            background: "color-mix(in srgb, var(--ds-surface-container) 92%, transparent)",
            borderTop: "1px solid var(--ds-border-subtle)",
            color: "var(--ds-on-surface)",
            fontSize: 13,
            fontFamily: "var(--font-body-family), system-ui, sans-serif",
            display: "flex",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <span>Selected seats: {selectedSeats.length}</span>
          <span>Last cart event: {lastCartEventType ?? "none"}</span>
        </footer>
      )}
    </div>
  );
}

export default App;
