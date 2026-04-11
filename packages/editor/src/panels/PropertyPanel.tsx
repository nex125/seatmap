import { useState, useEffect, type CSSProperties } from "react";
import type { Venue, Section, PricingCategory, CommandHistory, Row, Seat } from "@nex125/seatmap-core";
import { generateId, isDancefloorSection, isStageSection } from "@nex125/seatmap-core";
import { AVAILABLE_STATUS_ID } from "@nex125/seatmap-core";
import type { SeatmapStore } from "@nex125/seatmap-react";

export interface PropertyPanelProps {
  venue: Venue | null;
  selectedSeatIds: Set<string>;
  selectedSectionIds: Set<string>;
  history: CommandHistory;
  store: SeatmapStore;
  onUploadBackground?: () => void;
  onRemoveBackground?: () => void;
  onBackgroundOpacityChange?: (opacity: number) => void;
  onBackgroundSizeChange?: (size: { width?: number; height?: number }) => void;
  onBackgroundKeepAspectRatioChange?: (keepAspectRatio: boolean) => void;
  style?: CSSProperties;
}

function freshVenue(store: SeatmapStore): Venue | null {
  return store.getState().venue;
}

function setVenue(store: SeatmapStore, venue: Venue) {
  store.getState().setVenue(venue);
}

function isSectionSeatLayoutLocked(section: Section): boolean {
  return isStageSection(section) || isDancefloorSection(section);
}

export function PropertyPanel({
  venue,
  selectedSeatIds,
  selectedSectionIds,
  history,
  store,
  onUploadBackground,
  onRemoveBackground,
  onBackgroundOpacityChange,
  onBackgroundSizeChange,
  onBackgroundKeepAspectRatioChange,
  style,
}: PropertyPanelProps) {
  const [selectedSections, setSelectedSections] = useState<Section[]>([]);

  useEffect(() => {
    if (!venue) {
      setSelectedSections([]);
      return;
    }

    setSelectedSections(venue.sections.filter((section) => selectedSectionIds.has(section.id)));
  }, [venue, selectedSectionIds]);

  const updateVenueName = (newName: string) => {
    const v = freshVenue(store);
    if (!v) return;
    const oldName = v.name;
    history.execute({
      description: `Rename venue to "${newName}"`,
      execute: () => setVenue(store, { ...v, name: newName }),
      undo: () => setVenue(store, { ...v, name: oldName }),
    });
  };

  const updateVenueId = (newId: string) => {
    const v = freshVenue(store);
    if (!v) return;
    const oldId = v.id;
    history.execute({
      description: `Change venue ID to "${newId}"`,
      execute: () => setVenue(store, { ...v, id: newId }),
      undo: () => setVenue(store, { ...v, id: oldId }),
    });
  };

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
    const targetSection = v.sections.find((s) => s.id === sectionId);
    if (!targetSection || isStageSection(targetSection)) return;
    const oldCatId = targetSection.categoryId;

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

  const updateSelectedSectionsLabel = (sectionIds: string[], newLabel: string) => {
    if (sectionIds.length === 0) return;
    const v = freshVenue(store);
    if (!v) return;
    const targetIds = new Set(sectionIds);
    const previousLabels = new Map(
      v.sections
        .filter((section) => targetIds.has(section.id))
        .map((section) => [section.id, section.label]),
    );

    history.execute({
      description: `Rename ${sectionIds.length} section(s)`,
      execute: () => {
        const cur = freshVenue(store);
        if (!cur) return;
        setVenue(store, {
          ...cur,
          sections: cur.sections.map((section) =>
            targetIds.has(section.id) ? { ...section, label: newLabel } : section,
          ),
        });
      },
      undo: () => {
        const cur = freshVenue(store);
        if (!cur) return;
        setVenue(store, {
          ...cur,
          sections: cur.sections.map((section) =>
            targetIds.has(section.id)
              ? { ...section, label: previousLabels.get(section.id) ?? section.label }
              : section,
          ),
        });
      },
    });
  };

  const updateSelectedSectionsCategory = (sectionIds: string[], categoryId: string) => {
    if (sectionIds.length === 0) return;
    const v = freshVenue(store);
    if (!v) return;
    const targetIds = new Set(
      v.sections
        .filter((section) => sectionIds.includes(section.id) && !isStageSection(section))
        .map((section) => section.id),
    );
    if (targetIds.size === 0) return;
    const previousCategoryBySectionId = new Map(
      v.sections
        .filter((section) => targetIds.has(section.id))
        .map((section) => [section.id, section.categoryId]),
    );

    history.execute({
      description: `Change category for ${targetIds.size} section(s)`,
      execute: () => {
        const cur = freshVenue(store);
        if (!cur) return;
        setVenue(store, {
          ...cur,
          sections: cur.sections.map((section) => {
            if (!targetIds.has(section.id)) return section;
            return {
              ...section,
              categoryId,
              rows: section.rows.map((row) => ({
                ...row,
                seats: row.seats.map((seat) => ({ ...seat, categoryId })),
              })),
            };
          }),
        });
      },
      undo: () => {
        const cur = freshVenue(store);
        if (!cur) return;
        setVenue(store, {
          ...cur,
          sections: cur.sections.map((section) => {
            if (!targetIds.has(section.id)) return section;
            const previousCategoryId = previousCategoryBySectionId.get(section.id) ?? section.categoryId;
            return {
              ...section,
              categoryId: previousCategoryId,
              rows: section.rows.map((row) => ({
                ...row,
                seats: row.seats.map((seat) => ({ ...seat, categoryId: previousCategoryId })),
              })),
            };
          }),
        });
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

  const deleteSelectedObjects = () => {
    if (selectedSeatIds.size === 0 && selectedSectionIds.size === 0) return;
    const v = freshVenue(store);
    if (!v) return;

    const selectedSectionIdSet = new Set(selectedSectionIds);
    const selectedSeatIdSet = new Set(selectedSeatIds);
    const previousVenue = v;
    const nextVenue: Venue = {
      ...v,
      sections: v.sections
        .filter((section) => !selectedSectionIdSet.has(section.id))
        .map((section) => ({
          ...section,
          rows: section.rows.map((row) => ({
            ...row,
            seats: row.seats.filter((seat) => !selectedSeatIdSet.has(seat.id)),
          })),
        })),
      tables: v.tables.map((table) => ({
        ...table,
        seats: table.seats.filter((seat) => !selectedSeatIdSet.has(seat.id)),
      })),
    };

    history.execute({
      description: "Delete selected objects",
      execute: () => {
        setVenue(store, nextVenue);
        store.getState().clearSelection();
      },
      undo: () => {
        setVenue(store, previousVenue);
      },
    });
  };

  const addSingleSeat = (sectionId: string) => {
    const v = freshVenue(store);
    if (!v) return;
    const sec = v.sections.find((s) => s.id === sectionId);
    if (!sec || isSectionSeatLayoutLocked(sec)) return;

    let targetRow: Row | undefined = sec.rows[sec.rows.length - 1];
    const newSeat = {
      id: generateId(),
      label: targetRow ? `${targetRow.seats.length + 1}` : "1",
      position: {
        x: targetRow ? (targetRow.seats.length > 0 ? targetRow.seats[targetRow.seats.length - 1].position.x + 20 : 0) : 0,
        y: targetRow ? targetRow.seats[0]?.position.y ?? 0 : 0,
      },
      status: "available" as const,
      categoryId: sec.categoryId,
    };

    if (!targetRow) {
      const newRow: Row = { id: generateId(), label: "A", seats: [newSeat] };
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

  const updateSelectedSeatStatus = (statusId: string) => {
    if (selectedSeatIds.size === 0) return;
    const v = freshVenue(store);
    if (!v) return;

    const previousVenue = v;
    const nextVenue: Venue = {
      ...v,
      sections: v.sections.map((section) => ({
        ...section,
        rows: section.rows.map((row) => ({
          ...row,
          seats: row.seats.map((seat) =>
            selectedSeatIds.has(seat.id) ? { ...seat, status: statusId } : seat,
          ),
        })),
      })),
      tables: v.tables.map((table) => ({
        ...table,
        seats: table.seats.map((seat) =>
          selectedSeatIds.has(seat.id) ? { ...seat, status: statusId } : seat,
        ),
      })),
    };

    history.execute({
      description: `Set ${selectedSeatIds.size} seat(s) status`,
      execute: () => setVenue(store, nextVenue),
      undo: () => setVenue(store, previousVenue),
    });
  };

  if (!venue) {
    return (
      <div className="seatmap-editor__panel seatmap-editor__panel-muted" style={style}>
        No venue loaded
      </div>
    );
  }

  const selectedSeatsEverywhere: Seat[] = [];
  for (const section of venue.sections) {
    for (const row of section.rows) {
      for (const seat of row.seats) {
        if (selectedSeatIds.has(seat.id)) selectedSeatsEverywhere.push(seat);
      }
    }
  }
  for (const table of venue.tables) {
    for (const seat of table.seats) {
      if (selectedSeatIds.has(seat.id)) selectedSeatsEverywhere.push(seat);
    }
  }

  const selectedSeatStatusIds = new Set(selectedSeatsEverywhere.map((seat) => seat.status));
  const isMixedSeatStatus = selectedSeatStatusIds.size > 1;
  const selectedSeatStatusId =
    selectedSeatStatusIds.size > 0 ? [...selectedSeatStatusIds][0] : AVAILABLE_STATUS_ID;
  const hasMultipleSelectedSections = selectedSections.length > 1;
  const selectedNonStageSections = selectedSections.filter((section) => !isStageSection(section));
  const hasSelectedStage = selectedSections.some((section) => isStageSection(section));
  const selectedSectionIdsList = selectedSections.map((section) => section.id);
  const selectedSectionLabels = new Set(selectedSections.map((section) => section.label));
  const selectedSectionCategoryIds = new Set(selectedNonStageSections.map((section) => section.categoryId));
  const sharedLabelValue = selectedSectionLabels.size === 1 ? selectedSections[0]?.label ?? "" : "";
  const sharedCategoryValue =
    selectedNonStageSections.length === 0
      ? ""
      : selectedSectionCategoryIds.size === 1
        ? selectedNonStageSections[0]?.categoryId ?? ""
        : "__mixed__";

  return (
    <div className="seatmap-editor__panel" style={style}>
      {selectedSeatIds.size > 0 && (
        <div className="seatmap-editor__panel-section">
          <div className="seatmap-editor__panel-section-header">
            <div className="seatmap-editor__panel-title">
              Seat Config ({selectedSeatIds.size} selected)
            </div>
            <button onClick={deleteSelectedObjects} className="seatmap-editor__panel-button seatmap-editor__panel-button--danger" title="Delete selected objects">
              Delete Selected
            </button>
          </div>

          <div className="seatmap-editor__panel-section">
            <div className="seatmap-editor__panel-label">Seat Status</div>
            <select
              className="seatmap-editor__panel-select"
              value={isMixedSeatStatus ? "__mixed__" : selectedSeatStatusId}
              onChange={(e) => updateSelectedSeatStatus(e.target.value)}
            >
              {isMixedSeatStatus && (
                <option value="__mixed__" disabled>
                  Mixed
                </option>
              )}
              {venue.seatStatuses.map((status) => (
                <option key={status.id} value={status.id}>{status.name}</option>
              ))}
            </select>
          </div>

          <div className="seatmap-editor__panel-section">
            <div className="seatmap-editor__panel-label">Selected Seats ({selectedSeatIds.size})</div>
            <div className="seatmap-editor__panel-list seatmap-editor__panel-scroll seatmap-editor__panel-scroll--sm">
              {Array.from(selectedSeatIds).map((seatId) => {
                let found: { seat: Seat; row: Row; section: Section } | null = null;
                for (const section of venue.sections) {
                  for (const row of section.rows) {
                    const seat = row.seats.find((s) => s.id === seatId);
                    if (seat) {
                      found = { seat, row, section };
                      break;
                    }
                  }
                  if (found) break;
                }

                if (!found) return null;
                const { seat, row, section } = found;
                return (
                  <div
                    key={seat.id}
                    className="seatmap-editor__panel-list-item"
                  >
                    <span className="seatmap-editor__panel-text seatmap-editor__panel-content-grow">
                      {section.label} &middot; Row {row.label}, Seat {seat.label}
                    </span>
                    <button
                      onClick={() => deleteSeat(section.id, row.id, seat.id)}
                      className="seatmap-editor__panel-button seatmap-editor__panel-button--danger seatmap-editor__panel-button--tiny"
                      title="Delete seat"
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="seatmap-editor__panel-divider" />
        </div>
      )}

      {selectedSeatIds.size === 0 && selectedSections.length > 0 && (
        <div className="seatmap-editor__panel-section">
          <div className="seatmap-editor__panel-section-header">
            <div className="seatmap-editor__panel-title">
              Section / Stage / Dancefloor Config{selectedSections.length > 1 ? ` (${selectedSections.length} selected)` : ""}
            </div>
            <button onClick={deleteSelectedObjects} className="seatmap-editor__panel-button seatmap-editor__panel-button--danger" title="Delete selected objects">
              Delete Selected
            </button>
          </div>

          {hasMultipleSelectedSections && (
            <div className="seatmap-editor__panel-section seatmap-editor__panel-section--card">
              <div className="seatmap-editor__panel-section">
                <div className="seatmap-editor__panel-label">Label (apply to all selected)</div>
                <input
                  className="seatmap-editor__panel-input"
                  value={sharedLabelValue}
                  placeholder="Mixed labels"
                  onChange={(e) => updateSelectedSectionsLabel(selectedSectionIdsList, e.target.value)}
                />
              </div>
              <div>
                <div className="seatmap-editor__panel-label">Category (apply to all selected)</div>
                <select
                  className="seatmap-editor__panel-select"
                  value={sharedCategoryValue}
                  onChange={(e) => updateSelectedSectionsCategory(selectedSectionIdsList, e.target.value)}
                  disabled={selectedNonStageSections.length === 0}
                >
                  {selectedNonStageSections.length === 0 && (
                    <option value="" disabled>Not applicable for stage</option>
                  )}
                  {sharedCategoryValue === "__mixed__" && (
                    <option value="__mixed__" disabled>Mixed</option>
                  )}
                  {venue.categories.map((cat: PricingCategory) => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
                {hasSelectedStage && (
                  <div className="seatmap-editor__panel-label">
                    Stage selection is excluded from category changes.
                  </div>
                )}
              </div>
            </div>
          )}

          {selectedSections.map((selectedSection) => (
            <div key={selectedSection.id} className="seatmap-editor__panel-section seatmap-editor__panel-section--card">
              <div className="seatmap-editor__panel-section-header">
                <div className="seatmap-editor__panel-muted">
                  ID: {selectedSection.id}
                </div>
              </div>

              {!hasMultipleSelectedSections && (
                <>
                  <div className="seatmap-editor__panel-section">
                    <div className="seatmap-editor__panel-label">Label</div>
                    <input
                      className="seatmap-editor__panel-input"
                      value={selectedSection.label}
                      onChange={(e) => updateSectionLabel(selectedSection.id, e.target.value)}
                    />
                  </div>

                  <div className="seatmap-editor__panel-section">
                    <div className="seatmap-editor__panel-label">Category</div>
                    <select
                      className="seatmap-editor__panel-select"
                      value={selectedSection.categoryId}
                      onChange={(e) => updateSectionCategory(selectedSection.id, e.target.value)}
                      disabled={isStageSection(selectedSection)}
                    >
                      {isStageSection(selectedSection) && (
                        <option value="" disabled>Not applicable for stage</option>
                      )}
                      {venue.categories.map((cat: PricingCategory) => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                    {isStageSection(selectedSection) && (
                      <div className="seatmap-editor__panel-label">
                        Stage does not use pricing category.
                      </div>
                    )}
                  </div>
                </>
              )}

              {isStageSection(selectedSection) ? (
                <div className="seatmap-editor__panel-section seatmap-editor__panel-section--card seatmap-editor__panel-muted">
                  Stage areas do not support rows or seats.
                </div>
              ) : isDancefloorSection(selectedSection) ? (
                <div className="seatmap-editor__panel-section seatmap-editor__panel-section--card seatmap-editor__panel-muted">
                  Dancefloor works as one selectable area seat. Resize the section shape to adjust its footprint.
                </div>
              ) : (
                <>
                  <div className="seatmap-editor__panel-section">
                    <div className="seatmap-editor__panel-section-header">
                      <div className="seatmap-editor__panel-label">
                        Rows ({selectedSection.rows.length}) &middot;{" "}
                        {selectedSection.rows.reduce((t, r) => t + r.seats.length, 0)} seats
                      </div>
                      <button onClick={() => addSingleSeat(selectedSection.id)} className="seatmap-editor__panel-button" title="Add a single seat to the last row">
                        + Seat
                      </button>
                    </div>
                  </div>

                  <div className="seatmap-editor__panel-list seatmap-editor__panel-scroll seatmap-editor__panel-scroll--md">
                    {selectedSection.rows.map((row) => (
                      <div
                        key={row.id}
                        className="seatmap-editor__panel-list-item"
                      >
                        <span className="seatmap-editor__panel-text seatmap-editor__panel-text--strong seatmap-editor__panel-text--mono-min">Row {row.label}</span>
                        <span className="seatmap-editor__panel-muted seatmap-editor__panel-content-grow">{row.seats.length} seats</span>
                        <button
                          onClick={() => deleteRow(selectedSection.id, row.id)}
                          className="seatmap-editor__panel-button seatmap-editor__panel-button--danger seatmap-editor__panel-button--tiny"
                          title={`Delete row ${row.label}`}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {selectedSections.length === 0 && selectedSeatIds.size === 0 && (
        <div>
          <div className="seatmap-editor__panel-title">
            Venue Config
          </div>

          <div className="seatmap-editor__panel-section">
            <div className="seatmap-editor__panel-label">Venue Name</div>
            <input
              className="seatmap-editor__panel-input"
              value={venue.name}
              onChange={(e) => updateVenueName(e.target.value)}
            />
          </div>

          <div className="seatmap-editor__panel-section">
            <div className="seatmap-editor__panel-label">Venue ID</div>
            <input
              className="seatmap-editor__panel-input"
              value={venue.id}
              onChange={(e) => updateVenueId(e.target.value)}
            />
          </div>

          <div className="seatmap-editor__panel-muted seatmap-editor__panel-muted--small">
            Stats: {venue.sections.length} sections &middot;{" "}
            {venue.sections.reduce((t, s) => t + s.rows.reduce((rt, r) => rt + r.seats.length, 0), 0)} seats
          </div>

          <div className="seatmap-editor__panel-divider" />
          <div className="seatmap-editor__panel-label">Background Image</div>
          {venue.backgroundImage ? (
            <div className="seatmap-editor__panel-section">
              <div className="seatmap-editor__panel-img-preview">
                <img src={venue.backgroundImage} alt="Background" />
              </div>
              <div className="seatmap-editor__panel-label">
                Opacity: {Math.round((venue.backgroundImageOpacity ?? 0.5) * 100)}%
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round((venue.backgroundImageOpacity ?? 0.5) * 100)}
                onChange={(e) => onBackgroundOpacityChange?.(parseInt(e.target.value) / 100)}
                className="seatmap-editor__panel-range"
              />
              <div className="seatmap-editor__panel-grid-2">
                <div>
                  <div className="seatmap-editor__panel-label">Width</div>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={Math.round(venue.backgroundImageWidth ?? venue.bounds.width)}
                    onChange={(e) =>
                      onBackgroundSizeChange?.({
                        width: Math.max(1, Number.parseInt(e.target.value, 10) || 1),
                      })
                    }
                    className="seatmap-editor__panel-input"
                  />
                </div>
                <div>
                  <div className="seatmap-editor__panel-label">Height</div>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={Math.round(venue.backgroundImageHeight ?? venue.bounds.height)}
                    onChange={(e) =>
                      onBackgroundSizeChange?.({
                        height: Math.max(1, Number.parseInt(e.target.value, 10) || 1),
                      })
                    }
                    className="seatmap-editor__panel-input"
                  />
                </div>
              </div>
              <label className="seatmap-editor__panel-row seatmap-editor__panel-text">
                <input
                  type="checkbox"
                  className="seatmap-editor__panel-checkbox"
                  checked={venue.backgroundImageKeepAspectRatio ?? true}
                  onChange={(e) => onBackgroundKeepAspectRatioChange?.(e.target.checked)}
                />
                Keep aspect ratio
              </label>
              <div className="seatmap-editor__panel-row">
                <button onClick={onUploadBackground} className="seatmap-editor__panel-button">
                  Replace
                </button>
                <button onClick={onRemoveBackground} className="seatmap-editor__panel-button seatmap-editor__panel-button--danger">
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={onUploadBackground}
              className="seatmap-editor__panel-button seatmap-editor__panel-button--full"
            >
              Upload Image
            </button>
          )}
        </div>
      )}
    </div>
  );
}
