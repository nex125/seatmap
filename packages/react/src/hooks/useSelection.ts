import { useSeatmapContext } from "../context/SeatmapContext";
import { useStore } from "zustand";

export function useSelection() {
  const { store } = useSeatmapContext();

  const selectedSeatIds = useStore(store, (s) => s.selectedSeatIds);
  const toggleSeat = useStore(store, (s) => s.toggleSeat);
  const clearSelection = useStore(store, (s) => s.clearSelection);
  const setSelection = useStore(store, (s) => s.setSelection);

  return { selectedSeatIds, toggleSeat, clearSelection, setSelection };
}
