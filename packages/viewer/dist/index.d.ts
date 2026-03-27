import * as react_jsx_runtime from 'react/jsx-runtime';
import { Venue, SeatStatus } from '@ticketok/seatmap-core';
import { TooltipData } from '@ticketok/seatmap-react';
export { useSeatStatus } from '@ticketok/seatmap-react';

interface SeatmapViewerProps {
    venue: Venue;
    onSeatClick?: (seatId: string, sectionId: string) => void;
    onSeatHover?: (seatId: string | null, sectionId: string | null) => void;
    onSelectionChange?: (seatIds: string[]) => void;
    onStatusUpdate?: (seatId: string, status: SeatStatus) => void;
    renderTooltip?: (data: TooltipData) => React.ReactNode;
    className?: string;
}
declare function SeatmapViewer({ venue, onSeatClick, onSeatHover, renderTooltip, className, }: SeatmapViewerProps): react_jsx_runtime.JSX.Element;

export { SeatmapViewer, type SeatmapViewerProps };
