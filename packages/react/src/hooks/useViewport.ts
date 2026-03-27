import { useCallback, useSyncExternalStore } from "react";
import { venueAABB } from "@nex22/seatmap-core";
import type { ViewportState } from "@nex22/seatmap-core";
import { useSeatmapContext } from "../context/SeatmapContext";

export function useViewport() {
  const { viewport, store } = useSeatmapContext();

  const state = useSyncExternalStore(
    (cb) => viewport.subscribe(cb),
    (): ViewportState => viewport.getState(),
  );

  const pan = useCallback(
    (dx: number, dy: number) => viewport.pan(dx, dy),
    [viewport],
  );

  const zoomAt = useCallback(
    (x: number, y: number, factor: number) => viewport.zoomAt({ x, y }, factor),
    [viewport],
  );

  const fitToVenue = useCallback(() => {
    const venue = store.getState().venue;
    if (!venue) return;
    viewport.fitBounds(venueAABB(venue));
  }, [viewport, store]);

  return { ...state, pan, zoomAt, fitToVenue, viewport };
}
