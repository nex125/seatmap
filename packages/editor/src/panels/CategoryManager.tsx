import { useState, type CSSProperties } from "react";
import type { Venue, PricingCategory, CommandHistory } from "@nex125/seatmap-core";
import { generateId } from "@nex125/seatmap-core";
import type { SeatmapStore } from "@nex125/seatmap-react";

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

function replaceCategoryInVenue(venue: Venue, categoryId: string, replacementCategoryId: string): Venue {
  return {
    ...venue,
    sections: venue.sections.map((section) => ({
      ...section,
      categoryId: section.categoryId === categoryId ? replacementCategoryId : section.categoryId,
      rows: section.rows.map((row) => ({
        ...row,
        seats: row.seats.map((seat) =>
          seat.categoryId === categoryId ? { ...seat, categoryId: replacementCategoryId } : seat,
        ),
      })),
    })),
    gaAreas: venue.gaAreas.map((gaArea) =>
      gaArea.categoryId === categoryId ? { ...gaArea, categoryId: replacementCategoryId } : gaArea,
    ),
    tables: venue.tables.map((table) => ({
      ...table,
      categoryId: table.categoryId === categoryId ? replacementCategoryId : table.categoryId,
      seats: table.seats.map((seat) =>
        seat.categoryId === categoryId ? { ...seat, categoryId: replacementCategoryId } : seat,
      ),
    })),
  };
}

export function CategoryManager({
  venue,
  history,
  store,
  style,
}: CategoryManagerProps) {
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#4caf50");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingColor, setEditingColor] = useState("#4caf50");

  if (!venue) return null;

  const addCategory = () => {
    if (!newName.trim()) return;
    const cat: PricingCategory = {
      id: generateId(),
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

  const startEdit = (category: PricingCategory) => {
    setEditingId(category.id);
    setEditingName(category.name);
    setEditingColor(category.color);
  };

  const saveEdit = () => {
    if (!editingId) return;
    const trimmedName = editingName.trim();
    if (!trimmedName) return;

    history.execute({
      description: `Update category "${trimmedName}"`,
      execute: () => {
        const cur = store.getState().venue;
        if (!cur) return;
        store.getState().setVenue({
          ...cur,
          categories: cur.categories.map((category) =>
            category.id === editingId
              ? { ...category, name: trimmedName, color: editingColor }
              : category,
          ),
        });
      },
      undo: () => {
        const original = venue.categories.find((category) => category.id === editingId);
        const cur = store.getState().venue;
        if (!cur || !original) return;
        store.getState().setVenue({
          ...cur,
          categories: cur.categories.map((category) =>
            category.id === editingId ? original : category,
          ),
        });
      },
    });

    setEditingId(null);
  };

  const removeCategory = (catId: string) => {
    const current = store.getState().venue;
    if (!current || current.categories.length <= 1) return;
    const cat = current.categories.find((c) => c.id === catId);
    if (!cat) return;
    const replacementCategory = current.categories.find((c) => c.id !== catId);
    if (!replacementCategory) return;

    const previousVenue = current;
    const nextVenue = replaceCategoryInVenue(
      {
        ...previousVenue,
        categories: previousVenue.categories.filter((c) => c.id !== catId),
      },
      catId,
      replacementCategory.id,
    );

    history.execute({
      description: `Remove category "${cat.name}"`,
      execute: () => {
        store.getState().setVenue(nextVenue);
      },
      undo: () => {
        store.getState().setVenue(previousVenue);
      },
    });
  };

  return (
    <div style={{ padding: 16, ...style }}>
      <div style={{ fontWeight: 600, color: "#e0e0e0", fontSize: 14, fontFamily: "system-ui", marginBottom: 12 }}>
        Pricing Categories
      </div>

      {venue.categories.map((cat: PricingCategory) => {
        const isEditing = editingId === cat.id;
        return (
          <div
            key={cat.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
              marginBottom: 6,
              padding: "4px 8px",
              borderRadius: 4,
              background: "#2a2a4a",
            }}
          >
            <input
              type="color"
              value={isEditing ? editingColor : cat.color}
              onChange={(e) => isEditing && setEditingColor(e.target.value)}
              disabled={!isEditing}
              style={{ width: 18, height: 18, border: "none", padding: 0, cursor: isEditing ? "pointer" : "default" }}
            />
            {isEditing ? (
              <input
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                style={{
                  flex: 1,
                  minWidth: 0,
                  padding: "2px 6px",
                  background: "#1f1f38",
                  border: "1px solid #3a3a5a",
                  borderRadius: 4,
                  color: "#e0e0e0",
                  fontSize: 12,
                  fontFamily: "system-ui",
                }}
              />
            ) : (
              <div style={{ flex: 1, color: "#e0e0e0", fontSize: 13, fontFamily: "system-ui" }}>
                {cat.name}
              </div>
            )}
            {isEditing ? (
              <>
                <button onClick={saveEdit} style={{ ...btnSmall, padding: "1px 6px", fontSize: 11 }}>
                  Save
                </button>
                <button onClick={() => setEditingId(null)} style={{ ...btnSmall, padding: "1px 6px", fontSize: 11 }}>
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button onClick={() => startEdit(cat)} style={{ ...btnSmall, padding: "1px 6px", fontSize: 11 }}>
                  Edit
                </button>
                <button
                  onClick={() => removeCategory(cat.id)}
                  style={{ ...btnSmall, padding: "1px 6px", fontSize: 11 }}
                  disabled={venue.categories.length <= 1}
                  title={venue.categories.length <= 1 ? "At least one category is required" : "Delete category"}
                >
                  ✕
                </button>
              </>
            )}
          </div>
        );
      })}

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
