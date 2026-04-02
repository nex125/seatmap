import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { AVAILABLE_STATUS_ID } from "@nex125/seatmap-core";
import type { PricingCategory, SeatStatus, Venue } from "@nex125/seatmap-core";
import { SeatmapCanvas, SeatmapProvider, TooltipOverlay, useSelection } from "@nex125/seatmap-react";
import type { TooltipData } from "@nex125/seatmap-react";

export interface SeatmapCartSeat {
  seatId: string;
  seatLabel: string;
  rowLabel: string | null;
  sectionId: string | null;
  sectionLabel: string | null;
  categoryId: string;
  categoryName: string;
  unitPrice: number;
}

interface SeatDetails extends SeatmapCartSeat {
  status: SeatStatus;
  x: number;
  y: number;
}

export interface SeatmapCartPayload {
  venueId: string;
  venueName: string;
  seats: SeatmapCartSeat[];
  totalSelectedSeats: number;
  totalCost: number;
}

export interface SeatmapCartEvent {
  type: "cart-proceed-clicked";
  payload: SeatmapCartPayload;
}

export interface SeatmapViewerProps {
  venue: Venue;
  onSeatClick?: (seatId: string, sectionId: string) => void;
  onSeatHover?: (seatId: string | null, sectionId: string | null) => void;
  onSelectionChange?: (seatIds: string[]) => void;
  onStatusUpdate?: (seatId: string, status: SeatStatus) => void;
  renderTooltip?: (data: TooltipData) => ReactNode;
  showLabels?: boolean;
  className?: string;
  onCartEvent?: (event: SeatmapCartEvent) => void;
}

const legendContainerStyle: CSSProperties = {
  position: "absolute",
  top: 12,
  left: 12,
  zIndex: 10,
  pointerEvents: "none",
  background: "rgba(18, 18, 34, 0.88)",
  border: "1px solid rgba(110, 110, 150, 0.45)",
  borderRadius: 8,
  padding: "10px 12px",
  minWidth: 150,
  color: "#e0e0e0",
  fontFamily: "system-ui",
  fontSize: 12,
  backdropFilter: "blur(2px)",
};

const legendHeadingStyle: CSSProperties = {
  margin: 0,
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: 0.2,
  color: "#b9b9d6",
};

const legendListStyle: CSSProperties = {
  listStyle: "none",
  margin: "6px 0 0",
  padding: 0,
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

const legendItemStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  minWidth: 0,
};

const legendSwatchStyle: CSSProperties = {
  width: 10,
  height: 10,
  borderRadius: 2,
  flexShrink: 0,
  border: "1px solid rgba(255, 255, 255, 0.25)",
};

const cartChipStyle: CSSProperties = {
  position: "absolute",
  right: 12,
  bottom: 12,
  zIndex: 20,
  border: "1px solid rgba(110, 110, 150, 0.65)",
  background: "rgba(24, 24, 42, 0.95)",
  color: "#ececff",
  borderRadius: 999,
  padding: "8px 14px",
  fontSize: 12,
  fontWeight: 600,
  fontFamily: "system-ui",
  cursor: "pointer",
  boxShadow: "0 8px 18px rgba(0, 0, 0, 0.35)",
};

const cartPopupStyle: CSSProperties = {
  position: "absolute",
  right: 0,
  bottom: 0,
  zIndex: 30,
  maxHeight: "72vh",
  display: "flex",
  flexDirection: "column",
  background: "rgba(17, 17, 34, 0.98)",
  borderTop: "1px solid rgba(110, 110, 150, 0.65)",
  borderLeft: "1px solid rgba(110, 110, 150, 0.65)",
  borderTopLeftRadius: 12,
  overflow: "hidden",
  boxShadow: "-8px -8px 20px rgba(0, 0, 0, 0.35)",
};

const cartIconButtonStyle: CSSProperties = {
  width: 24,
  height: 24,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 5,
  border: "1px solid #4a4a6a",
  background: "#262648",
  color: "#ececff",
  fontSize: 14,
  cursor: "pointer",
};

function getEffectiveCategoryPrice(category: PricingCategory | undefined): number {
  if (!category) return 0;
  if (category.isPriceOverridden && Number.isFinite(category.overriddenPrice)) {
    return category.overriddenPrice ?? 0;
  }
  return Number.isFinite(category.backendPrice) ? (category.backendPrice as number) : 0;
}

function formatMoney(value: number): string {
  return `$${value.toFixed(2)}`;
}

function TrashIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M9 3h6l1 2h4v2H4V5h4l1-2Zm1 7h2v8h-2v-8Zm4 0h2v8h-2v-8ZM7 10h2v8H7v-8Zm-1 12h12a2 2 0 0 0 2-2V8H4v12a2 2 0 0 0 2 2Z"
        fill="currentColor"
      />
    </svg>
  );
}

function ViewerContent({
  venue,
  onSeatClick,
  onSeatHover,
  onSelectionChange,
  renderTooltip,
  showLabels,
  onCartEvent,
}: Omit<SeatmapViewerProps, "className"> & { showLabels: boolean }) {
  const { selectedSeatIds, setSelection } = useSelection();
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [lastUserAnchorByCategory, setLastUserAnchorByCategory] = useState<Record<string, string>>({});
  const [viewportWidth, setViewportWidth] = useState<number>(() =>
    typeof window === "undefined" ? 1280 : window.innerWidth,
  );
  const previousSelectedRef = useRef<string[]>([]);
  const pendingSeatClickRef = useRef<string | null>(null);

  const showStatuses = venue.seatStatuses.length > 0;
  const showCategories = venue.categories.length > 0;
  const selectedSeatIdArray = useMemo(() => Array.from(selectedSeatIds), [selectedSeatIds]);

  const seatDetailsById = useMemo(() => {
    const categoryMap = new Map(venue.categories.map((category) => [category.id, category]));
    const next = new Map<string, SeatDetails>();

    for (const section of venue.sections) {
      const cos = Math.cos(section.rotation);
      const sin = Math.sin(section.rotation);
      for (const row of section.rows) {
        for (const seat of row.seats) {
          const category = categoryMap.get(seat.categoryId);
          next.set(seat.id, {
            seatId: seat.id,
            seatLabel: seat.label,
            rowLabel: row.label,
            sectionId: section.id,
            sectionLabel: section.label,
            categoryId: seat.categoryId,
            categoryName: category?.name ?? "Unknown",
            unitPrice: getEffectiveCategoryPrice(category),
            status: seat.status,
            x: section.position.x + seat.position.x * cos - seat.position.y * sin,
            y: section.position.y + seat.position.x * sin + seat.position.y * cos,
          });
        }
      }
    }

    for (const table of venue.tables) {
      for (const seat of table.seats) {
        const category = categoryMap.get(seat.categoryId);
        next.set(seat.id, {
          seatId: seat.id,
          seatLabel: seat.label,
          rowLabel: null,
          sectionId: table.id,
          sectionLabel: `Table ${table.label}`,
          categoryId: seat.categoryId,
          categoryName: category?.name ?? "Unknown",
          unitPrice: getEffectiveCategoryPrice(category),
          status: seat.status,
          x: table.position.x + seat.position.x,
          y: table.position.y + seat.position.y,
        });
      }
    }
    return next;
  }, [venue]);

  const selectedSeats = useMemo(() => {
    const ordered: SeatDetails[] = [];
    for (const selectedSeatId of selectedSeatIdArray) {
      const seat = seatDetailsById.get(selectedSeatId);
      if (seat) ordered.push(seat);
    }
    return ordered;
  }, [seatDetailsById, selectedSeatIdArray]);

  useEffect(() => {
    onSelectionChange?.(selectedSeatIdArray);
  }, [onSelectionChange, selectedSeatIdArray]);

  useEffect(() => {
    const previous = new Set(previousSelectedRef.current);
    const added = selectedSeatIdArray.filter((seatId) => !previous.has(seatId));
    const clickedSeatId = pendingSeatClickRef.current;
    if (clickedSeatId && added.includes(clickedSeatId)) {
      const clickedSeat = seatDetailsById.get(clickedSeatId);
      if (clickedSeat) {
        setLastUserAnchorByCategory((current) => ({
          ...current,
          [clickedSeat.categoryId]: clickedSeatId,
        }));
      }
    }
    previousSelectedRef.current = selectedSeatIdArray;
    pendingSeatClickRef.current = null;
  }, [seatDetailsById, selectedSeatIdArray]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const cartSeats = useMemo<SeatmapCartSeat[]>(
    () =>
      selectedSeats.map((seat) => ({
        seatId: seat.seatId,
        seatLabel: seat.seatLabel,
        rowLabel: seat.rowLabel,
        sectionId: seat.sectionId,
        sectionLabel: seat.sectionLabel,
        categoryId: seat.categoryId,
        categoryName: seat.categoryName,
        unitPrice: seat.unitPrice,
      })),
    [selectedSeats],
  );

  const totalSelectedSeats = useMemo(() => cartSeats.length, [cartSeats]);
  const totalCost = useMemo(() => cartSeats.reduce((sum, seat) => sum + seat.unitPrice, 0), [cartSeats]);

  const groupedSeatsList = useMemo(() => {
    const grouped = new Map<string, { categoryName: string; unitPrice: number; seats: SeatmapCartSeat[] }>();
    for (const seat of cartSeats) {
      const existing = grouped.get(seat.categoryId);
      if (existing) {
        existing.seats.push(seat);
      } else {
        grouped.set(seat.categoryId, {
          categoryName: seat.categoryName,
          unitPrice: seat.unitPrice,
          seats: [seat],
        });
      }
    }

    const ordered: Array<{
      categoryId: string;
      categoryName: string;
      unitPrice: number;
      seats: SeatmapCartSeat[];
      availableToAdd: number;
    }> = [];
    const selectedSet = new Set(selectedSeatIdArray);

    const availableToAddByCategory = new Map<string, number>();
    for (const seat of seatDetailsById.values()) {
      if (seat.status !== AVAILABLE_STATUS_ID || selectedSet.has(seat.seatId)) continue;
      availableToAddByCategory.set(
        seat.categoryId,
        (availableToAddByCategory.get(seat.categoryId) ?? 0) + 1,
      );
    }

    for (const category of venue.categories) {
      const group = grouped.get(category.id);
      if (!group) continue;
      ordered.push({
        categoryId: category.id,
        categoryName: group.categoryName,
        unitPrice: group.unitPrice,
        seats: group.seats,
        availableToAdd: availableToAddByCategory.get(category.id) ?? 0,
      });
    }

    for (const [categoryId, group] of grouped.entries()) {
      if (venue.categories.some((category) => category.id === categoryId)) continue;
      ordered.push({
        categoryId,
        categoryName: group.categoryName,
        unitPrice: group.unitPrice,
        seats: group.seats,
        availableToAdd: availableToAddByCategory.get(categoryId) ?? 0,
      });
    }
    return ordered;
  }, [cartSeats, seatDetailsById, selectedSeatIdArray, venue.categories]);

  const cartPayload = useMemo<SeatmapCartPayload>(
    () => ({
      venueId: venue.id,
      venueName: venue.name,
      seats: cartSeats,
      totalSelectedSeats,
      totalCost,
    }),
    [venue.id, venue.name, cartSeats, totalSelectedSeats, totalCost],
  );

  const emitCartEvent = useCallback(
    (event: SeatmapCartEvent) => {
      onCartEvent?.(event);
    },
    [onCartEvent],
  );

  const removeSeatFromSelection = useCallback(
    (seatId: string) => {
      const next = selectedSeatIdArray.filter((id) => id !== seatId);
      setSelection(next);
    },
    [selectedSeatIdArray, setSelection],
  );

  const handleSeatCanvasClick = useCallback(
    (seatId: string, sectionId: string) => {
      pendingSeatClickRef.current = seatId;
      onSeatClick?.(seatId, sectionId);
    },
    [onSeatClick],
  );

  const handleAddSeatInCategory = useCallback(
    (categoryId: string) => {
      const selectedSet = new Set(selectedSeatIdArray);
      const selectedInCategory = selectedSeatIdArray.filter(
        (selectedSeatId) => seatDetailsById.get(selectedSeatId)?.categoryId === categoryId,
      );
      const anchorSeatId =
        (lastUserAnchorByCategory[categoryId] && seatDetailsById.has(lastUserAnchorByCategory[categoryId])
          ? lastUserAnchorByCategory[categoryId]
          : null) ?? selectedInCategory[selectedInCategory.length - 1] ?? null;
      const anchorSeat = anchorSeatId ? seatDetailsById.get(anchorSeatId) : null;

      const candidates = Array.from(seatDetailsById.values()).filter(
        (seat) =>
          seat.categoryId === categoryId &&
          seat.status === AVAILABLE_STATUS_ID &&
          !selectedSet.has(seat.seatId),
      );
      if (candidates.length === 0) return;

      let nextSeat = candidates[0];
      if (anchorSeat) {
        nextSeat = candidates.reduce((best, candidate) => {
          const bestDistance = (best.x - anchorSeat.x) ** 2 + (best.y - anchorSeat.y) ** 2;
          const candidateDistance = (candidate.x - anchorSeat.x) ** 2 + (candidate.y - anchorSeat.y) ** 2;
          return candidateDistance < bestDistance ? candidate : best;
        }, candidates[0]);
      }
      setSelection([...selectedSeatIdArray, nextSeat.seatId]);
    },
    [lastUserAnchorByCategory, seatDetailsById, selectedSeatIdArray, setSelection],
  );

  const handleRemoveLastInCategory = useCallback(
    (categoryId: string) => {
      const selectedInCategory = selectedSeatIdArray.filter(
        (selectedSeatId) => seatDetailsById.get(selectedSeatId)?.categoryId === categoryId,
      );
      const seatIdToRemove = selectedInCategory[selectedInCategory.length - 1];
      if (!seatIdToRemove) return;
      setSelection(selectedSeatIdArray.filter((selectedSeatId) => selectedSeatId !== seatIdToRemove));
    },
    [seatDetailsById, selectedSeatIdArray, setSelection],
  );

  const handleProceed = useCallback(() => {
    if (cartPayload.seats.length === 0) return;
    emitCartEvent({ type: "cart-proceed-clicked", payload: cartPayload });
  }, [cartPayload, emitCartEvent]);

  const cartWidth = viewportWidth > 1200 ? Math.floor(viewportWidth / 5) : viewportWidth;

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <SeatmapCanvas
        onSeatClick={handleSeatCanvasClick}
        onSeatHover={onSeatHover}
        showSectionLabels={showLabels}
        enableSeatHover={showLabels}
      />
      {(showStatuses || showCategories) && (
        <aside aria-label="Seatmap legend" style={legendContainerStyle}>
          {showStatuses && (
            <section>
              <p style={legendHeadingStyle}>Seat Status</p>
              <ul style={legendListStyle}>
                {venue.seatStatuses.map((status) => (
                  <li key={status.id} style={legendItemStyle}>
                    <span style={{ ...legendSwatchStyle, background: status.color }} />
                    <span>{status.name}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {showStatuses && showCategories && (
            <div style={{ height: 1, background: "rgba(123, 123, 165, 0.45)", margin: "8px 0" }} />
          )}
          {showCategories && (
            <section>
              <p style={legendHeadingStyle}>Pricing</p>
              <ul style={legendListStyle}>
                {venue.categories.map((category) => (
                  <li key={category.id} style={legendItemStyle}>
                    <span style={{ ...legendSwatchStyle, background: category.color }} />
                    <span>{category.name}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      )}

      {!isCartOpen && (
        <button type="button" onClick={() => setIsCartOpen(true)} style={cartChipStyle}>
          Cart ({totalSelectedSeats})
        </button>
      )}

      {isCartOpen && (
        <aside aria-label="Selected seats cart" style={{ ...cartPopupStyle, width: cartWidth, maxWidth: "100%" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              padding: "10px 12px",
              borderBottom: "1px solid rgba(110, 110, 150, 0.35)",
            }}
          >
            <strong style={{ color: "#ececff", fontSize: 13, fontFamily: "system-ui" }}>Selected Seats Cart</strong>
            <button
              type="button"
              onClick={() => setIsCartOpen(false)}
              style={{ ...cartIconButtonStyle, width: 22, height: 22 }}
              title="Close cart"
              aria-label="Close cart"
            >
              x
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8, overflow: "auto", padding: 12, flex: 1 }}>
            {groupedSeatsList.length === 0 ? (
              <div style={{ color: "#9e9eb8", fontSize: 12, fontFamily: "system-ui" }}>
                No seats selected yet.
              </div>
            ) : (
              groupedSeatsList.map((group) => (
                <article
                  key={group.categoryId}
                  style={{
                    background: "#242447",
                    border: "1px solid #3b3b61",
                    borderRadius: 8,
                    padding: 8,
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}
                >
                  <div style={{ color: "#ececff", fontSize: 12, fontFamily: "system-ui", fontWeight: 600 }}>
                    {group.categoryName}
                  </div>
                  <div style={{ color: "#adb0d2", fontSize: 11, fontFamily: "system-ui" }}>
                    {group.seats.length} ticket{group.seats.length === 1 ? "" : "s"} - {formatMoney(group.unitPrice)} each
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <button
                        type="button"
                        style={cartIconButtonStyle}
                        onClick={() => handleRemoveLastInCategory(group.categoryId)}
                        disabled={group.seats.length === 0}
                        aria-label={`Remove one ${group.categoryName} seat`}
                      >
                        -
                      </button>
                      <span style={{ minWidth: 20, textAlign: "center", color: "#ececff", fontSize: 12 }}>
                        {group.seats.length}
                      </span>
                      <button
                        type="button"
                        style={cartIconButtonStyle}
                        onClick={() => handleAddSeatInCategory(group.categoryId)}
                        disabled={group.availableToAdd === 0}
                        aria-label={`Add one ${group.categoryName} seat`}
                      >
                        +
                      </button>
                    </div>
                    <span style={{ color: "#ececff", fontSize: 12, fontFamily: "system-ui", fontWeight: 600 }}>
                      {formatMoney(group.seats.reduce((sum, seat) => sum + seat.unitPrice, 0))}
                    </span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {group.seats.map((seat) => (
                      <div
                        key={seat.seatId}
                        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}
                      >
                        <span style={{ color: "#c8c8df", fontSize: 11, fontFamily: "system-ui" }}>
                          {seat.sectionLabel ?? "Section"} {seat.rowLabel ? `- ${seat.rowLabel}${seat.seatLabel}` : `- ${seat.seatLabel}`}
                        </span>
                        <button
                          type="button"
                          style={cartIconButtonStyle}
                          onClick={() => removeSeatFromSelection(seat.seatId)}
                          title="Remove seat"
                          aria-label={`Remove seat ${seat.seatLabel}`}
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    ))}
                  </div>
                </article>
              ))
            )}
          </div>

          <div
            style={{
              borderTop: "1px solid rgba(110, 110, 150, 0.35)",
              padding: 12,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div style={{ color: "#d4d4ee", fontSize: 12, fontFamily: "system-ui" }}>
              {totalSelectedSeats} seat{totalSelectedSeats === 1 ? "" : "s"} - Total {formatMoney(totalCost)}
            </div>
            <button
              type="button"
              disabled={cartSeats.length === 0}
              onClick={handleProceed}
              style={{
                border: "1px solid #2f7b44",
                background: cartSeats.length === 0 ? "#30543d" : "#2f7b44",
                color: "#ecfff2",
                borderRadius: 8,
                padding: "8px 12px",
                fontSize: 13,
                fontWeight: 600,
                fontFamily: "system-ui",
                cursor: cartSeats.length === 0 ? "not-allowed" : "pointer",
              }}
            >
              Proceed
            </button>
          </div>
        </aside>
      )}

      {showLabels && <TooltipOverlay renderTooltip={renderTooltip} />}
    </div>
  );
}

export function SeatmapViewer({
  venue,
  onSeatClick,
  onSeatHover,
  onSelectionChange,
  renderTooltip,
  showLabels = true,
  className,
  onCartEvent,
}: SeatmapViewerProps) {
  return (
    <SeatmapProvider venue={venue}>
      <div className={className} style={{ width: "100%", height: "100%", position: "relative" }}>
        <ViewerContent
          venue={venue}
          onSeatClick={onSeatClick}
          onSeatHover={onSeatHover}
          onSelectionChange={onSelectionChange}
          renderTooltip={renderTooltip}
          showLabels={showLabels}
          onCartEvent={onCartEvent}
        />
      </div>
    </SeatmapProvider>
  );
}
