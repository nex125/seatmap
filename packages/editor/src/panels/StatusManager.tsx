import { useMemo, useState, type CSSProperties } from "react";
import type { Venue, CommandHistory, SeatStatusDefinition } from "@nex125/seatmap-core";
import { AVAILABLE_STATUS_ID, generateId } from "@nex125/seatmap-core";
import type { SeatmapStore } from "@nex125/seatmap-react";

export interface StatusManagerProps {
  venue: Venue | null;
  history: CommandHistory;
  store: SeatmapStore;
  style?: CSSProperties;
}

const btnSmall: CSSProperties = {
  padding: "3px 8px",
  border: "1px solid #3a3836",
  borderRadius: 4,
  background: "#242424",
  color: "#e5e2e1",
  cursor: "pointer",
  fontSize: 12,
  fontFamily: "system-ui",
};

const colorPickerShellStyle: CSSProperties = {
  width: 14,
  height: 14,
  borderRadius: 5,
  border: "1px solid #5c5957",
  overflow: "hidden",
  flexShrink: 0,
  background: "#242424",
  boxShadow: "0 1px 2px rgba(0, 0, 0, 0.35), inset 0 0 0 1px rgba(229, 226, 225, 0.16)",
  position: "relative",
};

const colorPickerInputStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  border: "none",
  padding: 0,
  margin: 0,
  display: "inline-block",
  background: "transparent",
  opacity: 0,
};

function sanitizeStatusId(name: string): string {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || generateId();
}

function replaceStatusInVenue(venue: Venue, statusId: string, replacementStatusId: string): Venue {
  return {
    ...venue,
    sections: venue.sections.map((section) => ({
      ...section,
      rows: section.rows.map((row) => ({
        ...row,
        seats: row.seats.map((seat) =>
          seat.status === statusId ? { ...seat, status: replacementStatusId } : seat,
        ),
      })),
    })),
    tables: venue.tables.map((table) => ({
      ...table,
      seats: table.seats.map((seat) =>
        seat.status === statusId ? { ...seat, status: replacementStatusId } : seat,
      ),
    })),
  };
}

export function StatusManager({ venue, history, store, style }: StatusManagerProps) {
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#4caf50");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingColor, setEditingColor] = useState("#4caf50");

  const statusIds = useMemo(() => new Set(venue?.seatStatuses.map((status) => status.id) ?? []), [venue]);

  if (!venue) return null;

  const addStatus = () => {
    const trimmedName = newName.trim();
    if (!trimmedName) return;

    let candidateId = sanitizeStatusId(trimmedName);
    while (statusIds.has(candidateId) || candidateId === "selected" || candidateId === "hovered") {
      candidateId = `${sanitizeStatusId(trimmedName)}-${generateId().slice(-4)}`;
    }

    const newStatus: SeatStatusDefinition = {
      id: candidateId,
      name: trimmedName,
      color: newColor,
    };

    history.execute({
      description: `Add status "${newStatus.name}"`,
      execute: () => {
        const current = store.getState().venue;
        if (!current) return;
        store.getState().setVenue({ ...current, seatStatuses: [...current.seatStatuses, newStatus] });
      },
      undo: () => {
        const current = store.getState().venue;
        if (!current) return;
        store.getState().setVenue({
          ...current,
          seatStatuses: current.seatStatuses.filter((status) => status.id !== newStatus.id),
        });
      },
    });

    setNewName("");
  };

  const startEdit = (status: SeatStatusDefinition) => {
    setEditingId(status.id);
    setEditingName(status.name);
    setEditingColor(status.color);
  };

  const saveEdit = () => {
    if (!editingId) return;
    const trimmedName = editingName.trim();
    if (!trimmedName) return;

    history.execute({
      description: `Update status "${trimmedName}"`,
      execute: () => {
        const current = store.getState().venue;
        if (!current) return;
        store.getState().setVenue({
          ...current,
          seatStatuses: current.seatStatuses.map((status) =>
            status.id === editingId
              ? { ...status, name: trimmedName, color: editingColor }
              : status,
          ),
        });
      },
      undo: () => {
        const original = venue.seatStatuses.find((status) => status.id === editingId);
        const current = store.getState().venue;
        if (!current || !original) return;
        store.getState().setVenue({
          ...current,
          seatStatuses: current.seatStatuses.map((status) =>
            status.id === editingId ? original : status,
          ),
        });
      },
    });

    setEditingId(null);
  };

  const removeStatus = (statusId: string) => {
    if (statusId === AVAILABLE_STATUS_ID) return;
    const current = store.getState().venue;
    if (!current) return;
    const status = current.seatStatuses.find((s) => s.id === statusId);
    if (!status) return;

    const previousVenue = current;
    const nextVenue = replaceStatusInVenue(
      {
        ...previousVenue,
        seatStatuses: previousVenue.seatStatuses.filter((s) => s.id !== statusId),
      },
      statusId,
      AVAILABLE_STATUS_ID,
    );

    history.execute({
      description: `Remove status "${status.name}"`,
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
      <div style={{ fontWeight: 600, color: "#e5e2e1", fontSize: 14, fontFamily: "system-ui", marginBottom: 12 }}>
        Seat Statuses
      </div>

      {venue.seatStatuses.map((status) => {
        const isEditing = editingId === status.id;
        return (
          <div
            key={status.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
              marginBottom: 6,
              padding: "4px 8px",
              borderRadius: 4,
              background: "#232323",
            }}
          >
            <span style={colorPickerShellStyle}>
              <span
                aria-hidden="true"
                style={{
                  position: "absolute",
                  inset: 0,
                  background: isEditing ? editingColor : status.color,
                }}
              />
              <input
                type="color"
                value={isEditing ? editingColor : status.color}
                onChange={(e) => isEditing && setEditingColor(e.target.value)}
                disabled={!isEditing}
                style={{
                  ...colorPickerInputStyle,
                  cursor: isEditing ? "pointer" : "default",
                }}
                title={isEditing ? "Pick status color" : "Enable edit to change color"}
              />
            </span>
            {isEditing ? (
              <input
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                style={{
                  flex: 1,
                  minWidth: 0,
                  padding: "2px 6px",
                  background: "#1d1d1d",
                  border: "1px solid #3a3836",
                  borderRadius: 4,
                  color: "#e5e2e1",
                  fontSize: 12,
                  fontFamily: "system-ui",
                }}
              />
            ) : (
              <div style={{ flex: 1, color: "#e5e2e1", fontSize: 13, fontFamily: "system-ui" }}>
                {status.name}
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
                <button onClick={() => startEdit(status)} style={{ ...btnSmall, padding: "1px 6px", fontSize: 11 }}>
                  Edit
                </button>
                <button
                  onClick={() => removeStatus(status.id)}
                  style={{ ...btnSmall, padding: "1px 6px", fontSize: 11 }}
                  disabled={status.id === AVAILABLE_STATUS_ID}
                  title={status.id === AVAILABLE_STATUS_ID ? "Available status cannot be removed" : "Delete status"}
                >
                  ✕
                </button>
              </>
            )}
          </div>
        );
      })}

      <div style={{ display: "flex", gap: 6, marginTop: 10, alignItems: "center" }}>
        <span style={{ ...colorPickerShellStyle, width: 16, height: 16, borderRadius: 5 }}>
          <span aria-hidden="true" style={{ position: "absolute", inset: 0, background: newColor }} />
          <input
            type="color"
            value={newColor}
            onChange={(e) => setNewColor(e.target.value)}
            style={{ ...colorPickerInputStyle, cursor: "pointer" }}
            title="Pick new status color"
          />
        </span>
        <input
          placeholder="Status name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addStatus()}
          style={{
            flex: 1,
            padding: "4px 8px",
            background: "#242424",
            border: "1px solid #3a3836",
            borderRadius: 4,
            color: "#e5e2e1",
            fontSize: 13,
            fontFamily: "system-ui",
          }}
        />
        <button onClick={addStatus} style={btnSmall}>
          Add
        </button>
      </div>
    </div>
  );
}
