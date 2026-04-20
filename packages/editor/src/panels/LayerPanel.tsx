import type { CSSProperties } from "react";
import type { Venue, Section } from "@nex125/seatmap-core";
import type { SeatmapEditorTranslate } from "../i18n";
import { translateEditorText } from "../i18n";

export interface LayerPanelProps {
  venue: Venue | null;
  selectedSeatIds: Set<string>;
  selectedSectionIds: Set<string>;
  onSelectSection: (sectionId: string, options?: { multi?: boolean }) => void;
  translate?: SeatmapEditorTranslate;
  style?: CSSProperties;
}

export function LayerPanel({
  venue,
  selectedSeatIds,
  selectedSectionIds: storeSelectedSectionIds,
  onSelectSection,
  translate,
  style,
}: LayerPanelProps) {
  const t = (key: string, fallback: string, values?: Record<string, string | number>) =>
    translateEditorText(translate, key, fallback, values);
  if (!venue) return null;
  const shouldScrollSections = venue.sections.length > 3;

  const findSectionForSeat = (seatId: string): string | null => {
    for (const section of venue.sections) {
      for (const row of section.rows) {
        if (row.seats.some((s) => s.id === seatId)) return section.id;
      }
    }
    return null;
  };

  const selectedSectionIdFromSeats = selectedSeatIds.size > 0
    ? findSectionForSeat([...selectedSeatIds][0]!)
    : null;

  return (
    <div className="seatmap-editor__panel" style={style}>
      <div className="seatmap-editor__panel-title">
        {t("seatmapEditor.layerPanel.title", "Layers")}
      </div>

      <div className={shouldScrollSections ? "seatmap-editor__panel-scroll seatmap-editor__panel-scroll--sections" : undefined}>
        <div
          className="seatmap-editor__panel-list"
          role="listbox"
          aria-label={t("seatmapEditor.layerPanel.ariaLabel", "Venue sections")}
          aria-multiselectable="true"
        >
          {venue.sections.map((section: Section) => {
            const seatCount = section.rows.reduce((t, r) => t + r.seats.length, 0);
            const isActive = storeSelectedSectionIds.has(section.id) || section.id === selectedSectionIdFromSeats;
            const catColor =
              venue.categories.find((c) => c.id === section.categoryId)?.color
              ?? "var(--seatmap-editor-text-muted, #666)";

            return (
              <button
                key={section.id}
                type="button"
                role="option"
                aria-selected={isActive}
                onClick={(event) =>
                  onSelectSection(section.id, {
                    multi: event.ctrlKey || event.metaKey,
                  })
                }
                className={`seatmap-editor__panel-list-item seatmap-editor__panel-list-item--interactive seatmap-editor__panel-list-item--interactive-button${isActive ? " is-active" : ""}`}
              >
                <div
                  className="seatmap-editor__table-category-swatch"
                  aria-hidden="true"
                  style={{ background: catColor }}
                />
                <div className="seatmap-editor__panel-content-grow">
                  <div className="seatmap-editor__panel-text seatmap-editor__panel-text--truncate">
                    {section.label}
                  </div>
                  <div className="seatmap-editor__panel-muted seatmap-editor__panel-muted--small">
                    {t("seatmapEditor.layerPanel.sectionMeta", "{rows} rows, {seats} seats", { rows: section.rows.length, seats: seatCount })}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {venue.sections.length === 0 && (
        <div className="seatmap-editor__panel-muted">
          {t("seatmapEditor.layerPanel.empty", "No sections yet. Use the Add Section tool.")}
        </div>
      )}
    </div>
  );
}
