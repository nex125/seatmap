import { useEffect, useMemo, useRef, type ReactNode } from "react";
import type { Venue } from "@ticketok/seatmap-core";
import { Viewport, SpatialIndex } from "@ticketok/seatmap-core";
import { SeatmapContext, createSeatmapStore } from "../context/SeatmapContext";

export interface SeatmapProviderProps {
  venue?: Venue;
  children: ReactNode;
}

export function SeatmapProvider({ venue, children }: SeatmapProviderProps) {
  const storeRef = useRef(createSeatmapStore());
  const viewportRef = useRef(new Viewport());
  const spatialIndexRef = useRef(new SpatialIndex());

  useEffect(() => {
    if (venue) {
      storeRef.current.getState().setVenue(venue);
      spatialIndexRef.current.buildFromSections(venue.sections);
    }
  }, [venue]);

  const contextValue = useMemo(
    () => ({
      store: storeRef.current,
      viewport: viewportRef.current,
      spatialIndex: spatialIndexRef.current,
    }),
    [],
  );

  return (
    <SeatmapContext.Provider value={contextValue}>
      {children}
    </SeatmapContext.Provider>
  );
}
