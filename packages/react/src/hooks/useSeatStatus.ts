import { useCallback } from "react";
import type { SeatStatus, Venue } from "@ticketok/seatmap-core";
import { useSeatmapContext } from "../context/SeatmapContext";

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
export function useSeatStatus() {
  const { store } = useSeatmapContext();

  const updateSeatStatus = useCallback(
    (seatId: string, status: SeatStatus) => {
      const venue = store.getState().venue;
      if (!venue) return;

      const updated = updateVenueSeatStatus(venue, seatId, status);
      if (updated) {
        store.getState().setVenue(updated);
      }
    },
    [store],
  );

  const updateBulkStatus = useCallback(
    (updates: Array<{ seatId: string; status: SeatStatus }>) => {
      let venue = store.getState().venue;
      if (!venue) return;

      for (const { seatId, status } of updates) {
        const result = updateVenueSeatStatus(venue, seatId, status);
        if (result) venue = result;
      }

      store.getState().setVenue(venue);
    },
    [store],
  );

  return { updateSeatStatus, updateBulkStatus };
}

function updateVenueSeatStatus(
  venue: Venue,
  seatId: string,
  status: SeatStatus,
): Venue | null {
  for (let si = 0; si < venue.sections.length; si++) {
    const section = venue.sections[si];
    for (let ri = 0; ri < section.rows.length; ri++) {
      const row = section.rows[ri];
      const seatIdx = row.seats.findIndex((s) => s.id === seatId);
      if (seatIdx !== -1) {
        const newSeats = [...row.seats];
        newSeats[seatIdx] = { ...newSeats[seatIdx], status };
        const newRows = [...section.rows];
        newRows[ri] = { ...row, seats: newSeats };
        const newSections = [...venue.sections];
        newSections[si] = { ...section, rows: newRows };
        return { ...venue, sections: newSections };
      }
    }
  }
  return null;
}
