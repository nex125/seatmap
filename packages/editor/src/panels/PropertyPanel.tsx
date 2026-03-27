import { useState, useEffect, type CSSProperties } from "react";
import type { Venue, Section, PricingCategory, CommandHistory, Row } from "@ticketok/seatmap-core";
import { generateId } from "@ticketok/seatmap-core";
import type { SeatmapStore } from "@ticketok/seatmap-react";

export interface PropertyPanelProps {
  venue: Venue | null;
  selectedSeatIds: Set<string>;
  history: CommandHistory;
  store: SeatmapStore;
  onUploadBackground?: () => void;
  onRemoveBackground?: () => void;
  onBackgroundOpacityChange?: (opacity: number) => void;
  style?: CSSProperties;
}

const labelStyle: CSSProperties = {
  fontSize: 11,
  color: "#9e9e9e",
  marginBottom: 2,
  fontFamily: "system-ui",
};

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "4px 8px",
  background: "#2a2a4a",
  border: "1px solid #3a3a5a",
  borderRadius: 4,
  color: "#e0e0e0",
  fontSize: 13,
  fontFamily: "system-ui",
  boxSizing: "border-box",
};

const selectStyle: CSSProperties = { ...inputStyle, cursor: "pointer" };

const btnDanger: CSSProperties = {
  padding: "3px 8px",
  border: "1px solid #5a2a2a",
  borderRadius: 4,
  background: "#3a1a1a",
  color: "#f48888",
  cursor: "pointer",
  fontSize: 12,
  fontFamily: "system-ui",
};

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

function freshVenue(store: SeatmapStore): Venue | null {
  return store.getState().venue;
}

function setVenue(store: SeatmapStore, venue: Venue) {
  store.getState().setVenue(venue);
}

export function PropertyPanel({
  venue,
  selectedSeatIds,
  history,
  store,
  onUploadBackground,
  onRemoveBackground,
  onBackgroundOpacityChange,
  style,
}: PropertyPanelProps) {
  const [selectedSection, setSelectedSection] = useState<Section | null>(null);

  useEffect(() => {
    if (!venue || selectedSeatIds.size === 0) {
      setSelectedSection(null);
      return;
    }

    const firstSeatId = [...selectedSeatIds][0];
    for (const section of venue.sections) {
      for (const row of section.rows) {
        if (row.seats.some((s) => s.id === firstSeatId)) {
          setSelectedSection(section);
          return;
        }
      }
    }
    setSelectedSection(null);
  }, [venue, selectedSeatIds]);

  const updateSectionLabel = (sectionId: string, newLabel: string) => {
    const v = freshVenue(store);
    if (!v) return;
    const oldLabel = v.sections.find((s) => s.id === sectionId)?.label ?? "";

    history.execute({
      description: `Rename section to "${newLabel}"`,
      execute: () => {
        const cur = freshVenue(store);
        if (!cur) return;
        setVenue(store, {
          ...cur,
          sections: cur.sections.map((s) =>
            s.id === sectionId ? { ...s, label: newLabel } : s,
          ),
        });
      },
      undo: () => {
        const cur = freshVenue(store);
        if (!cur) return;
        setVenue(store, {
          ...cur,
          sections: cur.sections.map((s) =>
            s.id === sectionId ? { ...s, label: oldLabel } : s,
          ),
        });
      },
    });
  };

  const updateSectionCategory = (sectionId: string, categoryId: string) => {
    const v = freshVenue(store);
    if (!v) return;
    const oldCatId = v.sections.find((s) => s.id === sectionId)?.categoryId ?? "";

    history.execute({
      description: `Change section category`,
      execute: () => {
        const cur = freshVenue(store);
        if (!cur) return;
        setVenue(store, {
          ...cur,
          sections: cur.sections.map((s) =>
            s.id === sectionId
              ? {
                  ...s,
                  categoryId,
                  rows: s.rows.map((r) => ({
                    ...r,
                    seats: r.seats.map((seat) => ({ ...seat, categoryId })),
                  })),
                }
              : s,
          ),
        });
      },
      undo: () => {
        const cur = freshVenue(store);
        if (!cur) return;
        setVenue(store, {
          ...cur,
          sections: cur.sections.map((s) =>
            s.id === sectionId
              ? {
                  ...s,
                  categoryId: oldCatId,
                  rows: s.rows.map((r) => ({
                    ...r,
                    seats: r.seats.map((seat) => ({ ...seat, categoryId: oldCatId })),
                  })),
                }
              : s,
          ),
        });
      },
    });
  };

  const deleteSection = (sectionId: string) => {
    const v = freshVenue(store);
    if (!v) return;
    const removed = v.sections.find((s) => s.id === sectionId);
    if (!removed) return;

    history.execute({
      description: `Delete section "${removed.label}"`,
      execute: () => {
        const cur = freshVenue(store);
        if (!cur) return;
        setVenue(store, { ...cur, sections: cur.sections.filter((s) => s.id !== sectionId) });
        store.getState().clearSelection();
      },
      undo: () => {
        const cur = freshVenue(store);
        if (!cur) return;
        setVenue(store, { ...cur, sections: [...cur.sections, removed] });
      },
    });
  };

  const deleteRow = (sectionId: string, rowId: string) => {
    const v = freshVenue(store);
    if (!v) return;
    const sec = v.sections.find((s) => s.id === sectionId);
    const removed = sec?.rows.find((r) => r.id === rowId);
    if (!removed) return;

    history.execute({
      description: `Delete row "${removed.label}"`,
      execute: () => {
        const cur = freshVenue(store);
        if (!cur) return;
        setVenue(store, {
          ...cur,
          sections: cur.sections.map((s) =>
            s.id === sectionId ? { ...s, rows: s.rows.filter((r) => r.id !== rowId) } : s,
          ),
        });
      },
      undo: () => {
        const cur = freshVenue(store);
        if (!cur) return;
        setVenue(store, {
          ...cur,
          sections: cur.sections.map((s) =>
            s.id === sectionId ? { ...s, rows: [...s.rows, removed] } : s,
          ),
        });
      },
    });
  };

  const deleteSeat = (sectionId: string, rowId: string, seatId: string) => {
    const v = freshVenue(store);
    if (!v) return;
    const sec = v.sections.find((s) => s.id === sectionId);
    const row = sec?.rows.find((r) => r.id === rowId);
    const removed = row?.seats.find((s) => s.id === seatId);
    if (!removed) return;

    history.execute({
      description: `Delete seat "${removed.label}"`,
      execute: () => {
        const cur = freshVenue(store);
        if (!cur) return;
        setVenue(store, {
          ...cur,
          sections: cur.sections.map((s) =>
            s.id === sectionId
              ? {
                  ...s,
                  rows: s.rows.map((r) =>
                    r.id === rowId ? { ...r, seats: r.seats.filter((st) => st.id !== seatId) } : r,
                  ),
                }
              : s,
          ),
        });
        const sel = store.getState().selectedSeatIds;
        if (sel.has(seatId)) store.getState().deselectSeat(seatId);
      },
      undo: () => {
        const cur = freshVenue(store);
        if (!cur) return;
        setVenue(store, {
          ...cur,
          sections: cur.sections.map((s) =>
            s.id === sectionId
              ? {
                  ...s,
                  rows: s.rows.map((r) =>
                    r.id === rowId ? { ...r, seats: [...r.seats, removed] } : r,
                  ),
                }
              : s,
          ),
        });
      },
    });
  };

  const addSingleSeat = (sectionId: string) => {
    const v = freshVenue(store);
    if (!v) return;
    const sec = v.sections.find((s) => s.id === sectionId);
    if (!sec) return;

    let targetRow: Row | undefined = sec.rows[sec.rows.length - 1];
    const newSeat = {
      id: generateId("seat"),
      label: targetRow ? `${targetRow.seats.length + 1}` : "1",
      position: {
        x: targetRow ? (targetRow.seats.length > 0 ? targetRow.seats[targetRow.seats.length - 1].position.x + 20 : 0) : 0,
        y: targetRow ? targetRow.seats[0]?.position.y ?? 0 : 0,
      },
      status: "available" as const,
      categoryId: sec.categoryId,
    };

    if (!targetRow) {
      const newRow: Row = { id: generateId("row"), label: "A", seats: [newSeat] };
      history.execute({
        description: `Add seat to new row`,
        execute: () => {
          const cur = freshVenue(store);
          if (!cur) return;
          setVenue(store, {
            ...cur,
            sections: cur.sections.map((s) =>
              s.id === sectionId ? { ...s, rows: [...s.rows, newRow] } : s,
            ),
          });
        },
        undo: () => {
          const cur = freshVenue(store);
          if (!cur) return;
          setVenue(store, {
            ...cur,
            sections: cur.sections.map((s) =>
              s.id === sectionId ? { ...s, rows: s.rows.filter((r) => r.id !== newRow.id) } : s,
            ),
          });
        },
      });
      return;
    }

    const rowId = targetRow.id;
    history.execute({
      description: `Add seat to row "${targetRow.label}"`,
      execute: () => {
        const cur = freshVenue(store);
        if (!cur) return;
        setVenue(store, {
          ...cur,
          sections: cur.sections.map((s) =>
            s.id === sectionId
              ? {
                  ...s,
                  rows: s.rows.map((r) =>
                    r.id === rowId ? { ...r, seats: [...r.seats, newSeat] } : r,
                  ),
                }
              : s,
          ),
        });
      },
      undo: () => {
        const cur = freshVenue(store);
        if (!cur) return;
        setVenue(store, {
          ...cur,
          sections: cur.sections.map((s) =>
            s.id === sectionId
              ? {
                  ...s,
                  rows: s.rows.map((r) =>
                    r.id === rowId ? { ...r, seats: r.seats.filter((st) => st.id !== newSeat.id) } : r,
                  ),
                }
              : s,
          ),
        });
      },
    });
  };

  if (!venue) {
    return (
      <div style={{ padding: 16, color: "#9e9e9e", fontSize: 13, fontFamily: "system-ui", ...style }}>
        No venue loaded
      </div>
    );
  }

  if (!selectedSection) {
    return (
      <div style={{ padding: 16, ...style }}>
        <div style={{ color: "#9e9e9e", fontSize: 13, fontFamily: "system-ui", marginBottom: 12 }}>
          {selectedSeatIds.size === 0
            ? "Select seats to edit section properties"
            : `${selectedSeatIds.size} seat(s) selected`}
        </div>
        <div style={labelStyle}>Venue</div>
        <div style={{ color: "#e0e0e0", fontSize: 14, fontFamily: "system-ui" }}>{venue.name}</div>
        <div style={{ ...labelStyle, marginTop: 12 }}>Sections: {venue.sections.length}</div>
        <div style={{ ...labelStyle, marginTop: 4 }}>
          Seats: {venue.sections.reduce((t, s) => t + s.rows.reduce((rt, r) => rt + r.seats.length, 0), 0)}
        </div>

        <div style={{ height: 1, background: "#2a2a4a", margin: "14px 0" }} />
        <div style={labelStyle}>Background Image</div>
        {venue.backgroundImage ? (
          <div style={{ marginTop: 6 }}>
            <div
              style={{
                width: "100%",
                height: 80,
                borderRadius: 4,
                border: "1px solid #3a3a5a",
                overflow: "hidden",
                marginBottom: 8,
              }}
            >
              <img
                src={venue.backgroundImage}
                alt="Background"
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
            </div>
            <div style={{ ...labelStyle, marginBottom: 4 }}>
              Opacity: {Math.round((venue.backgroundImageOpacity ?? 0.5) * 100)}%
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round((venue.backgroundImageOpacity ?? 0.5) * 100)}
              onChange={(e) => onBackgroundOpacityChange?.(parseInt(e.target.value) / 100)}
              style={{ width: "100%", accentColor: "#6a6aaa", cursor: "pointer" }}
            />
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              <button onClick={onUploadBackground} style={btnSmall}>
                Replace
              </button>
              <button onClick={onRemoveBackground} style={btnDanger}>
                Remove
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={onUploadBackground}
            style={{ ...btnSmall, marginTop: 6, width: "100%" }}
          >
            Upload Image
          </button>
        )}
      </div>
    );
  }

  const selectedSeatList: Array<{ seat: typeof selectedSection.rows[0]["seats"][0]; row: Row }> = [];
  for (const row of selectedSection.rows) {
    for (const seat of row.seats) {
      if (selectedSeatIds.has(seat.id)) {
        selectedSeatList.push({ seat, row });
      }
    }
  }

  return (
    <div style={{ padding: 16, ...style }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontWeight: 600, color: "#e0e0e0", fontSize: 14, fontFamily: "system-ui" }}>
          Section
        </div>
        <button onClick={() => deleteSection(selectedSection.id)} style={btnDanger} title="Delete section">
          Delete
        </button>
      </div>

      <div style={{ marginBottom: 10 }}>
        <div style={labelStyle}>Label</div>
        <input
          style={inputStyle}
          value={selectedSection.label}
          onChange={(e) => updateSectionLabel(selectedSection.id, e.target.value)}
        />
      </div>

      <div style={{ marginBottom: 10 }}>
        <div style={labelStyle}>Category</div>
        <select
          style={selectStyle}
          value={selectedSection.categoryId}
          onChange={(e) => updateSectionCategory(selectedSection.id, e.target.value)}
        >
          {venue.categories.map((cat: PricingCategory) => (
            <option key={cat.id} value={cat.id}>{cat.name}</option>
          ))}
        </select>
      </div>

      <div style={{ marginBottom: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={labelStyle}>
            Rows ({selectedSection.rows.length}) &middot;{" "}
            {selectedSection.rows.reduce((t, r) => t + r.seats.length, 0)} seats
          </div>
          <button onClick={() => addSingleSeat(selectedSection.id)} style={btnSmall} title="Add a single seat to the last row">
            + Seat
          </button>
        </div>
      </div>

      <div style={{ maxHeight: 200, overflowY: "auto", marginBottom: 10 }}>
        {selectedSection.rows.map((row) => (
          <div
            key={row.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "3px 6px",
              borderRadius: 4,
              marginBottom: 2,
              background: "#2a2a4a",
              fontSize: 12,
              fontFamily: "system-ui",
              color: "#e0e0e0",
            }}
          >
            <span style={{ fontWeight: 600, minWidth: 24 }}>Row {row.label}</span>
            <span style={{ flex: 1, color: "#9e9e9e" }}>{row.seats.length} seats</span>
            <button
              onClick={() => deleteRow(selectedSection.id, row.id)}
              style={{ ...btnDanger, padding: "1px 5px", fontSize: 11 }}
              title={`Delete row ${row.label}`}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {selectedSeatList.length > 0 && selectedSeatList.length <= 10 && (
        <div style={{ marginBottom: 10 }}>
          <div style={labelStyle}>Selected Seats ({selectedSeatList.length})</div>
          <div style={{ maxHeight: 120, overflowY: "auto" }}>
            {selectedSeatList.map(({ seat, row }) => (
              <div
                key={seat.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "2px 6px",
                  fontSize: 12,
                  fontFamily: "system-ui",
                  color: "#e0e0e0",
                }}
              >
                <span style={{ flex: 1 }}>Row {row.label}, Seat {seat.label}</span>
                <button
                  onClick={() => deleteSeat(selectedSection.id, row.id, seat.id)}
                  style={{ ...btnDanger, padding: "1px 5px", fontSize: 11 }}
                  title="Delete seat"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      {selectedSeatList.length > 10 && (
        <div style={{ ...labelStyle, marginBottom: 10 }}>
          {selectedSeatList.length} seats selected
        </div>
      )}
    </div>
  );
}
