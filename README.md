# @nex125/seatmap

A high-performance, React-based seat map system for venues of all sizes — from small theaters to 50,000+ seat stadiums. Built with PixiJS v8 (WebGL/WebGPU) for smooth 60fps rendering.

## Packages

| Package | Description |
|---------|-------------|
| `@nex125/seatmap-core` | Framework-agnostic engine: data models, spatial index, viewport, LOD system, command history |
| `@nex125/seatmap-react` | React components and hooks: `SeatmapCanvas`, `SeatmapProvider`, `TooltipOverlay`, `Minimap` |
| `@nex125/seatmap-viewer` | Customer-facing viewer with seat selection, tooltips, and real-time status updates |
| `@nex125/seatmap-editor` | Admin editor with tool system, property panel, category manager, and undo/redo |

## Quick Start

From `seatmap/`:

```bash
docker compose up -d seatmap
docker compose exec seatmap bun install --frozen-lockfile
docker compose exec seatmap bun run dev # starts demo app at http://localhost:3005
```

If the `seatmap` container is not running yet:

```bash
docker compose up -d seatmap
```

### Viewer Usage

```tsx
import { SeatmapViewer } from '@nex125/seatmap-viewer';

function TicketPage({ venue }) {
  return (
    <SeatmapViewer
      venue={venue}
      onSeatClick={(seatId, sectionId) => {
        console.log('Selected:', seatId, 'in', sectionId);
      }}
    />
  );
}
```

### Viewer Localization

`@nex125/seatmap-viewer` ships with English defaults and exposes a message contract for host apps.

- Default locale baseline is English (`en-US` formatting behavior by default).
- Host apps can override labels via the `messages` prop.
- Recommended pattern: keep EN as fallback catalog and merge locale-specific overrides in the app.

```tsx
import { SeatmapViewer } from '@nex125/seatmap-viewer';
import type { SeatmapViewerMessages } from '@nex125/seatmap-viewer';

const seatmapMessages: Partial<SeatmapViewerMessages> = {
  legendStatusesTitle: t('seatmap.legendStatusesTitle'),
  cartProceedButton: t('seatmap.cartProceedButton'),
  cartSummary: (count, totalCost) => t('seatmap.cartSummary', { count, totalCost }),
};

<SeatmapViewer
  venue={venue}
  locale="ru-RU"
  currency="BYN"
  messages={seatmapMessages}
/>;
```

When adding a new locale in consuming apps:

1. Add a new locale JSON catalog in each app (`events-frontend`, `events-admin-frontend`).
2. Add/translate seatmap message keys (for example `seatmapViewer.*` or `ticketLauncher.seatmap.*`).
3. Ensure fallback merge still uses EN as base.
4. Run catalog validation in app containers:

```bash
docker compose --project-directory ./infrastructure exec events-frontend bun run i18n:check
docker compose --project-directory ./infrastructure exec events-admin-frontend bun run i18n:check
```

### Editor Usage

```tsx
import { SeatmapEditor } from '@nex125/seatmap-editor';

function VenueAdmin({ venue }) {
  return (
    <SeatmapEditor
      venue={venue}
      onChange={(updatedVenue) => saveToBackend(updatedVenue)}
      onSave={(updatedVenue, schemaJson) => {
        console.log("Save clicked for", updatedVenue.name);
        // Persist it however your app needs (API call, file export, etc.)
        console.log(schemaJson);
      }}
    />
  );
}
```

### SSE Integration (Real-time seat status)

```tsx
import { SeatmapViewer, useSeatStatus } from '@nex125/seatmap-viewer';

function LiveViewer({ venue }) {
  return (
    <SeatmapViewer venue={venue}>
      <SSEBridge />
    </SeatmapViewer>
  );
}

function SSEBridge() {
  const { updateSeatStatus } = useSeatStatus();

  useEffect(() => {
    const es = new EventSource('/api/seats/stream');
    es.onmessage = (e) => {
      const { seatId, status } = JSON.parse(e.data);
      updateSeatStatus(seatId, status);
    };
    return () => es.close();
  }, [updateSeatStatus]);

  return null;
}
```

## Architecture

### Rendering Pipeline

```
Venue Data → R-tree Spatial Index → Viewport Culling → LOD Selection → PixiJS Scene Graph → WebGL
```

### Level of Detail (LOD)

- **Overview** (zoom < 0.3): Sections as colored polygons
- **Section** (zoom 0.3–0.7): Rows visible as lines
- **Detail** (zoom > 0.7): Individual seats as batched sprites

### Performance

- Sprite atlas with texture batching for minimal draw calls
- R-tree spatial index (rbush) for O(log n) viewport culling and hit testing
- Only visible objects are rendered — 50k seat stadiums run at 60fps

## Editor Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `V` / `1` | Select tool |
| `H` / `2` | Pan tool |
| `S` / `3` | Add Section tool |
| `R` / `4` | Add Row tool |
| `A` / `5` | Add Seat tool |
| `Space` | Toggle pan tool |
| `Delete` / `Backspace` | Delete selected objects |
| `Ctrl+Z` | Undo |
| `Ctrl+Shift+Z` | Redo |

## Tech Stack

- **Rendering**: PixiJS v8 (WebGL2/WebGPU)
- **Framework**: React 19 + TypeScript
- **Spatial Index**: rbush (R-tree)
- **State**: Zustand
- **Build**: tsup (ESM + CJS)
- **Monorepo**: Bun workspaces + Turborepo

## Development

From `seatmap/`:

```bash
docker compose exec seatmap bun install --frozen-lockfile
docker compose exec seatmap bun run dev
docker compose exec seatmap bun run build
docker compose exec seatmap bun run lint
```

```bash
# bump packages versions
docker compose exec -w /app/packages/core seatmap bun pm version patch
docker compose exec -w /app/packages/editor seatmap bun pm version patch
docker compose exec -w /app/packages/react seatmap bun pm version patch
docker compose exec -w /app/packages/viewer seatmap bun pm version patch
```

## Project Structure

```
seatmap/
├── apps/demo/         # Standalone demo app (Vite + React)
├── packages/
│   ├── core/          # Data models, spatial index, viewport, LOD, commands
│   ├── react/         # React components, hooks, context
│   ├── editor/        # Editor tools, panels, SeatmapEditor
│   └── viewer/        # Viewer component, tooltip overlay
├── turbo.json
└── package.json       # Bun workspace configuration
```
