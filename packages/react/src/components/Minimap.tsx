import { useEffect, useRef, type CSSProperties } from "react";
import { venueAABB, sectionAABB } from "@nex125/seatmap-core";
import type { PricingCategory } from "@nex125/seatmap-core";
import { useSeatmapContext } from "../context/SeatmapContext";
import { useStore } from "zustand";

export interface MinimapProps {
  width?: number;
  height?: number;
  style?: CSSProperties;
}

export function Minimap({ width = 180, height = 120, style }: MinimapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { store, viewport } = useSeatmapContext();
  const venue = useStore(store, (s) => s.venue);

  useEffect(() => {
    if (!venue) return;

    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.scale(dpr, dpr);

      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "rgba(26, 26, 46, 0.9)";
      ctx.fillRect(0, 0, width, height);

      const bounds = venueAABB(venue);
      const contentW = bounds.maxX - bounds.minX;
      const contentH = bounds.maxY - bounds.minY;
      if (contentW <= 0 || contentH <= 0) return;

      const pad = 8;
      const scaleX = (width - pad * 2) / contentW;
      const scaleY = (height - pad * 2) / contentH;
      const scale = Math.min(scaleX, scaleY);
      const offsetX = pad + (width - pad * 2 - contentW * scale) / 2;
      const offsetY = pad + (height - pad * 2 - contentH * scale) / 2;

      const toMinimap = (wx: number, wy: number) => ({
        x: offsetX + (wx - bounds.minX) * scale,
        y: offsetY + (wy - bounds.minY) * scale,
      });

      for (const section of venue.sections) {
        const box = sectionAABB(section);
        const tl = toMinimap(box.minX, box.minY);
        const br = toMinimap(box.maxX, box.maxY);
        const cat = venue.categories.find((c: PricingCategory) => c.id === section.categoryId);
        ctx.fillStyle = cat ? cat.color + "80" : "rgba(100,100,100,0.5)";
        ctx.fillRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
      }

      const visAABB = viewport.getVisibleAABB();
      const vtl = toMinimap(visAABB.minX, visAABB.minY);
      const vbr = toMinimap(visAABB.maxX, visAABB.maxY);
      ctx.strokeStyle = "rgba(255,255,255,0.6)";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(vtl.x, vtl.y, vbr.x - vtl.x, vbr.y - vtl.y);
    };

    draw();
    const unsub = viewport.subscribe(draw);
    return unsub;
  }, [venue, viewport, width, height]);

  if (!venue) return null;

  return (
    <canvas
      ref={canvasRef}
      style={{
        width,
        height,
        borderRadius: 6,
        border: "1px solid #2a2a4a",
        ...style,
      }}
    />
  );
}
