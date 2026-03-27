import { createContext, useContext } from "react";
import type { Venue } from "@nex22/seatmap-core";
import { Viewport, SpatialIndex } from "@nex22/seatmap-core";
import { create } from "zustand";

export interface SeatmapState {
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

export const createSeatmapStore = () =>
  create<SeatmapState>((set) => ({
    venue: null,
    selectedSeatIds: new Set(),
    hoveredSeatId: null,

    setVenue: (venue) => set({ venue }),

    selectSeat: (seatId) =>
      set((state) => ({
        selectedSeatIds: new Set(state.selectedSeatIds).add(seatId),
      })),

    deselectSeat: (seatId) =>
      set((state) => {
        const next = new Set(state.selectedSeatIds);
        next.delete(seatId);
        return { selectedSeatIds: next };
      }),

    toggleSeat: (seatId) =>
      set((state) => {
        const next = new Set(state.selectedSeatIds);
        if (next.has(seatId)) next.delete(seatId);
        else next.add(seatId);
        return { selectedSeatIds: next };
      }),

    clearSelection: () => set({ selectedSeatIds: new Set() }),

    setSelection: (seatIds) =>
      set({ selectedSeatIds: new Set(seatIds) }),

    setHoveredSeat: (seatId) => set({ hoveredSeatId: seatId }),
  }));

export type SeatmapStore = ReturnType<typeof createSeatmapStore>;

export interface SeatmapContextValue {
  store: SeatmapStore;
  viewport: Viewport;
  spatialIndex: SpatialIndex;
}

export const SeatmapContext = createContext<SeatmapContextValue | null>(null);

export function useSeatmapContext(): SeatmapContextValue {
  const ctx = useContext(SeatmapContext);
  if (!ctx) {
    throw new Error("useSeatmapContext must be used within a SeatmapProvider");
  }
  return ctx;
}
