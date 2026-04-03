import { generateId } from "@nex125/seatmap-core";
import type { Venue, Section, Row, Seat } from "@nex125/seatmap-core";

function createRow(
  label: string,
  seatCount: number,
  yOffset: number,
  categoryId: string,
  spacing = 20,
  rowIndex = 0,
): Row {
  const rowId = generateId();
  const seats: Seat[] = [];
  const startX = -(seatCount - 1) * spacing * 0.5;

  for (let i = 0; i < seatCount; i++) {
    const seatIndex = rowIndex * seatCount + i;
    const status = seatIndex % 11 === 0 ? "booked" : seatIndex % 7 === 0 ? "locked" : "available";
    seats.push({
      id: generateId(),
      label: `${i + 1}`,
      position: { x: startX + i * spacing, y: yOffset },
      status,
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
      createRow(rowLabel, seatsPerRow, r * 22, categoryId, 20, r),
    );
  }

  const width = Math.max(80, (seatsPerRow - 1) * 20 + 36);
  const height = Math.max(60, (rowCount - 1) * 22 + 44);
  return {
    id,
    label,
    kind: "section",
    position: { x, y },
    rotation,
    categoryId,
    rows,
    outline: [
      { x: -width / 2, y: -height / 2 },
      { x: width / 2, y: -height / 2 },
      { x: width / 2, y: height / 2 },
      { x: -width / 2, y: height / 2 },
    ],
  };
}

export const sampleVenue: Venue = {
  id: generateId(),
  name: "Small Hall",
  bounds: { width: 980, height: 640 },
  categories: [
    { id: "cat-vip", name: "VIP", color: "#ef476f", backendPrice: 189 },
    { id: "cat-front", name: "Front", color: "#f78c36", backendPrice: 129 },
    { id: "cat-side", name: "Side", color: "#3da5d9", backendPrice: 89 },
    { id: "cat-dance", name: "Dancefloor", color: "#06d6a0", backendPrice: 109 },
  ],
  seatStatuses: [
    { id: "available", name: "Available", color: "#4caf50" },
    { id: "locked", name: "Locked", color: "#f44336" },
    { id: "booked", name: "Booked", color: "#9e9e9e" },
  ],
  sections: [
    {
      id: generateId(),
      label: "Main Stage",
      kind: "stage",
      position: { x: 490, y: 95 },
      rotation: 0,
      categoryId: "",
      rows: [],
      outline: [
        { x: -170, y: -35 },
        { x: 170, y: -35 },
        { x: 150, y: 38 },
        { x: -150, y: 38 },
      ],
    },
    {
      id: generateId(),
      label: "Dancefloor",
      kind: "dancefloor",
      position: { x: 490, y: 250 },
      rotation: 0,
      categoryId: "cat-dance",
      rows: [
        {
          id: generateId(),
          label: "DF",
          seats: [
            {
              id: generateId(),
              label: "Dancefloor",
              position: { x: 0, y: 0 },
              status: "available",
              categoryId: "cat-dance",
            },
          ],
        },
      ],
      outline: [
        { x: -170, y: -78 },
        { x: 170, y: -78 },
        { x: 170, y: 78 },
        { x: -170, y: 78 },
      ],
    },
    createSection("Front Left", 325, 410, -0.06, "cat-front", 4, 9),
    createSection("Front Right", 655, 410, 0.06, "cat-front", 4, 9),
    createSection("VIP Center", 490, 445, 0, "cat-vip", 5, 10),
    createSection("Upper Left", 250, 535, -0.08, "cat-side", 4, 8),
    createSection("Upper Right", 730, 535, 0.08, "cat-side", 4, 8),
  ],
  gaAreas: [],
  tables: [],
};
