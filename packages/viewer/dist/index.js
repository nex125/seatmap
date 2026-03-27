import { SeatmapProvider, SeatmapCanvas, TooltipOverlay } from '@nex22/seatmap-react';
export { useSeatStatus } from '@nex22/seatmap-react';
import { jsx, jsxs } from 'react/jsx-runtime';

// src/SeatmapViewer.tsx
function SeatmapViewer({
  venue,
  onSeatClick,
  onSeatHover,
  renderTooltip,
  className
}) {
  return /* @__PURE__ */ jsx(SeatmapProvider, { venue, children: /* @__PURE__ */ jsxs("div", { className, style: { width: "100%", height: "100%", position: "relative" }, children: [
    /* @__PURE__ */ jsx(
      SeatmapCanvas,
      {
        onSeatClick,
        onSeatHover
      }
    ),
    /* @__PURE__ */ jsx(TooltipOverlay, { renderTooltip })
  ] }) });
}

export { SeatmapViewer };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map