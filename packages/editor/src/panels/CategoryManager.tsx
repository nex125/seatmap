import { useState, type CSSProperties } from "react";
import type { Venue, PricingCategory, CommandHistory } from "@nex22/seatmap-core";
import { generateId } from "@nex22/seatmap-core";
import type { SeatmapStore } from "@nex22/seatmap-react";

export interface CategoryManagerProps {
  venue: Venue | null;
  history: CommandHistory;
  store: SeatmapStore;
  style?: CSSProperties;
}

const btnSmall: CSSProperties = {
  padding: "3px 8px",
  border: "1px solid #3a3a5a",
  borderRadius: 4,
  background: "#2a2a4a",
  color: "#e0e0e0",
  cursor: "pointer",
  fontSize: 12,
  fontFamily: "system-ui",
};

export function CategoryManager({
  venue,
  history,
  store,
  style,
}: CategoryManagerProps) {
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#4caf50");

  if (!venue) return null;

  const addCategory = () => {
    if (!newName.trim()) return;
    const cat: PricingCategory = {
      id: generateId("cat"),
      name: newName.trim(),
      color: newColor,
    };

    history.execute({
      description: `Add category "${cat.name}"`,
      execute: () => {
        const cur = store.getState().venue;
        if (!cur) return;
        store.getState().setVenue({ ...cur, categories: [...cur.categories, cat] });
      },
      undo: () => {
        const cur = store.getState().venue;
        if (!cur) return;
        store.getState().setVenue({ ...cur, categories: cur.categories.filter((c) => c.id !== cat.id) });
      },
    });

    setNewName("");
  };

  const removeCategory = (catId: string) => {
    const cat = venue.categories.find((c) => c.id === catId);
    if (!cat) return;

    history.execute({
      description: `Remove category "${cat.name}"`,
      execute: () => {
        const cur = store.getState().venue;
        if (!cur) return;
        store.getState().setVenue({ ...cur, categories: cur.categories.filter((c) => c.id !== catId) });
      },
      undo: () => {
        const cur = store.getState().venue;
        if (!cur) return;
        store.getState().setVenue({ ...cur, categories: [...cur.categories, cat] });
      },
    });
  };

  return (
    <div style={{ padding: 16, ...style }}>
      <div style={{ fontWeight: 600, color: "#e0e0e0", fontSize: 14, fontFamily: "system-ui", marginBottom: 12 }}>
        Pricing Categories
      </div>

      {venue.categories.map((cat: PricingCategory) => (
        <div
          key={cat.id}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 6,
            padding: "4px 8px",
            borderRadius: 4,
            background: "#2a2a4a",
          }}
        >
          <div style={{ width: 14, height: 14, borderRadius: 3, background: cat.color, flexShrink: 0 }} />
          <div style={{ flex: 1, color: "#e0e0e0", fontSize: 13, fontFamily: "system-ui" }}>{cat.name}</div>
          <button
            onClick={() => removeCategory(cat.id)}
            style={{ ...btnSmall, padding: "1px 6px", fontSize: 11 }}
          >
            ✕
          </button>
        </div>
      ))}

      <div style={{ display: "flex", gap: 6, marginTop: 10, alignItems: "center" }}>
        <input
          type="color"
          value={newColor}
          onChange={(e) => setNewColor(e.target.value)}
          style={{ width: 28, height: 28, border: "none", padding: 0, cursor: "pointer" }}
        />
        <input
          placeholder="Category name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addCategory()}
          style={{
            flex: 1,
            padding: "4px 8px",
            background: "#2a2a4a",
            border: "1px solid #3a3a5a",
            borderRadius: 4,
            color: "#e0e0e0",
            fontSize: 13,
            fontFamily: "system-ui",
          }}
        />
        <button onClick={addCategory} style={btnSmall}>
          Add
        </button>
      </div>
    </div>
  );
}
