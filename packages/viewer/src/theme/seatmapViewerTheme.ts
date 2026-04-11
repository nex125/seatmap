import type { CSSProperties } from "react";
import { seatmapViewerDefaultClassNames } from "../styleContract";
import type { SeatmapViewerClassNames, SeatmapViewerCssVariableValues } from "../styleContract";

export const seatmapViewerSharedThemeRootClassName = "seatmap-viewer-theme";

export const seatmapViewerSharedThemeClassNames: SeatmapViewerClassNames = {
  ...seatmapViewerDefaultClassNames,
};

export const seatmapViewerSharedThemeVariables: SeatmapViewerCssVariableValues = {
  "--seatmap-surface": "var(--ds-surface-container-low, rgba(24, 24, 24, 0.94))",
  "--seatmap-surface-elevated": "var(--ds-surface-container, rgba(28, 28, 28, 0.98))",
  "--seatmap-surface-muted": "var(--ds-surface-container-high, rgba(33, 33, 33, 1))",
  "--seatmap-on-surface": "var(--ds-on-surface, #e5e2e1)",
  "--seatmap-on-surface-variant": "var(--ds-on-surface-variant, #9a9694)",
  "--seatmap-outline": "var(--ds-input-border, rgba(92, 89, 87, 0.65))",
  "--seatmap-outline-variant": "var(--ds-border-subtle, rgba(92, 89, 87, 0.45))",
  "--seatmap-primary": "var(--ds-primary, #6f663a)",
  "--seatmap-on-primary": "var(--ds-on-primary, #f5edc7)",
  "--seatmap-error": "var(--ds-error, #ad3f3f)",
  "--seatmap-on-error": "var(--ds-on-error, #ffffff)",
  "--seatmap-state-layer-hover":
    "var(--ds-primary-wash, color-mix(in srgb, var(--ds-primary, #6f663a) 12%, transparent))",
  "--seatmap-state-layer-pressed":
    "var(--ds-primary-wash-strong, color-mix(in srgb, var(--ds-primary, #6f663a) 16%, transparent))",
  "--seatmap-focus-ring":
    "var(--ds-primary-ring, color-mix(in srgb, var(--ds-primary, #6f663a) 55%, transparent))",
  "--seatmap-radius-sm": "var(--ds-radius-structural-sm, 8px)",
  "--seatmap-radius-md": "var(--ds-radius-structural, 10px)",
  "--seatmap-radius-lg": "calc(var(--ds-radius-structural, 10px) + 6px)",
  "--seatmap-shadow-raised": "var(--ds-shadow-ambient-sm, 0 8px 20px rgba(0, 0, 0, 0.22))",
  "--seatmap-shadow-elevated": "var(--ds-shadow-ambient, 0 10px 24px rgba(0, 0, 0, 0.28))",
  "--seatmap-shadow-floating": "var(--ds-shadow-ambient-lg, 0 14px 34px rgba(0, 0, 0, 0.32))",
  "--seatmap-viewer-surface": "var(--seatmap-surface)",
  "--seatmap-viewer-surface-elevated": "var(--seatmap-surface-elevated)",
  "--seatmap-viewer-surface-muted": "var(--seatmap-surface-muted)",
  "--seatmap-viewer-border": "var(--seatmap-outline)",
  "--seatmap-viewer-border-subtle": "var(--seatmap-outline-variant)",
  "--seatmap-viewer-text": "var(--seatmap-on-surface)",
  "--seatmap-viewer-text-muted": "var(--seatmap-on-surface-variant)",
  "--seatmap-viewer-accent": "var(--seatmap-primary)",
  "--seatmap-viewer-accent-disabled":
    "color-mix(in srgb, var(--seatmap-primary) 28%, var(--seatmap-surface-muted))",
  "--seatmap-viewer-accent-text": "var(--seatmap-on-primary)",
  "--seatmap-viewer-danger": "var(--seatmap-error)",
  "--seatmap-viewer-danger-text": "var(--seatmap-on-error)",
  "--seatmap-viewer-state-layer-hover": "var(--seatmap-state-layer-hover)",
  "--seatmap-viewer-state-layer-pressed": "var(--seatmap-state-layer-pressed)",
  "--seatmap-viewer-focus-ring": "var(--seatmap-focus-ring)",
  "--seatmap-viewer-radius-sm": "var(--seatmap-radius-sm)",
  "--seatmap-viewer-radius-md": "var(--seatmap-radius-md)",
  "--seatmap-viewer-radius-lg": "var(--seatmap-radius-lg)",
  "--seatmap-viewer-shadow-raised": "var(--seatmap-shadow-raised)",
  "--seatmap-viewer-shadow-elevated": "var(--seatmap-shadow-elevated)",
  "--seatmap-viewer-shadow-floating": "var(--seatmap-shadow-floating)",
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
