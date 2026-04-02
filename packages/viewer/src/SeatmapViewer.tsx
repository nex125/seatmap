import type { Venue, SeatStatus } from "@nex125/seatmap-core";
import {
  SeatmapProvider,
  SeatmapCanvas,
  TooltipOverlay,
} from "@nex125/seatmap-react";
import type { TooltipData } from "@nex125/seatmap-react";

export interface SeatmapViewerProps {
  venue: Venue;
  onSeatClick?: (seatId: string, sectionId: string) => void;
  onSeatHover?: (seatId: string | null, sectionId: string | null) => void;
  onSelectionChange?: (seatIds: string[]) => void;
  onStatusUpdate?: (seatId: string, status: SeatStatus) => void;
  renderTooltip?: (data: TooltipData) => React.ReactNode;
  className?: string;
}

const legendContainerStyle: React.CSSProperties = {
  position: "absolute",
  top: 12,
  left: 12,
  zIndex: 10,
  pointerEvents: "none",
  background: "rgba(18, 18, 34, 0.88)",
  border: "1px solid rgba(110, 110, 150, 0.45)",
  borderRadius: 8,
  padding: "10px 12px",
  minWidth: 150,
  color: "#e0e0e0",
  fontFamily: "system-ui",
  fontSize: 12,
  backdropFilter: "blur(2px)",
};

const legendHeadingStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: 0.2,
  color: "#b9b9d6",
};

const legendListStyle: React.CSSProperties = {
  listStyle: "none",
  margin: "6px 0 0",
  padding: 0,
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

const legendItemStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  minWidth: 0,
};

const legendSwatchStyle: React.CSSProperties = {
  width: 10,
  height: 10,
  borderRadius: 2,
  flexShrink: 0,
  border: "1px solid rgba(255, 255, 255, 0.25)",
};

export function SeatmapViewer({
  venue,
  onSeatClick,
  onSeatHover,
  renderTooltip,
  className,
}: SeatmapViewerProps) {
  const showStatuses = venue.seatStatuses.length > 0;
  const showCategories = venue.categories.length > 0;

  return (
    <SeatmapProvider venue={venue}>
      <div className={className} style={{ width: "100%", height: "100%", position: "relative" }}>
        <SeatmapCanvas
          onSeatClick={onSeatClick}
          onSeatHover={onSeatHover}
        />
        {(showStatuses || showCategories) && (
          <aside aria-label="Seatmap legend" style={legendContainerStyle}>
            {showStatuses && (
              <section>
                <p style={legendHeadingStyle}>Seat Status</p>
                <ul style={legendListStyle}>
                  {venue.seatStatuses.map((status) => (
                    <li key={status.id} style={legendItemStyle}>
                      <span style={{ ...legendSwatchStyle, background: status.color }} />
                      <span>{status.name}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {showStatuses && showCategories && (
              <div style={{ height: 1, background: "rgba(123, 123, 165, 0.45)", margin: "8px 0" }} />
            )}
            {showCategories && (
              <section>
                <p style={legendHeadingStyle}>Pricing</p>
                <ul style={legendListStyle}>
                  {venue.categories.map((category) => (
                    <li key={category.id} style={legendItemStyle}>
                      <span style={{ ...legendSwatchStyle, background: category.color }} />
                      <span>{category.name}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </aside>
        )}
        <TooltipOverlay renderTooltip={renderTooltip} />
      </div>
    </SeatmapProvider>
  );
}
