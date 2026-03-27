# @ticketok/seatmap

A high-performance, React-based seat map system for venues of all sizes — from small theaters to 50,000+ seat stadiums. Built with PixiJS v8 (WebGL/WebGPU) for smooth 60fps rendering.

## Packages

| Package | Description |
|---------|-------------|
| `@ticketok/seatmap-core` | Framework-agnostic engine: data models, spatial index, viewport, LOD system, command history |
| `@ticketok/seatmap-react` | React components and hooks: `SeatmapCanvas`, `SeatmapProvider`, `TooltipOverlay`, `Minimap` |
| `@ticketok/seatmap-viewer` | Customer-facing viewer with seat selection, tooltips, and real-time status updates |
| `@ticketok/seatmap-editor` | Admin editor with tool system, property panel, category manager, and undo/redo |

## Quick Start

```bash
pnpm install
pnpm dev       # starts demo app at http://localhost:3000
```

### Viewer Usage

```tsx
import { SeatmapViewer } from '@ticketok/seatmap-viewer';

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

### Editor Usage

```tsx
import { SeatmapEditor } from '@ticketok/seatmap-editor';

function VenueAdmin({ venue }) {
  return (
    <SeatmapEditor
      venue={venue}
      onChange={(updatedVenue) => saveToBackend(updatedVenue)}
    />
  );
}
```

### SSE Integration (Real-time seat status)

```tsx
import { SeatmapViewer, useSeatStatus } from '@ticketok/seatmap-viewer';

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
| `Space` (hold) | Temporary pan |
| `Ctrl+Z` | Undo |
| `Ctrl+Shift+Z` | Redo |

## Tech Stack

- **Rendering**: PixiJS v8 (WebGL2/WebGPU)
- **Framework**: React 19 + TypeScript
- **Spatial Index**: rbush (R-tree)
- **State**: Zustand
- **Build**: tsup (ESM + CJS)
- **Monorepo**: pnpm workspaces + Turborepo

## Development

```bash
pnpm install          # install dependencies
pnpm dev              # start all packages in watch mode
pnpm build            # build all packages
pnpm lint             # type-check all packages
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
└── pnpm-workspace.yaml
```
