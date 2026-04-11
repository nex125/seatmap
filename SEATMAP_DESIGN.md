# Seatmap Design Guide

## Purpose

This is the canonical design guide for:

- `@nex125/seatmap-editor`
- `@nex125/seatmap-viewer`

It documents the Material 3-aligned design that is currently applied in code, and the customization contract for host apps.

## Current Applied Direction (2026)

The current seatmap design is:

- dark-first with layered tonal surfaces
- Material 3 role-aligned (`surface*`, `onSurface*`, `outline*`, `primary`, `error`)
- token-bridged to `events-frontend` `--ds-*` variables, but still standalone through fallback values
- componentized through semantic CSS classes (`seatmap-editor__*`, `seatmap-viewer__*`)

## Token Bridge Strategy

Seatmap uses a two-level token model:

1. shared package-level `--seatmap-*` semantic variables
2. package-scoped aliases (`--seatmap-editor-*`, `--seatmap-viewer-*`)

Defaults resolve to `--ds-*` when present, with local fallback values to avoid host lock-in.

## Material 3 Role Mapping (Implemented)

Use these role intentions for all new visual decisions:

- **Surfaces**: `--seatmap-surface`, `--seatmap-surface-elevated`, `--seatmap-surface-muted`
- **On-surface text**: `--seatmap-on-surface`, `--seatmap-on-surface-variant`
- **Boundaries**: `--seatmap-outline`, `--seatmap-outline-variant`
- **Primary**: `--seatmap-primary`, `--seatmap-on-primary`
- **Error**: `--seatmap-error`, `--seatmap-on-error`
- **State layers**: `--seatmap-state-layer-hover`, `--seatmap-state-layer-pressed`, `--seatmap-focus-ring`
- **Shape/elevation**: `--seatmap-radius-*`, `--seatmap-shadow-*`

## Editor Design System (Current)

### Styling ownership

- `packages/editor/src/SeatmapEditor.css` is the visual source of truth.
- React panels should rely on semantic classes, not inline style literals.
- Inline styles are allowed only for runtime geometry and positional values.

### Structural areas currently themed

- toolbar (`seatmap-editor__toolbar*`) with active/highlight/focus states
- tool options shell and cards (`seatmap-editor__tool-options-*`, `seatmap-editor__option-card*`)
- motion controls (sliders/knobs, compact and advanced layouts)
- sidebar and panel cards
- canvas overlays (polygon, drag, section resize, row direction, hints, background frame)

### Toolbar model currently shipped

- tools: `pan`, `select`, `add-section`, `add-row`, `add-seat`
- utility actions: `undo`, `redo`, `fit`, `grid`, `hints`, `settings`, `save`, `load`
- optional shortcuts help panel when hints are enabled

### Motion model currently shipped

- settings persisted to `seatmap-editor-motion-settings-v1`
- high-level controls: section draw, fit view, pan inertia, wheel/pointer zoom
- advanced pan inertia controls available (`carry`, `friction`, `minSpeed`, `velocityBlend`, `stopDelta`, `releaseIdleMs`)
- `PanTool` supports inertia with decay and release-idle cancellation

## Viewer Design System (Current)

### Styling ownership

- class-and-variable theming is primary
- runtime style objects are additive overrides, not baseline ownership
- `packages/viewer/src/styleContract.ts` is the stable public contract

### Stable contract requirements

- do not rename existing style slots without versioning
- do not remove published CSS variable keys without migration
- preserve merge predictability for `styles`, `classNames`, and root variable overrides

Current public style slots include `root`, legend slots, and cart slots (`cartChip`, `cartPopup`, `cartProceedButton`, etc.).

## Override Model For Host Apps

Preferred override order:

1. CSS variables (`--seatmap-*` / `--seatmap-editor-*` / `--seatmap-viewer-*`)
2. class slot overrides (`styleContract` class names, semantic classes)
3. per-instance style props

If a value repeats in 2+ places, promote it into a named semantic token.

## Accessibility + Interaction Rules

- every interactive control must expose visible `:focus-visible`
- keep hover/pressed feedback via state-layer tokens, not ad hoc color jumps
- do not encode critical state with color alone
- preserve keyboard semantics for seat/section/row selection flows
- keep compact controls usable (no accidental hit-target regressions)

## Migration Rules

- do not introduce persistent chrome colors as inline hex values in JSX
- do not use ad hoc `color-mix(...)` in JSX; define reusable CSS variables instead
- keep `--ds-*` bridges with fallbacks when introducing new semantic tokens
- avoid blanket `!important`; prefer stronger semantic selectors and tokenization

## Alignment With Events Frontend

Seatmap aligns with `events-frontend/DESIGN.md` on:

- Material 3 role semantics
- dark tonal layering
- restrained accent usage
- token naming and bridge compatibility

Alignment does not imply direct dependency on app CSS files.

## Checklist For Styling Changes

Before merge:

- semantic token exists for reused visuals
- hover/focus/pressed/disabled states are present and visible
- editor and viewer remain overridable by host apps
- viewer style contract remains backward-compatible
- standalone rendering still works without `--ds-*`
