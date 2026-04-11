import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { Seat, Section, Row } from "@nex125/seatmap-core";
import { seatWorldPosition, AVAILABLE_STATUS_ID } from "@nex125/seatmap-core";
import { useSeatmapContext } from "../context/SeatmapContext";
import { useStore } from "zustand";

export interface TooltipData {
  seat: Seat;
  row: Row;
  section: Section;
  statusName?: string;
  price?: number;
  screenX: number;
  screenY: number;
}

export interface TooltipOverlayProps {
  renderTooltip?: (data: TooltipData) => React.ReactNode;
  style?: CSSProperties;
}

function DefaultTooltip({ data }: { data: TooltipData }) {
  const statusLabel = data.statusName;
  const priceLabel =
    typeof data.price === "number"
      ? `$${data.price.toFixed(2)}`
      : "Price unavailable";
  return (
    <div
      style={{
        background: "var(--seatmap-tooltip-surface, color-mix(in srgb, var(--seatmap-surface-container-low, #181818) 94%, transparent))",
        border: "1px solid var(--seatmap-tooltip-border, var(--seatmap-outline, #353331))",
        borderRadius: 10,
        padding: "8px 14px",
        color: "var(--seatmap-tooltip-text, var(--seatmap-on-surface, #e5e2e1))",
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
      <div style={{ color: "var(--seatmap-tooltip-muted-text, var(--seatmap-on-surface-variant, #9a9694))", fontSize: 12, marginTop: 2 }}>
        {statusLabel ?? (data.seat.status === AVAILABLE_STATUS_ID ? "Available" : data.seat.status)}
      </div>
      <div style={{ color: "var(--seatmap-tooltip-muted-text, var(--seatmap-on-surface-variant, #9a9694))", fontSize: 12, marginTop: 2 }}>
        Price: {priceLabel}
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
          const statusName = venue.seatStatuses.find((status) => status.id === seat.status)?.name;
          const category = venue.categories.find((item) => item.id === seat.categoryId);
          const hasOverridePrice =
            Boolean(category?.isPriceOverridden) &&
            typeof category?.overriddenPrice === "number";
          const hasBackendPrice = typeof category?.backendPrice === "number";
          const price = hasOverridePrice
            ? category?.overriddenPrice
            : hasBackendPrice
              ? category?.backendPrice
              : undefined;
          setTooltipData({
            seat,
            row,
            section,
            statusName,
            price,
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
