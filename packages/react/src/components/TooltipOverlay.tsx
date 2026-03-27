import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { Seat, Section, Row } from "@ticketok/seatmap-core";
import { seatWorldPosition } from "@ticketok/seatmap-core";
import { useSeatmapContext } from "../context/SeatmapContext";
import { useStore } from "zustand";

export interface TooltipData {
  seat: Seat;
  row: Row;
  section: Section;
  screenX: number;
  screenY: number;
}

export interface TooltipOverlayProps {
  renderTooltip?: (data: TooltipData) => React.ReactNode;
  style?: CSSProperties;
}

function DefaultTooltip({ data }: { data: TooltipData }) {
  return (
    <div
      style={{
        background: "rgba(26, 26, 46, 0.95)",
        border: "1px solid #2a2a4a",
        borderRadius: 8,
        padding: "8px 14px",
        color: "#e0e0e0",
        fontSize: 13,
        fontFamily: "system-ui",
        pointerEvents: "none",
        whiteSpace: "nowrap",
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 2 }}>
        {data.section.label}
      </div>
      <div>
        Row {data.row.label}, Seat {data.seat.label}
      </div>
      <div style={{ color: "#9e9e9e", fontSize: 12, marginTop: 2 }}>
        {data.seat.status === "available" ? "Available" : data.seat.status}
      </div>
    </div>
  );
}

export function TooltipOverlay({ renderTooltip, style }: TooltipOverlayProps) {
  const { store, viewport } = useSeatmapContext();
  const hoveredSeatId = useStore(store, (s) => s.hoveredSeatId);
  const venue = useStore(store, (s) => s.venue);
  const [tooltipData, setTooltipData] = useState<TooltipData | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hoveredSeatId || !venue) {
      setTooltipData(null);
      return;
    }

    for (const section of venue.sections) {
      for (const row of section.rows) {
        const seat = row.seats.find((s) => s.id === hoveredSeatId);
        if (seat) {
          const worldPos = seatWorldPosition(section, seat);
          const screenPos = viewport.worldToScreen(worldPos.x, worldPos.y);
          setTooltipData({
            seat,
            row,
            section,
            screenX: screenPos.x,
            screenY: screenPos.y,
          });
          return;
        }
      }
    }

    setTooltipData(null);
  }, [hoveredSeatId, venue, viewport]);

  useEffect(() => {
    if (!tooltipData) return;
    const unsub = viewport.subscribe(() => {
      if (!store.getState().hoveredSeatId) return;
      const section = venue?.sections.find((s) => s.id === tooltipData.section.id);
      if (!section) return;
      const worldPos = seatWorldPosition(section, tooltipData.seat);
      const screenPos = viewport.worldToScreen(worldPos.x, worldPos.y);
      setTooltipData((prev) =>
        prev ? { ...prev, screenX: screenPos.x, screenY: screenPos.y } : null,
      );
    });
    return unsub;
  }, [tooltipData?.seat.id, venue, viewport, store]);

  if (!tooltipData) return null;

  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute",
        left: tooltipData.screenX + 12,
        top: tooltipData.screenY - 10,
        zIndex: 10,
        pointerEvents: "none",
        transform: "translateY(-100%)",
        ...style,
      }}
    >
      {renderTooltip ? (
        renderTooltip(tooltipData)
      ) : (
        <DefaultTooltip data={tooltipData} />
      )}
    </div>
  );
}
