import * as react_jsx_runtime from 'react/jsx-runtime';
import * as react from 'react';
import { ReactNode, CSSProperties } from 'react';
import * as _ticketok_seatmap_core from '@ticketok/seatmap-core';
import { Venue, Seat, Row, Section, SeatStatus, Viewport, SpatialIndex } from '@ticketok/seatmap-core';
import * as zustand from 'zustand';

interface SeatmapProviderProps {
    venue?: Venue;
    children: ReactNode;
}
declare function SeatmapProvider({ venue, children }: SeatmapProviderProps): react_jsx_runtime.JSX.Element;

interface SeatmapCanvasProps {
    width?: number;
    height?: number;
    className?: string;
    /** When true, left-click drag pans the map (viewer mode). Default: true. */
    panOnLeftClick?: boolean;
    onSeatClick?: (seatId: string, sectionId: string) => void;
    onSeatHover?: (seatId: string | null, sectionId: string | null) => void;
}
declare function SeatmapCanvas({ width: propWidth, height: propHeight, className, panOnLeftClick, onSeatClick, onSeatHover, }: SeatmapCanvasProps): react_jsx_runtime.JSX.Element;

interface TooltipData {
    seat: Seat;
    row: Row;
    section: Section;
    screenX: number;
    screenY: number;
}
interface TooltipOverlayProps {
    renderTooltip?: (data: TooltipData) => React.ReactNode;
    style?: CSSProperties;
}
declare function TooltipOverlay({ renderTooltip, style }: TooltipOverlayProps): react_jsx_runtime.JSX.Element | null;

interface MinimapProps {
    width?: number;
    height?: number;
    style?: CSSProperties;
}
declare function Minimap({ width, height, style }: MinimapProps): react_jsx_runtime.JSX.Element | null;

declare function useViewport(): {
    pan: (dx: number, dy: number) => void;
    zoomAt: (x: number, y: number, factor: number) => void;
    fitToVenue: () => void;
    viewport: _ticketok_seatmap_core.Viewport;
    x: number;
    y: number;
    zoom: number;
};

declare function useSelection(): {
    selectedSeatIds: Set<string>;
    toggleSeat: (seatId: string) => void;
    clearSelection: () => void;
    setSelection: (seatIds: string[]) => void;
};

declare function useSeatmap(): {
    venue: _ticketok_seatmap_core.Venue | null;
    setVenue: (venue: _ticketok_seatmap_core.Venue) => void;
    hoveredSeatId: string | null;
    setHoveredSeat: (seatId: string | null) => void;
    viewport: _ticketok_seatmap_core.Viewport;
    spatialIndex: _ticketok_seatmap_core.SpatialIndex;
};

/**
 * Hook that exposes a callback for updating individual seat statuses.
 * Connect this to your SSE service or any real-time data source.
 *
 * Usage:
 * ```ts
 * const { updateSeatStatus, updateBulkStatus } = useSeatStatus();
 *
 * // In your SSE handler:
 * eventSource.onmessage = (e) => {
 *   const { seatId, status } = JSON.parse(e.data);
 *   updateSeatStatus(seatId, status);
 * };
 * ```
 */
declare function useSeatStatus(): {
    updateSeatStatus: (seatId: string, status: SeatStatus) => void;
    updateBulkStatus: (updates: Array<{
        seatId: string;
        status: SeatStatus;
    }>) => void;
};

interface SeatmapState {
    venue: Venue | null;
    selectedSeatIds: Set<string>;
    hoveredSeatId: string | null;
    setVenue: (venue: Venue) => void;
    selectSeat: (seatId: string) => void;
    deselectSeat: (seatId: string) => void;
    toggleSeat: (seatId: string) => void;
    clearSelection: () => void;
    setSelection: (seatIds: string[]) => void;
    setHoveredSeat: (seatId: string | null) => void;
}
declare const createSeatmapStore: () => zustand.UseBoundStore<zustand.StoreApi<SeatmapState>>;
type SeatmapStore = ReturnType<typeof createSeatmapStore>;
interface SeatmapContextValue {
    store: SeatmapStore;
    viewport: Viewport;
    spatialIndex: SpatialIndex;
}
declare const SeatmapContext: react.Context<SeatmapContextValue | null>;
declare function useSeatmapContext(): SeatmapContextValue;

export { Minimap, type MinimapProps, SeatmapCanvas, type SeatmapCanvasProps, SeatmapContext, type SeatmapContextValue, SeatmapProvider, type SeatmapProviderProps, type SeatmapState, type SeatmapStore, type TooltipData, TooltipOverlay, type TooltipOverlayProps, createSeatmapStore, useSeatStatus, useSeatmap, useSeatmapContext, useSelection, useViewport };
