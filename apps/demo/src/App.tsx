import { useCallback, useMemo, useState } from "react";
import type { Venue } from "@ticketok/seatmap-core";
import { deserializeVenue } from "@ticketok/seatmap-core";
import { SeatmapViewer } from "@ticketok/seatmap-viewer";
import { SeatmapEditor } from "@ticketok/seatmap-editor";
import { sampleVenue } from "./sampleVenue";
import { generateLargeVenue } from "./generateLargeVenue";

type Tab = "viewer" | "editor";
type VenueSize = "sample" | "5k" | "25k" | "50k" | "custom";

const emptyVenue: Venue = {
  id: "new-venue",
  name: "New Venue",
  bounds: { width: 1200, height: 900 },
  categories: [
    { id: "cat-default", name: "Standard", color: "#4caf50" },
    { id: "cat-vip", name: "VIP", color: "#e91e63" },
  ],
  sections: [],
  gaAreas: [],
  tables: [],
};

function App() {
  const [tab, setTab] = useState<Tab>("viewer");
  const [venueSize, setVenueSize] = useState<VenueSize>("sample");
  const [selectedSeats, setSelectedSeats] = useState<string[]>([]);
  const [customVenue, setCustomVenue] = useState<Venue | null>(null);

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

  const tabBtnBase: React.CSSProperties = {
    padding: "8px 20px",
    border: "none",
    background: "transparent",
    color: "#9e9e9e",
    cursor: "pointer",
    fontSize: 14,
    fontFamily: "system-ui",
    borderBottom: "2px solid transparent",
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
            Editor
          </button>
        </div>

        {tab === "viewer" && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <label style={{ color: "#9e9e9e", fontSize: 13, fontFamily: "system-ui" }}>Venue:</label>
            <select value={venueSize} onChange={(e) => setVenueSize(e.target.value as VenueSize)} style={selectStyle}>
              <option value="sample">Demo Arena (~700 seats)</option>
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
            : "Space: pan, V: select, S: add section, R: add row"}
        </div>
      </header>

      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        {tab === "viewer" ? (
          <SeatmapViewer
            key={venueSize === "custom" ? `custom-${customVenue?.id}` : venueSize}
            venue={viewerVenue}
            onSeatClick={(seatId) => {
              setSelectedSeats((prev) =>
                prev.includes(seatId)
                  ? prev.filter((id) => id !== seatId)
                  : [...prev, seatId],
              );
            }}
          />
        ) : (
          <SeatmapEditor
            venue={emptyVenue}
            onChange={(v) => {
              console.log("Venue:", v.sections.length, "sections");
            }}
          />
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
