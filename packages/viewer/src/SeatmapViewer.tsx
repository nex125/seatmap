import type { Venue, SeatStatus } from "@nex22/seatmap-core";
import {
  SeatmapProvider,
  SeatmapCanvas,
  TooltipOverlay,
} from "@nex22/seatmap-react";
import type { TooltipData } from "@nex22/seatmap-react";

export interface SeatmapViewerProps {
  venue: Venue;
  onSeatClick?: (seatId: string, sectionId: string) => void;
  onSeatHover?: (seatId: string | null, sectionId: string | null) => void;
  onSelectionChange?: (seatIds: string[]) => void;
  onStatusUpdate?: (seatId: string, status: SeatStatus) => void;
  renderTooltip?: (data: TooltipData) => React.ReactNode;
  className?: string;
}

export function SeatmapViewer({
  venue,
  onSeatClick,
  onSeatHover,
  renderTooltip,
  className,
}: SeatmapViewerProps) {
  return (
    <SeatmapProvider venue={venue}>
      <div className={className} style={{ width: "100%", height: "100%", position: "relative" }}>
        <SeatmapCanvas
          onSeatClick={onSeatClick}
          onSeatHover={onSeatHover}
        />
        <TooltipOverlay renderTooltip={renderTooltip} />
      </div>
    </SeatmapProvider>
  );
}
