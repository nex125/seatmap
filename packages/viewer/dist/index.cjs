'use strict';

var seatmapReact = require('@nex22/seatmap-react');
var jsxRuntime = require('react/jsx-runtime');

// src/SeatmapViewer.tsx
function SeatmapViewer({
  venue,
  onSeatClick,
  onSeatHover,
  renderTooltip,
  className
}) {
  return /* @__PURE__ */ jsxRuntime.jsx(seatmapReact.SeatmapProvider, { venue, children: /* @__PURE__ */ jsxRuntime.jsxs("div", { className, style: { width: "100%", height: "100%", position: "relative" }, children: [
    /* @__PURE__ */ jsxRuntime.jsx(
      seatmapReact.SeatmapCanvas,
      {
        onSeatClick,
        onSeatHover
      }
    ),
    /* @__PURE__ */ jsxRuntime.jsx(seatmapReact.TooltipOverlay, { renderTooltip })
  ] }) });
}

Object.defineProperty(exports, "useSeatStatus", {
  enumerable: true,
  get: function () { return seatmapReact.useSeatStatus; }
});
exports.SeatmapViewer = SeatmapViewer;
//# sourceMappingURL=index.cjs.map
//# sourceMappingURL=index.cjs.map