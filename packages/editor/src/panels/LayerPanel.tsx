import type { CSSProperties } from "react";
import type { Venue, Section } from "@nex125/seatmap-core";

export interface LayerPanelProps {
  venue: Venue | null;
  selectedSeatIds: Set<string>;
  onSelectSection: (sectionId: string) => void;
  style?: CSSProperties;
}

export function LayerPanel({
  venue,
  selectedSeatIds,
  onSelectSection,
  style,
}: LayerPanelProps) {
  if (!venue) return null;

  const findSectionForSeat = (seatId: string): string | null => {
    for (const section of venue.sections) {
      for (const row of section.rows) {
        if (row.seats.some((s) => s.id === seatId)) return section.id;
      }
    }
    return null;
  };

  const selectedSectionId = selectedSeatIds.size > 0
    ? findSectionForSeat([...selectedSeatIds][0]!)
    : null;

  return (
    <div style={{ padding: 16, ...style }}>
      <div style={{ fontWeight: 600, color: "#e0e0e0", fontSize: 14, fontFamily: "system-ui", marginBottom: 12 }}>
        Layers
      </div>

      {venue.sections.map((section: Section) => {
        const seatCount = section.rows.reduce((t, r) => t + r.seats.length, 0);
        const isActive = section.id === selectedSectionId;
        const catColor = venue.categories.find((c) => c.id === section.categoryId)?.color ?? "#666";

        return (
          <div
            key={section.id}
            onClick={() => onSelectSection(section.id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 8px",
              borderRadius: 4,
              marginBottom: 2,
              cursor: "pointer",
              background: isActive ? "#3a3a5a" : "transparent",
            }}
          >
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: 2,
                background: catColor,
                flexShrink: 0,
              }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  color: "#e0e0e0",
                  fontSize: 13,
                  fontFamily: "system-ui",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {section.label}
              </div>
              <div style={{ color: "#9e9e9e", fontSize: 11, fontFamily: "system-ui" }}>
                {section.rows.length} rows, {seatCount} seats
              </div>
            </div>
          </div>
        );
      })}

      {venue.sections.length === 0 && (
        <div style={{ color: "#9e9e9e", fontSize: 13, fontFamily: "system-ui" }}>
          No sections yet. Use the Add Section tool.
        </div>
      )}
    </div>
  );
}
