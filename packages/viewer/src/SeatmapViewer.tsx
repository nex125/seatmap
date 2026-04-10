import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { AVAILABLE_STATUS_ID } from "@nex125/seatmap-core";
import type { PricingCategory, SeatStatus, Venue } from "@nex125/seatmap-core";
import { SeatmapCanvas, SeatmapProvider, TooltipOverlay, useSelection } from "@nex125/seatmap-react";
import type { TooltipData } from "@nex125/seatmap-react";
import type { SeatmapViewerClassNames, SeatmapViewerStyles } from "./styleContract";

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
  locale?: string;
  currency?: string;
  styles?: SeatmapViewerStyles;
  classNames?: SeatmapViewerClassNames;
}

const legendContainerStyle: CSSProperties = {
  position: "absolute",
  top: 12,
  left: 12,
  zIndex: 10,
  pointerEvents: "none",
  background: "var(--seatmap-viewer-surface, rgba(24, 24, 24, 0.9))",
  border: "1px solid var(--seatmap-viewer-border, rgba(92, 89, 87, 0.6))",
  borderRadius: 10,
  padding: "10px 12px",
  minWidth: 150,
  color: "var(--seatmap-viewer-text, #e5e2e1)",
  fontFamily: "var(--ds-font-body, system-ui)",
  fontSize: 12,
  backdropFilter: "blur(8px)",
};

const legendHeadingStyle: CSSProperties = {
  margin: 0,
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: 0.2,
  color: "var(--seatmap-viewer-text-muted, #9a9694)",
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
  borderRadius: 3,
  flexShrink: 0,
  border: "1px solid var(--seatmap-viewer-border-subtle, rgba(255, 255, 255, 0.25))",
};

const cartChipStyle: CSSProperties = {
  position: "absolute",
  right: 12,
  bottom: 12,
  zIndex: 20,
  border: "1px solid var(--seatmap-viewer-border, rgba(92, 89, 87, 0.65))",
  background: "var(--seatmap-viewer-surface-elevated, rgba(30, 30, 30, 0.95))",
  color: "var(--seatmap-viewer-text, #e5e2e1)",
  borderRadius: 999,
  padding: "8px 14px",
  fontSize: 12,
  fontWeight: 600,
  fontFamily: "var(--ds-font-body, system-ui)",
  cursor: "pointer",
  boxShadow: "var(--seatmap-viewer-shadow-elevated, 0 10px 24px rgba(0, 0, 0, 0.28))",
};

const cartPopupStyle: CSSProperties = {
  position: "absolute",
  right: 0,
  bottom: 0,
  zIndex: 30,
  maxHeight: "72vh",
  display: "flex",
  flexDirection: "column",
  background: "var(--seatmap-viewer-surface-elevated, rgba(24, 24, 24, 0.98))",
  borderTop: "1px solid var(--seatmap-viewer-border, rgba(92, 89, 87, 0.65))",
  borderLeft: "1px solid var(--seatmap-viewer-border, rgba(92, 89, 87, 0.65))",
  borderTopLeftRadius: 12,
  overflow: "hidden",
  boxShadow: "var(--seatmap-viewer-shadow-elevated, -12px -12px 24px rgba(0, 0, 0, 0.28))",
};

const cartIconButtonStyle: CSSProperties = {
  width: 24,
  height: 24,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 5,
  border: "1px solid var(--seatmap-viewer-border, #4a4643)",
  background: "var(--seatmap-viewer-surface-muted, #2b2b2b)",
  color: "var(--seatmap-viewer-text, #e5e2e1)",
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

function formatMoney(value: number, locale: string, currency: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  }).format(value);
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

function mergeStyles(base: CSSProperties, override?: CSSProperties): CSSProperties {
  if (!override) return base;
  return { ...base, ...override };
}

function mergeClassNames(...classNames: Array<string | undefined>): string | undefined {
  const merged = classNames.filter(Boolean).join(" ").trim();
  return merged.length > 0 ? merged : undefined;
}

export type SeatmapViewerContentProps = Omit<SeatmapViewerProps, "className"> & { showLabels: boolean };

export function SeatmapViewerContent({
  venue,
  onSeatClick,
  onSeatHover,
  onSelectionChange,
  renderTooltip,
  showLabels,
  onCartEvent,
  locale = "ru-RU",
  currency = "BYN",
  styles = {},
  classNames = {},
}: SeatmapViewerContentProps) {
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
  const isMobile = viewportWidth < 768;

  const legendStyle = useMemo<CSSProperties>(
    () => ({
      ...legendContainerStyle,
      top: isMobile ? 8 : 12,
      left: isMobile ? 8 : 12,
      minWidth: isMobile ? 120 : 150,
      padding: isMobile ? "8px 9px" : "10px 12px",
      borderRadius: isMobile ? 8 : 10,
      fontSize: isMobile ? 11 : 12,
      ...(styles.legendContainer ?? {}),
    }),
    [isMobile, styles.legendContainer],
  );

  const legendHeadingResponsiveStyle = useMemo<CSSProperties>(
    () => ({
      ...legendHeadingStyle,
      marginBottom: isMobile ? 3 : 0,
      fontSize: isMobile ? 10 : 11,
      ...(styles.legendHeading ?? {}),
    }),
    [isMobile, styles.legendHeading],
  );

  const legendListResponsiveStyle = useMemo<CSSProperties>(
    () => ({
      ...legendListStyle,
      margin: isMobile ? "4px 0 0" : "6px 0 0",
      gap: isMobile ? 3 : 4,
      ...(styles.legendList ?? {}),
    }),
    [isMobile, styles.legendList],
  );

  const legendSwatchResponsiveStyle = useMemo<CSSProperties>(
    () => ({
      ...legendSwatchStyle,
      width: isMobile ? 8 : 10,
      height: isMobile ? 8 : 10,
      borderRadius: isMobile ? 2 : 3,
      ...(styles.legendSwatch ?? {}),
    }),
    [isMobile, styles.legendSwatch],
  );

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
            categoryName: category?.name ?? "Без категории",
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
            sectionLabel: `Стол ${table.label}`,
          categoryId: seat.categoryId,
          categoryName: category?.name ?? "Без категории",
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
      const seat = seatDetailsById.get(seatId);
      if (seat?.sectionId) {
        onSeatClick?.(seatId, seat.sectionId);
      }
      const next = selectedSeatIdArray.filter((id) => id !== seatId);
      setSelection(next);
    },
    [seatDetailsById, onSeatClick, selectedSeatIdArray, setSelection],
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
      if (nextSeat.sectionId) {
        onSeatClick?.(nextSeat.seatId, nextSeat.sectionId);
      }
    },
    [lastUserAnchorByCategory, seatDetailsById, selectedSeatIdArray, setSelection, onSeatClick],
  );

  const handleRemoveLastInCategory = useCallback(
    (categoryId: string) => {
      const selectedInCategory = selectedSeatIdArray.filter(
        (selectedSeatId) => seatDetailsById.get(selectedSeatId)?.categoryId === categoryId,
      );
      const seatIdToRemove = selectedInCategory[selectedInCategory.length - 1];
      if (!seatIdToRemove) return;
      const seat = seatDetailsById.get(seatIdToRemove);
      if (seat?.sectionId) {
        onSeatClick?.(seatIdToRemove, seat.sectionId);
      }
      setSelection(selectedSeatIdArray.filter((selectedSeatId) => selectedSeatId !== seatIdToRemove));
    },
    [seatDetailsById, selectedSeatIdArray, setSelection, onSeatClick],
  );

  const handleProceed = useCallback(() => {
    if (cartPayload.seats.length === 0) return;
    emitCartEvent({ type: "cart-proceed-clicked", payload: cartPayload });
  }, [cartPayload, emitCartEvent]);

  const cartWidth = viewportWidth > 1200 ? Math.floor(viewportWidth / 5) : viewportWidth;

  return (
    <div
      className={classNames.root}
      style={mergeStyles({ width: "100%", height: "100%", position: "relative" }, styles.root)}
    >
      <SeatmapCanvas
        onSeatClick={handleSeatCanvasClick}
        onSeatHover={onSeatHover}
        showSectionLabels={showLabels}
        enableSeatHover={showLabels}
      />
      {(showStatuses || showCategories) && (
        <aside aria-label="Легенда схемы зала" className={classNames.legendContainer} style={legendStyle}>
          {showStatuses && (
            <section>
              <p className={classNames.legendHeading} style={legendHeadingResponsiveStyle}>Статус мест</p>
              <ul className={classNames.legendList} style={legendListResponsiveStyle}>
                {venue.seatStatuses.map((status) => (
                  <li key={status.id} className={classNames.legendItem} style={mergeStyles(legendItemStyle, styles.legendItem)}>
                    <span
                      className={classNames.legendSwatch}
                      style={{ ...legendSwatchResponsiveStyle, background: status.color }}
                    />
                    <span>{status.name}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {showStatuses && showCategories && (
            <div
              className={classNames.legendDivider}
              style={mergeStyles(
                {
                  height: 1,
                  background: "var(--seatmap-viewer-border-subtle, rgba(92, 89, 87, 0.55))",
                  margin: isMobile ? "6px 0" : "8px 0",
                },
                styles.legendDivider,
              )}
            />
          )}
          {showCategories && (
            <section>
              <p className={classNames.legendHeading} style={legendHeadingResponsiveStyle}>Цены</p>
              <ul className={classNames.legendList} style={legendListResponsiveStyle}>
                {venue.categories.map((category) => (
                  <li key={category.id} className={classNames.legendItem} style={mergeStyles(legendItemStyle, styles.legendItem)}>
                    <span
                      className={classNames.legendSwatch}
                      style={{ ...legendSwatchResponsiveStyle, background: category.color }}
                    />
                    <span>{category.name}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      )}

      {!isCartOpen && (
        <button
          type="button"
          className={classNames.cartChip}
          onClick={() => setIsCartOpen(true)}
          style={mergeStyles(cartChipStyle, styles.cartChip)}
        >
          Корзина ({totalSelectedSeats})
        </button>
      )}

      {isCartOpen && (
        <aside
          aria-label="Корзина выбранных мест"
          className={classNames.cartPopup}
          style={mergeStyles({ ...cartPopupStyle, width: cartWidth, maxWidth: "100%" }, styles.cartPopup)}
        >
          <div
            className={classNames.cartHeader}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              padding: "10px 12px",
              borderBottom: "1px solid var(--seatmap-viewer-border-subtle, rgba(92, 89, 87, 0.45))",
              ...(styles.cartHeader ?? {}),
            }}
          >
            <strong
              className={classNames.cartHeaderTitle}
              style={mergeStyles(
                { color: "var(--seatmap-viewer-text, #e5e2e1)", fontSize: 13, fontFamily: "var(--ds-font-body, system-ui)" },
                styles.cartHeaderTitle,
              )}
            >
              Корзина выбранных мест
            </strong>
            <button
              type="button"
              onClick={() => setIsCartOpen(false)}
              className={classNames.cartIconButton}
              style={mergeStyles({ ...cartIconButtonStyle, width: 22, height: 22 }, styles.cartIconButton)}
              title="Закрыть корзину"
              aria-label="Закрыть корзину"
            >
              x
            </button>
          </div>

          <div
            className={classNames.cartBody}
            style={mergeStyles(
              { display: "flex", flexDirection: "column", gap: 8, overflow: "auto", padding: 12, flex: 1 },
              styles.cartBody,
            )}
          >
            {groupedSeatsList.length === 0 ? (
              <div
                className={classNames.cartEmptyState}
                style={mergeStyles(
                  { color: "var(--seatmap-viewer-text-muted, #9e9eb8)", fontSize: 12, fontFamily: "var(--ds-font-body, system-ui)" },
                  styles.cartEmptyState,
                )}
              >
                Пока нет выбранных мест.
              </div>
            ) : (
              groupedSeatsList.map((group) => (
                <article
                  key={group.categoryId}
                  className={classNames.cartGroup}
                  style={{
                    background: "var(--seatmap-viewer-surface-muted, #212121)",
                    border: "1px solid var(--seatmap-viewer-border, #383533)",
                    borderRadius: "var(--seatmap-viewer-radius-md, 10px)",
                    padding: 8,
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                    ...(styles.cartGroup ?? {}),
                  }}
                >
                  <div
                    className={classNames.cartGroupTitle}
                    style={mergeStyles(
                      {
                        color: "var(--seatmap-viewer-text, #e5e2e1)",
                        fontSize: 12,
                        fontFamily: "var(--ds-font-body, system-ui)",
                        fontWeight: 600,
                      },
                      styles.cartGroupTitle,
                    )}
                  >
                    {group.categoryName}
                  </div>
                  <div
                    className={classNames.cartGroupMeta}
                    style={mergeStyles(
                      { color: "var(--seatmap-viewer-text-muted, #9a9694)", fontSize: 11, fontFamily: "var(--ds-font-body, system-ui)" },
                      styles.cartGroupMeta,
                    )}
                  >
                    {group.seats.length} бил. - {formatMoney(group.unitPrice, locale, currency)} / шт.
                  </div>
                  <div className={classNames.cartQuantityRow} style={mergeStyles({ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }, styles.cartQuantityRow)}>
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <button
                        type="button"
                        className={classNames.cartIconButton}
                        style={mergeStyles(cartIconButtonStyle, styles.cartIconButton)}
                        onClick={() => handleRemoveLastInCategory(group.categoryId)}
                        disabled={group.seats.length === 0}
                        aria-label={`Убрать одно место из категории ${group.categoryName}`}
                      >
                        -
                      </button>
                      <span
                        className={classNames.cartQuantityValue}
                        style={mergeStyles(
                          { minWidth: 20, textAlign: "center", color: "var(--seatmap-viewer-text, #e5e2e1)", fontSize: 12 },
                          styles.cartQuantityValue,
                        )}
                      >
                        {group.seats.length}
                      </span>
                      <button
                        type="button"
                        className={classNames.cartIconButton}
                        style={mergeStyles(cartIconButtonStyle, styles.cartIconButton)}
                        onClick={() => handleAddSeatInCategory(group.categoryId)}
                        disabled={group.availableToAdd === 0}
                        aria-label={`Добавить одно место в категорию ${group.categoryName}`}
                      >
                        +
                      </button>
                    </div>
                    <span
                      className={classNames.cartGroupTotal}
                      style={mergeStyles(
                        {
                          color: "var(--seatmap-viewer-text, #e5e2e1)",
                          fontSize: 12,
                          fontFamily: "var(--ds-font-body, system-ui)",
                          fontWeight: 600,
                        },
                        styles.cartGroupTotal,
                      )}
                    >
                      {formatMoney(group.seats.reduce((sum, seat) => sum + seat.unitPrice, 0), locale, currency)}
                    </span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {group.seats.map((seat) => (
                      <div
                        key={seat.seatId}
                        className={classNames.cartSeatRow}
                        style={mergeStyles({ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }, styles.cartSeatRow)}
                      >
                        <span
                          className={classNames.cartSeatLabel}
                          style={mergeStyles(
                            { color: "var(--seatmap-viewer-text-muted, #beb9b8)", fontSize: 11, fontFamily: "var(--ds-font-body, system-ui)" },
                            styles.cartSeatLabel,
                          )}
                        >
                          {seat.sectionLabel ?? "Секция"} {seat.rowLabel ? `- ${seat.rowLabel}${seat.seatLabel}` : `- ${seat.seatLabel}`}
                        </span>
                        <button
                          type="button"
                          className={classNames.cartIconButton}
                          style={mergeStyles(cartIconButtonStyle, styles.cartIconButton)}
                          onClick={() => removeSeatFromSelection(seat.seatId)}
                          title="Убрать место"
                          aria-label={`Убрать место ${seat.seatLabel}`}
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
            className={classNames.cartFooter}
            style={{
              borderTop: "1px solid var(--seatmap-viewer-border-subtle, rgba(92, 89, 87, 0.45))",
              padding: 12,
              display: "flex",
              flexDirection: "column",
              gap: 8,
              ...(styles.cartFooter ?? {}),
            }}
          >
            <div
              className={classNames.cartSummary}
              style={mergeStyles(
                { color: "var(--seatmap-viewer-text-muted, #d2cdcb)", fontSize: 12, fontFamily: "var(--ds-font-body, system-ui)" },
                styles.cartSummary,
              )}
            >
              {totalSelectedSeats} мест - Итого {formatMoney(totalCost, locale, currency)}
            </div>
            <button
              type="button"
              disabled={cartSeats.length === 0}
              onClick={handleProceed}
              className={classNames.cartProceedButton}
              style={{
                border: "1px solid var(--seatmap-viewer-accent, #8a7f46)",
                background: cartSeats.length === 0
                  ? "var(--seatmap-viewer-accent-disabled, #4f4933)"
                  : "var(--seatmap-viewer-accent, #6f663a)",
                color: "var(--seatmap-viewer-accent-text, #f5edc7)",
                borderRadius: "var(--seatmap-viewer-radius-sm, 8px)",
                padding: "8px 12px",
                fontSize: 13,
                fontWeight: 600,
                fontFamily: "var(--ds-font-body, system-ui)",
                cursor: cartSeats.length === 0 ? "not-allowed" : "pointer",
                ...(styles.cartProceedButton ?? {}),
              }}
            >
              Продолжить
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
  locale,
  currency,
  styles,
  classNames,
}: SeatmapViewerProps) {
  return (
    <SeatmapProvider venue={venue}>
      <div
        className={mergeClassNames(className, classNames?.root)}
        style={mergeStyles({ width: "100%", height: "100%", position: "relative" }, styles?.root)}
      >
        <SeatmapViewerContent
          venue={venue}
          onSeatClick={onSeatClick}
          onSeatHover={onSeatHover}
          onSelectionChange={onSelectionChange}
          renderTooltip={renderTooltip}
          showLabels={showLabels}
          onCartEvent={onCartEvent}
          locale={locale}
          currency={currency}
          styles={styles}
          classNames={classNames}
        />
      </div>
    </SeatmapProvider>
  );
}
