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
  messages?: Partial<SeatmapViewerMessages>;
}

export interface SeatmapViewerMessages {
  uncategorizedCategoryName: string;
  sectionFallbackLabel: string;
  tableLabel: (tableLabel: string) => string;
  legendAriaLabel: string;
  legendStatusesTitle: string;
  legendPricesTitle: string;
  cartChipLabel: (selectedCount: number) => string;
  cartAriaLabel: string;
  cartHeaderTitle: string;
  cartCloseLabel: string;
  cartEmptyState: string;
  cartGroupMeta: (count: number, unitPrice: string) => string;
  cartRemoveOneAriaLabel: (categoryName: string) => string;
  cartAddOneAriaLabel: (categoryName: string) => string;
  cartRemoveSeatTitle: string;
  cartRemoveSeatAriaLabel: (seatLabel: string) => string;
  cartSummary: (count: number, totalCost: string) => string;
  cartProceedButton: string;
}

export const defaultSeatmapViewerMessages: SeatmapViewerMessages = {
  uncategorizedCategoryName: "Uncategorized",
  sectionFallbackLabel: "Section",
  tableLabel: (tableLabel) => `Table ${tableLabel}`,
  legendAriaLabel: "Seatmap legend",
  legendStatusesTitle: "Seat statuses",
  legendPricesTitle: "Prices",
  cartChipLabel: (selectedCount) => `Cart (${selectedCount})`,
  cartAriaLabel: "Selected seats cart",
  cartHeaderTitle: "Selected seats cart",
  cartCloseLabel: "Close cart",
  cartEmptyState: "No seats selected yet.",
  cartGroupMeta: (count, unitPrice) => `${count} tickets - ${unitPrice} each`,
  cartRemoveOneAriaLabel: (categoryName) => `Remove one seat from ${categoryName}`,
  cartAddOneAriaLabel: (categoryName) => `Add one seat to ${categoryName}`,
  cartRemoveSeatTitle: "Remove seat",
  cartRemoveSeatAriaLabel: (seatLabel) => `Remove seat ${seatLabel}`,
  cartSummary: (count, totalCost) => `${count} seats - Total ${totalCost}`,
  cartProceedButton: "Proceed",
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
  locale = "en-US",
  currency = "BYN",
  styles = {},
  classNames = {},
  messages: messagesOverride = {},
}: SeatmapViewerContentProps) {
  const messages = useMemo(
    () => ({ ...defaultSeatmapViewerMessages, ...messagesOverride }),
    [messagesOverride],
  );
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
            categoryName: category?.name ?? messages.uncategorizedCategoryName,
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
            sectionLabel: messages.tableLabel(table.label),
          categoryId: seat.categoryId,
          categoryName: category?.name ?? messages.uncategorizedCategoryName,
          unitPrice: getEffectiveCategoryPrice(category),
          status: seat.status,
          x: table.position.x + seat.position.x,
          y: table.position.y + seat.position.y,
        });
      }
    }
    return next;
  }, [venue, messages]);

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
        <aside
          aria-label={messages.legendAriaLabel}
          className={mergeClassNames("seatmap-viewer__legend", classNames.legendContainer)}
          style={styles.legendContainer}
        >
          {showStatuses && (
            <section className="seatmap-viewer__legend-section">
              <p className={mergeClassNames("seatmap-viewer__legend-heading-base", classNames.legendHeading)} style={styles.legendHeading}>{messages.legendStatusesTitle}</p>
              <ul className={mergeClassNames("seatmap-viewer__legend-list-base", classNames.legendList)} style={styles.legendList}>
                {venue.seatStatuses.map((status) => (
                  <li key={status.id} className={mergeClassNames("seatmap-viewer__legend-item-base", classNames.legendItem)} style={styles.legendItem}>
                    <span
                      className={mergeClassNames("seatmap-viewer__legend-swatch-base", classNames.legendSwatch)}
                      style={mergeStyles({ background: status.color }, styles.legendSwatch)}
                    />
                    <span>{status.name}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {showStatuses && showCategories && (
            <div
              className={mergeClassNames("seatmap-viewer__legend-divider-base", classNames.legendDivider)}
              style={styles.legendDivider}
            />
          )}
          {showCategories && (
            <section className="seatmap-viewer__legend-section">
              <p className={mergeClassNames("seatmap-viewer__legend-heading-base", classNames.legendHeading)} style={styles.legendHeading}>{messages.legendPricesTitle}</p>
              <ul className={mergeClassNames("seatmap-viewer__legend-list-base", classNames.legendList)} style={styles.legendList}>
                {venue.categories.map((category) => (
                  <li key={category.id} className={mergeClassNames("seatmap-viewer__legend-item-base", classNames.legendItem)} style={styles.legendItem}>
                    <span
                      className={mergeClassNames("seatmap-viewer__legend-swatch-base", classNames.legendSwatch)}
                      style={mergeStyles({ background: category.color }, styles.legendSwatch)}
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
          className={mergeClassNames("seatmap-viewer__cart-chip-base", classNames.cartChip)}
          onClick={() => setIsCartOpen(true)}
          style={styles.cartChip}
        >
          {messages.cartChipLabel(totalSelectedSeats)}
        </button>
      )}

      {isCartOpen && (
        <aside
          aria-label={messages.cartAriaLabel}
          className={mergeClassNames("seatmap-viewer__cart-popup-base", classNames.cartPopup)}
          style={mergeStyles({ width: cartWidth, maxWidth: "100%" }, styles.cartPopup)}
        >
          <div
            className={mergeClassNames("seatmap-viewer__cart-header-base", classNames.cartHeader)}
            style={styles.cartHeader}
          >
            <strong
              className={mergeClassNames("seatmap-viewer__cart-header-title-base", classNames.cartHeaderTitle)}
              style={styles.cartHeaderTitle}
            >
              {messages.cartHeaderTitle}
            </strong>
            <button
              type="button"
              onClick={() => setIsCartOpen(false)}
              className={mergeClassNames("seatmap-viewer__cart-icon-button-base", classNames.cartIconButton)}
              style={styles.cartIconButton}
              title={messages.cartCloseLabel}
              aria-label={messages.cartCloseLabel}
            >
              x
            </button>
          </div>

          <div
            className={mergeClassNames("seatmap-viewer__cart-body-base", classNames.cartBody)}
            style={styles.cartBody}
          >
            {groupedSeatsList.length === 0 ? (
              <div
                className={mergeClassNames("seatmap-viewer__cart-empty-state-base", classNames.cartEmptyState)}
                style={styles.cartEmptyState}
              >
                {messages.cartEmptyState}
              </div>
            ) : (
              groupedSeatsList.map((group) => (
                <article
                  key={group.categoryId}
                  className={mergeClassNames("seatmap-viewer__cart-group-base", classNames.cartGroup)}
                  style={styles.cartGroup}
                >
                  <div
                    className={mergeClassNames("seatmap-viewer__cart-group-title-base", classNames.cartGroupTitle)}
                    style={styles.cartGroupTitle}
                  >
                    {group.categoryName}
                  </div>
                  <div
                    className={mergeClassNames("seatmap-viewer__cart-group-meta-base", classNames.cartGroupMeta)}
                    style={styles.cartGroupMeta}
                  >
                    {messages.cartGroupMeta(group.seats.length, formatMoney(group.unitPrice, locale, currency))}
                  </div>
                  <div className={mergeClassNames("seatmap-viewer__cart-quantity-row-base", classNames.cartQuantityRow)} style={styles.cartQuantityRow}>
                    <div className="seatmap-viewer__cart-quantity-controls">
                      <button
                        type="button"
                        className={mergeClassNames("seatmap-viewer__cart-icon-button-base", classNames.cartIconButton)}
                        style={styles.cartIconButton}
                        onClick={() => handleRemoveLastInCategory(group.categoryId)}
                        disabled={group.seats.length === 0}
                        aria-label={messages.cartRemoveOneAriaLabel(group.categoryName)}
                      >
                        -
                      </button>
                      <span
                        className={mergeClassNames("seatmap-viewer__cart-quantity-value-base", classNames.cartQuantityValue)}
                        style={styles.cartQuantityValue}
                      >
                        {group.seats.length}
                      </span>
                      <button
                        type="button"
                        className={mergeClassNames("seatmap-viewer__cart-icon-button-base", classNames.cartIconButton)}
                        style={styles.cartIconButton}
                        onClick={() => handleAddSeatInCategory(group.categoryId)}
                        disabled={group.availableToAdd === 0}
                        aria-label={messages.cartAddOneAriaLabel(group.categoryName)}
                      >
                        +
                      </button>
                    </div>
                    <span
                      className={mergeClassNames("seatmap-viewer__cart-group-total-base", classNames.cartGroupTotal)}
                      style={styles.cartGroupTotal}
                    >
                      {formatMoney(group.seats.reduce((sum, seat) => sum + seat.unitPrice, 0), locale, currency)}
                    </span>
                  </div>
                  <div className="seatmap-viewer__cart-seat-list">
                    {group.seats.map((seat) => (
                      <div
                        key={seat.seatId}
                        className={mergeClassNames("seatmap-viewer__cart-seat-row-base", classNames.cartSeatRow)}
                        style={styles.cartSeatRow}
                      >
                        <span
                          className={mergeClassNames("seatmap-viewer__cart-seat-label-base", classNames.cartSeatLabel)}
                          style={styles.cartSeatLabel}
                        >
                          {seat.sectionLabel ?? messages.sectionFallbackLabel} {seat.rowLabel ? `- ${seat.rowLabel}${seat.seatLabel}` : `- ${seat.seatLabel}`}
                        </span>
                        <button
                          type="button"
                          className={mergeClassNames("seatmap-viewer__cart-icon-button-base", classNames.cartIconButton)}
                          style={styles.cartIconButton}
                          onClick={() => removeSeatFromSelection(seat.seatId)}
                          title={messages.cartRemoveSeatTitle}
                          aria-label={messages.cartRemoveSeatAriaLabel(seat.seatLabel)}
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
            className={mergeClassNames("seatmap-viewer__cart-footer-base", classNames.cartFooter)}
            style={styles.cartFooter}
          >
            <div
              className={mergeClassNames("seatmap-viewer__cart-summary-base", classNames.cartSummary)}
              style={styles.cartSummary}
            >
              {messages.cartSummary(totalSelectedSeats, formatMoney(totalCost, locale, currency))}
            </div>
            <button
              type="button"
              disabled={cartSeats.length === 0}
              onClick={handleProceed}
              className={mergeClassNames("seatmap-viewer__cart-proceed-button-base", classNames.cartProceedButton)}
              style={styles.cartProceedButton}
            >
              {messages.cartProceedButton}
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
  messages,
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
          messages={messages}
        />
      </div>
    </SeatmapProvider>
  );
}
