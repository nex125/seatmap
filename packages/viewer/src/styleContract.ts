import type { CSSProperties } from "react";

export const seatmapViewerStyleSlots = [
  "root",
  "legendContainer",
  "legendHeading",
  "legendList",
  "legendItem",
  "legendSwatch",
  "legendDivider",
  "cartChip",
  "cartPopup",
  "cartHeader",
  "cartHeaderTitle",
  "cartIconButton",
  "cartBody",
  "cartEmptyState",
  "cartGroup",
  "cartGroupTitle",
  "cartGroupMeta",
  "cartQuantityRow",
  "cartQuantityValue",
  "cartGroupTotal",
  "cartSeatRow",
  "cartSeatLabel",
  "cartFooter",
  "cartSummary",
  "cartProceedButton",
] as const;

export type SeatmapViewerStyleSlot = (typeof seatmapViewerStyleSlots)[number];
export type SeatmapViewerStyles = Partial<Record<SeatmapViewerStyleSlot, CSSProperties>>;
export type SeatmapViewerClassNames = Partial<Record<SeatmapViewerStyleSlot, string>>;

const STYLE_CONTRACT_CLASS_PREFIX = "seatmap-viewer";

export const seatmapViewerDefaultClassNames: Record<SeatmapViewerStyleSlot, string> = {
  root: `${STYLE_CONTRACT_CLASS_PREFIX}__root`,
  legendContainer: `${STYLE_CONTRACT_CLASS_PREFIX}__legend-container`,
  legendHeading: `${STYLE_CONTRACT_CLASS_PREFIX}__legend-heading`,
  legendList: `${STYLE_CONTRACT_CLASS_PREFIX}__legend-list`,
  legendItem: `${STYLE_CONTRACT_CLASS_PREFIX}__legend-item`,
  legendSwatch: `${STYLE_CONTRACT_CLASS_PREFIX}__legend-swatch`,
  legendDivider: `${STYLE_CONTRACT_CLASS_PREFIX}__legend-divider`,
  cartChip: `${STYLE_CONTRACT_CLASS_PREFIX}__cart-chip`,
  cartPopup: `${STYLE_CONTRACT_CLASS_PREFIX}__cart-popup`,
  cartHeader: `${STYLE_CONTRACT_CLASS_PREFIX}__cart-header`,
  cartHeaderTitle: `${STYLE_CONTRACT_CLASS_PREFIX}__cart-header-title`,
  cartIconButton: `${STYLE_CONTRACT_CLASS_PREFIX}__cart-icon-button`,
  cartBody: `${STYLE_CONTRACT_CLASS_PREFIX}__cart-body`,
  cartEmptyState: `${STYLE_CONTRACT_CLASS_PREFIX}__cart-empty-state`,
  cartGroup: `${STYLE_CONTRACT_CLASS_PREFIX}__cart-group`,
  cartGroupTitle: `${STYLE_CONTRACT_CLASS_PREFIX}__cart-group-title`,
  cartGroupMeta: `${STYLE_CONTRACT_CLASS_PREFIX}__cart-group-meta`,
  cartQuantityRow: `${STYLE_CONTRACT_CLASS_PREFIX}__cart-quantity-row`,
  cartQuantityValue: `${STYLE_CONTRACT_CLASS_PREFIX}__cart-quantity-value`,
  cartGroupTotal: `${STYLE_CONTRACT_CLASS_PREFIX}__cart-group-total`,
  cartSeatRow: `${STYLE_CONTRACT_CLASS_PREFIX}__cart-seat-row`,
  cartSeatLabel: `${STYLE_CONTRACT_CLASS_PREFIX}__cart-seat-label`,
  cartFooter: `${STYLE_CONTRACT_CLASS_PREFIX}__cart-footer`,
  cartSummary: `${STYLE_CONTRACT_CLASS_PREFIX}__cart-summary`,
  cartProceedButton: `${STYLE_CONTRACT_CLASS_PREFIX}__cart-proceed-button`,
};

export const seatmapViewerCssVariables = [
  "--seatmap-viewer-surface",
  "--seatmap-viewer-surface-elevated",
  "--seatmap-viewer-surface-muted",
  "--seatmap-viewer-border",
  "--seatmap-viewer-border-subtle",
  "--seatmap-viewer-text",
  "--seatmap-viewer-text-muted",
  "--seatmap-viewer-accent",
  "--seatmap-viewer-accent-disabled",
  "--seatmap-viewer-accent-text",
  "--seatmap-viewer-danger",
  "--seatmap-viewer-danger-text",
  "--seatmap-viewer-radius-sm",
  "--seatmap-viewer-radius-md",
  "--seatmap-viewer-shadow-elevated",
] as const;

export type SeatmapViewerCssVariable = (typeof seatmapViewerCssVariables)[number];
export type SeatmapViewerCssVariableValues = Partial<Record<SeatmapViewerCssVariable, string>>;

export const seatmapViewerStyleContract = {
  slots: seatmapViewerStyleSlots,
  defaultClassNames: seatmapViewerDefaultClassNames,
  cssVariables: seatmapViewerCssVariables,
} as const;
