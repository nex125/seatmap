import { generateId } from "@nex125/seatmap-core";
import type { Venue, Section, Row, Seat } from "@nex125/seatmap-core";

function createRow(
  label: string,
  seatCount: number,
  yOffset: number,
  categoryId: string,
  spacing = 20,
): Row {
  const rowId = generateId();
  const seats: Seat[] = [];
  const startX = -(seatCount - 1) * spacing * 0.5;

  for (let i = 0; i < seatCount; i++) {
    seats.push({
      id: generateId(),
      label: `${i + 1}`,
      position: { x: startX + i * spacing, y: yOffset },
      status: Math.random() > 0.15 ? "available" : "booked",
      categoryId,
    });
  }

  return { id: rowId, label, seats };
}

function createSection(
  label: string,
  x: number,
  y: number,
  rotation: number,
  categoryId: string,
  rowCount: number,
  seatsPerRow: number,
): Section {
  const id = generateId();
  const rows: Row[] = [];
  for (let r = 0; r < rowCount; r++) {
    const rowLabel = String.fromCharCode(65 + r);
    rows.push(
      createRow(rowLabel, seatsPerRow, r * 22, categoryId),
    );
  }

  return {
    id,
    label,
    position: { x, y },
    rotation,
    categoryId,
    rows,
    outline: [],
  };
}

export const sampleVenue: Venue = {
  id: generateId(),
  name: "Demo Arena",
  bounds: { width: 1200, height: 900 },
  categories: [
    { id: "cat-vip", name: "VIP", color: "#e91e63" },
    { id: "cat-premium", name: "Premium", color: "#ff9800" },
    { id: "cat-standard", name: "Standard", color: "#4caf50" },
    { id: "cat-economy", name: "Economy", color: "#2196f3" },
  ],
  seatStatuses: [
    { id: "available", name: "Available", color: "#4caf50" },
    { id: "locked", name: "Locked", color: "#f44336" },
    { id: "booked", name: "Booked", color: "#9e9e9e" },
  ],
  sections: [
    createSection("Center Orchestra", 600, 500, 0, "cat-vip", 8, 20),
    createSection("Left Orchestra", 250, 520, 0.15, "cat-premium", 6, 14),
    createSection("Right Orchestra", 950, 520, -0.15, "cat-premium", 6, 14),
    createSection("Center Balcony", 600, 200, 0, "cat-standard", 5, 24),
    createSection("Left Balcony", 250, 230, 0.1, "cat-economy", 4, 16),
    createSection("Right Balcony", 950, 230, -0.1, "cat-economy", 4, 16),
  ],
  gaAreas: [],
  tables: [],
};
