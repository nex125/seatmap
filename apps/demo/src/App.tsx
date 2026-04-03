import { useCallback, useMemo, useState } from "react";
import type { Venue } from "@nex125/seatmap-core";
import { deserializeVenue, generateId } from "@nex125/seatmap-core";
import { SeatmapViewer } from "@nex125/seatmap-viewer";
import { SeatmapEditor } from "@nex125/seatmap-editor";
import { sampleVenue } from "./sampleVenue";
import { generateLargeVenue } from "./generateLargeVenue";

type Tab = "viewer" | "editor";
type VenueSize = "sample" | "5k" | "25k" | "50k" | "custom";
type EditorMode = "template" | "event";

interface TemplateRecord {
  id: string;
  name: string;
  layout: Venue;
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

function App() {
  const [tab, setTab] = useState<Tab>("viewer");
  const [venueSize, setVenueSize] = useState<VenueSize>("sample");
  const [selectedSeats, setSelectedSeats] = useState<string[]>([]);
  const [customVenue, setCustomVenue] = useState<Venue | null>(null);
  const [editorMode, setEditorMode] = useState<EditorMode>("template");

  const [templateDraft, setTemplateDraft] = useState<Venue>(() => {
    const next = cloneVenue(sampleVenue);
    next.id = `template-${generateId()}`;
    next.name = "Sample Hall Template";
    return next;
  });
  const [templates, setTemplates] = useState<TemplateRecord[]>([
    {
      id: "template-sample-hall",
      name: "Sample Hall Template",
      layout: cloneVenue(sampleVenue),
    },
  ]);
  const [templateQuery, setTemplateQuery] = useState("");
  const [eventTemplateId, setEventTemplateId] = useState<string>("template-sample-hall");
  const [eventDraft, setEventDraft] = useState<Venue>(() => {
    const seeded = cloneVenue(sampleVenue);
    seeded.id = "event-sample-night";
    seeded.name = "Sample Hall - Friday Night";
    return seeded;
  });

  const viewerVenue = useMemo(() => {
    if (venueSize === "custom" && customVenue) return customVenue;
    switch (venueSize) {
      case "sample": return sampleVenue;
      case "5k": return generateLargeVenue(5000);
      case "25k": return generateLargeVenue(25000);
      case "50k": return generateLargeVenue(50000);
      default: return sampleVenue;
    }
  }, [venueSize, customVenue]);

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
          setCustomVenue(loaded);
          setVenueSize("custom");
          setSelectedSeats([]);
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

  const handleSaveTemplate = useCallback(() => {
    const trimmedId = templateDraft.id.trim() || `template-${generateId()}`;
    const trimmedName = templateDraft.name.trim() || "Untitled Template";
    const savedLayout = cloneVenue({ ...templateDraft, id: trimmedId, name: trimmedName });

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
  }, [templateDraft]);

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

  const tabBtnBase: React.CSSProperties = {
    padding: "8px 20px",
    border: "none",
    background: "transparent",
    color: "#9e9e9e",
    cursor: "pointer",
    fontSize: 14,
    fontFamily: "system-ui",
    borderBottomWidth: 2,
    borderBottomStyle: "solid",
    borderBottomColor: "transparent",
    transition: "all 0.15s",
  };

  const activeTabBtn: React.CSSProperties = {
    ...tabBtnBase,
    color: "#e0e0e0",
    borderBottomColor: "#4caf50",
  };

  const selectStyle: React.CSSProperties = {
    padding: "4px 8px",
    background: "#2a2a4a",
    border: "1px solid #3a3a5a",
    borderRadius: 4,
    color: "#e0e0e0",
    fontSize: 13,
    fontFamily: "system-ui",
    cursor: "pointer",
  };

  const panelStyle: React.CSSProperties = {
    margin: 16,
    padding: 12,
    borderRadius: 8,
    border: "1px solid #2a2a4a",
    background: "#14142a",
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#0f0f23" }}>
      <header
        style={{
          padding: "0 24px",
          background: "#1a1a2e",
          borderBottom: "1px solid #2a2a4a",
          display: "flex",
          alignItems: "center",
          gap: 24,
        }}
      >
        <h1 style={{ margin: 0, fontSize: 16, color: "#e0e0e0", fontFamily: "system-ui", padding: "12px 0" }}>
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
            <label style={{ color: "#9e9e9e", fontSize: 13, fontFamily: "system-ui" }}>Venue:</label>
            <select value={venueSize} onChange={(e) => setVenueSize(e.target.value as VenueSize)} style={selectStyle}>
              <option value="sample">Small Hall (stage + dancefloor)</option>
              <option value="5k">Large (5,000 seats)</option>
              <option value="25k">Arena (25,000 seats)</option>
              <option value="50k">Stadium (50,000 seats)</option>
              {customVenue && <option value="custom">{customVenue.name}</option>}
            </select>
            <button
              onClick={handleLoadSchema}
              style={{
                padding: "4px 12px",
                background: "#2a2a4a",
                border: "1px solid #3a3a5a",
                borderRadius: 4,
                color: "#e0e0e0",
                fontSize: 13,
                fontFamily: "system-ui",
                cursor: "pointer",
              }}
              title="Load a venue JSON exported from the editor"
            >
              Load Schema
            </button>
          </div>
        )}

        <div style={{ marginLeft: "auto", color: "#9e9e9e", fontSize: 13, fontFamily: "system-ui" }}>
          {tab === "viewer"
            ? selectedSeats.length > 0
              ? `${selectedSeats.length} seat${selectedSeats.length > 1 ? "s" : ""} selected`
              : "Click seats to select. Alt+drag to pan. Scroll to zoom."
            : editorMode === "template"
              ? "Template Editor: create reusable base layouts."
              : "Venue Event Editor: choose a template then customize event layout."}
        </div>
      </header>

      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        {tab === "viewer" ? (
          <SeatmapViewer
            key={venueSize === "custom" ? `custom-${customVenue?.id}` : venueSize}
            venue={viewerVenue}
            onSelectionChange={setSelectedSeats}
            onCartEvent={(event) => {
              console.log("Cart Proceed click event:", event.type, event.payload);
            }}
          />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
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
                  <label style={{ color: "#9e9e9e", fontSize: 13, fontFamily: "system-ui" }}>
                    Template ID:
                    <input
                      value={templateDraft.id}
                      onChange={(e) => setTemplateDraft((prev) => ({ ...prev, id: e.target.value }))}
                      style={{ ...selectStyle, marginLeft: 8, minWidth: 200 }}
                    />
                  </label>
                  <label style={{ color: "#9e9e9e", fontSize: 13, fontFamily: "system-ui" }}>
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
                  <button onClick={handleSaveTemplate} style={selectStyle}>
                    Save Template
                  </button>
                </div>

                <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
                  <SeatmapEditor
                    venue={templateDraft}
                    fetchCategoryPrices={fetchCategoryPrices}
                    onChange={setTemplateDraft}
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
                  color: "#9e9e9e",
                }}
              >
                <strong style={{ color: "#e0e0e0" }}>No templates available</strong>
                <span>Create a template first, then return to Venue Event Editor.</span>
              </div>
            ) : (
              <>
                <div style={panelStyle}>
                  <label style={{ color: "#9e9e9e", fontSize: 13, fontFamily: "system-ui" }}>
                    Event ID:
                    <input
                      value={eventDraft.id}
                      onChange={(e) => setEventDraft((prev) => ({ ...prev, id: e.target.value }))}
                      style={{ ...selectStyle, marginLeft: 8, minWidth: 200 }}
                    />
                  </label>
                  <label style={{ color: "#9e9e9e", fontSize: 13, fontFamily: "system-ui" }}>
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
                  <label style={{ color: "#9e9e9e", fontSize: 13, fontFamily: "system-ui" }}>
                    Search Templates:
                    <input
                      value={templateQuery}
                      onChange={(e) => setTemplateQuery(e.target.value)}
                      placeholder="Search by template name"
                      style={{ ...selectStyle, marginLeft: 8, minWidth: 240 }}
                    />
                  </label>

                  <label style={{ color: "#9e9e9e", fontSize: 13, fontFamily: "system-ui" }}>
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

                <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
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

      {tab === "viewer" && selectedSeats.length > 0 && (
        <footer
          style={{
            padding: "12px 24px",
            background: "#1a1a2e",
            borderTop: "1px solid #2a2a4a",
            color: "#e0e0e0",
            fontSize: 13,
            fontFamily: "system-ui",
            maxHeight: 80,
            overflow: "auto",
          }}
        >
          Selected: {selectedSeats.join(", ")}
        </footer>
      )}
    </div>
  );
}

export default App;
