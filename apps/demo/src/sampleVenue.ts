import type { Venue, Section, Row, Seat } from "@ticketok/seatmap-core";

function createRow(
  rowId: string,
  label: string,
  seatCount: number,
  yOffset: number,
  categoryId: string,
  spacing = 20,
): Row {
  const seats: Seat[] = [];
  const startX = -(seatCount - 1) * spacing * 0.5;

  for (let i = 0; i < seatCount; i++) {
    seats.push({
      id: `${rowId}-s${i + 1}`,
      label: `${i + 1}`,
      position: { x: startX + i * spacing, y: yOffset },
      status: Math.random() > 0.15 ? "available" : "sold",
      categoryId,
    });
  }

  return { id: rowId, label, seats };
}

function createSection(
  id: string,
  label: string,
  x: number,
  y: number,
  rotation: number,
  categoryId: string,
  rowCount: number,
  seatsPerRow: number,
): Section {
  const rows: Row[] = [];
  for (let r = 0; r < rowCount; r++) {
    const rowLabel = String.fromCharCode(65 + r);
    rows.push(
      createRow(`${id}-r${r}`, rowLabel, seatsPerRow, r * 22, categoryId),
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
  id: "venue-1",
  name: "Demo Arena",
  bounds: { width: 1200, height: 900 },
  categories: [
    { id: "cat-vip", name: "VIP", color: "#e91e63" },
    { id: "cat-premium", name: "Premium", color: "#ff9800" },
    { id: "cat-standard", name: "Standard", color: "#4caf50" },
    { id: "cat-economy", name: "Economy", color: "#2196f3" },
  ],
  sections: [
    createSection("sec-center", "Center Orchestra", 600, 500, 0, "cat-vip", 8, 20),
    createSection("sec-left", "Left Orchestra", 250, 520, 0.15, "cat-premium", 6, 14),
    createSection("sec-right", "Right Orchestra", 950, 520, -0.15, "cat-premium", 6, 14),
    createSection("sec-balcony-c", "Center Balcony", 600, 200, 0, "cat-standard", 5, 24),
    createSection("sec-balcony-l", "Left Balcony", 250, 230, 0.1, "cat-economy", 4, 16),
    createSection("sec-balcony-r", "Right Balcony", 950, 230, -0.1, "cat-economy", 4, 16),
  ],
  gaAreas: [],
  tables: [],
};
