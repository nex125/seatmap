import type { CSSProperties } from "react";
import { seatmapViewerDefaultClassNames } from "../styleContract";
import type { SeatmapViewerClassNames, SeatmapViewerCssVariableValues } from "../styleContract";

export const seatmapViewerSharedThemeRootClassName = "seatmap-viewer-theme";

export const seatmapViewerSharedThemeClassNames: SeatmapViewerClassNames = {
  ...seatmapViewerDefaultClassNames,
};

export const seatmapViewerSharedThemeVariables: SeatmapViewerCssVariableValues = {
  "--seatmap-viewer-surface": "var(--ds-surface, rgba(24, 24, 24, 0.94))",
  "--seatmap-viewer-surface-elevated": "var(--ds-surface-container, rgba(28, 28, 28, 0.98))",
  "--seatmap-viewer-surface-muted": "var(--ds-surface-container-low, rgba(33, 33, 33, 1))",
  "--seatmap-viewer-border": "var(--ds-border-subtle, rgba(92, 89, 87, 0.65))",
  "--seatmap-viewer-border-subtle": "var(--ds-ghost-border, rgba(92, 89, 87, 0.45))",
  "--seatmap-viewer-text": "var(--ds-on-surface, #e5e2e1)",
  "--seatmap-viewer-text-muted": "var(--ds-on-surface-variant, #9a9694)",
  "--seatmap-viewer-accent": "var(--ds-primary, #6f663a)",
  "--seatmap-viewer-accent-disabled": "color-mix(in srgb, var(--ds-primary, #6f663a) 55%, #000)",
  "--seatmap-viewer-accent-text": "var(--ds-on-primary, #f5edc7)",
  "--seatmap-viewer-danger": "var(--ds-error, #ad3f3f)",
  "--seatmap-viewer-danger-text": "var(--ds-on-error, #ffffff)",
  "--seatmap-viewer-radius-sm": "var(--ds-radius-structural-sm, 8px)",
  "--seatmap-viewer-radius-md": "var(--ds-radius-structural, 10px)",
  "--seatmap-viewer-shadow-elevated": "var(--ds-shadow-ambient-md, 0 10px 24px rgba(0, 0, 0, 0.28))",
};

export const seatmapViewerSharedTheme = {
  rootClassName: seatmapViewerSharedThemeRootClassName,
  classNames: seatmapViewerSharedThemeClassNames,
  variables: seatmapViewerSharedThemeVariables,
} as const;

export function getSeatmapViewerSharedThemeRootStyle(
  overrides?: SeatmapViewerCssVariableValues,
): CSSProperties {
  return {
    ...seatmapViewerSharedThemeVariables,
    ...(overrides ?? {}),
  } as CSSProperties;
}
