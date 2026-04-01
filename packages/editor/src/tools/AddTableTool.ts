import type { Viewport, CommandHistory, Table, Seat } from "@nex125/seatmap-core";
import { generateId } from "@nex125/seatmap-core";
import type { SeatmapStore } from "@nex125/seatmap-react";
import { BaseTool, type ToolPointerEvent } from "./BaseTool";

export class AddTableTool extends BaseTool {
  readonly name = "add-table";
  readonly cursor = "crosshair";

  shape: "round" | "rectangular" = "round";
  seatsPerTable = 8;
  tableRadius = 40;
  categoryId = "";

  constructor(private history: CommandHistory) {
    super();
  }

  onPointerDown(e: ToolPointerEvent, _viewport: Viewport, store: SeatmapStore): void {
    const venue = store.getState().venue;
    if (!venue) return;

    const seats: Seat[] = [];
    for (let i = 0; i < this.seatsPerTable; i++) {
      const angle = (Math.PI * 2 * i) / this.seatsPerTable - Math.PI / 2;
      seats.push({
        id: generateId(),
        label: `${i + 1}`,
        position: {
          x: Math.cos(angle) * this.tableRadius,
          y: Math.sin(angle) * this.tableRadius,
        },
        status: "available",
        categoryId: this.categoryId,
      });
    }

    const table: Table = {
      id: generateId(),
      label: `Table ${Date.now().toString(36).slice(-3).toUpperCase()}`,
      position: { x: e.worldX, y: e.worldY },
      shape: this.shape,
      seats,
      categoryId: this.categoryId,
    };

    this.history.execute({
      description: `Add table "${table.label}"`,
      execute: () => {
        const v = store.getState().venue;
        if (!v) return;
        store.getState().setVenue({
          ...v,
          tables: [...v.tables, table],
        });
      },
      undo: () => {
        const v = store.getState().venue;
        if (!v) return;
        store.getState().setVenue({
          ...v,
          tables: v.tables.filter((t) => t.id !== table.id),
        });
      },
    });
  }
}
