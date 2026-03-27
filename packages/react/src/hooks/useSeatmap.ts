import { useSeatmapContext } from "../context/SeatmapContext";
import { useStore } from "zustand";

export function useSeatmap() {
  const { store, viewport, spatialIndex } = useSeatmapContext();

  const venue = useStore(store, (s) => s.venue);
  const setVenue = useStore(store, (s) => s.setVenue);
  const hoveredSeatId = useStore(store, (s) => s.hoveredSeatId);
  const setHoveredSeat = useStore(store, (s) => s.setHoveredSeat);

  return { venue, setVenue, hoveredSeatId, setHoveredSeat, viewport, spatialIndex };
}
