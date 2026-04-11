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
  const [newColor, setNewColor] = useState("#dfcd72");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingColor, setEditingColor] = useState("#dfcd72");

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
    <div className="seatmap-editor__panel" style={style}>
      <div className="seatmap-editor__panel-title">
        Seat Statuses
      </div>

      {venue.seatStatuses.map((status) => {
        const isEditing = editingId === status.id;
        return (
          <div
            key={status.id}
            className="seatmap-editor__panel-list-item"
          >
            <span className="seatmap-editor__color-picker-shell">
              <span
                aria-hidden="true"
                className="seatmap-editor__color-picker-dot"
                style={{ background: isEditing ? editingColor : status.color }}
              />
              <input
                type="color"
                value={isEditing ? editingColor : status.color}
                onChange={(e) => isEditing && setEditingColor(e.target.value)}
                disabled={!isEditing}
                className="seatmap-editor__color-picker-input"
                data-editable={isEditing ? "true" : "false"}
                title={isEditing ? "Pick status color" : "Enable edit to change color"}
              />
            </span>
            {isEditing ? (
              <input
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                className="seatmap-editor__panel-input seatmap-editor__panel-input--grow"
              />
            ) : (
              <div className="seatmap-editor__panel-text seatmap-editor__panel-content-grow">
                {status.name}
              </div>
            )}
            {isEditing ? (
              <>
                <button onClick={saveEdit} className="seatmap-editor__panel-button seatmap-editor__panel-button--tiny">
                  Save
                </button>
                <button onClick={() => setEditingId(null)} className="seatmap-editor__panel-button seatmap-editor__panel-button--tiny">
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button onClick={() => startEdit(status)} className="seatmap-editor__panel-button seatmap-editor__panel-button--tiny">
                  Edit
                </button>
                <button
                  onClick={() => removeStatus(status.id)}
                  className="seatmap-editor__panel-button seatmap-editor__panel-button--tiny"
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

      <div className="seatmap-editor__panel-row seatmap-editor__panel-row--spaced">
        <span className="seatmap-editor__color-picker-shell seatmap-editor__color-picker-shell--lg">
          <span aria-hidden="true" className="seatmap-editor__color-picker-dot" style={{ background: newColor }} />
          <input
            type="color"
            value={newColor}
            onChange={(e) => setNewColor(e.target.value)}
            className="seatmap-editor__color-picker-input"
            data-editable="true"
            title="Pick new status color"
          />
        </span>
        <input
          placeholder="Status name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addStatus()}
          className="seatmap-editor__panel-input seatmap-editor__panel-input--grow"
        />
        <button onClick={addStatus} className="seatmap-editor__panel-button">
          Add
        </button>
      </div>
    </div>
  );
}
