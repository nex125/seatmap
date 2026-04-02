import { generateId } from "@nex125/seatmap-core";
import type { Venue, Section, Row, Seat, PricingCategory } from "@nex125/seatmap-core";

const CATEGORIES: PricingCategory[] = [
  { id: "cat-vip", name: "VIP", color: "#e91e63", backendPrice: 249 },
  { id: "cat-premium", name: "Premium", color: "#ff9800", backendPrice: 159 },
  { id: "cat-standard", name: "Standard", color: "#4caf50", backendPrice: 89 },
  { id: "cat-economy", name: "Economy", color: "#2196f3", backendPrice: 49 },
  { id: "cat-upper", name: "Upper Deck", color: "#9c27b0", backendPrice: 35 },
];

/**
 * Generates a stadium-scale venue with the specified approximate seat count.
 * Used for performance testing the rendering pipeline.
 */
export function generateLargeVenue(targetSeatCount: number): Venue {
  const sections: Section[] = [];

  const seatsPerRow = 30;
  const rowsPerSection = 15;
  const seatsPerSection = seatsPerRow * rowsPerSection;
  const numSections = Math.ceil(targetSeatCount / seatsPerSection);

  const cols = Math.ceil(Math.sqrt(numSections * 1.5));
  const sectionWidth = seatsPerRow * 20 + 40;
  const sectionHeight = rowsPerSection * 22 + 40;

  let seatCounter = 0;

  for (let i = 0; i < numSections && seatCounter < targetSeatCount; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const catIdx = row % CATEGORIES.length;

    const rows: Row[] = [];
    for (let r = 0; r < rowsPerSection && seatCounter < targetSeatCount; r++) {
      const seats: Seat[] = [];
      const startX = -((seatsPerRow - 1) * 20) / 2;
      for (let s = 0; s < seatsPerRow && seatCounter < targetSeatCount; s++) {
        seats.push({
          id: generateId(),
          label: `${s + 1}`,
          position: { x: startX + s * 20, y: r * 22 },
          status: Math.random() > 0.1 ? "available" : "booked",
          categoryId: CATEGORIES[catIdx].id,
        });
        seatCounter++;
      }

      rows.push({
        id: generateId(),
        label: String.fromCharCode(65 + r),
        seats,
      });
    }

    sections.push({
      id: generateId(),
      label: `Section ${i + 1}`,
      position: {
        x: col * (sectionWidth + 30) + sectionWidth / 2,
        y: row * (sectionHeight + 30) + sectionHeight / 2,
      },
      rotation: 0,
      categoryId: CATEGORIES[catIdx].id,
      rows,
      outline: [],
    });
  }

  const totalSeats = sections.reduce(
    (t, s) => t + s.rows.reduce((rt, r) => rt + r.seats.length, 0),
    0,
  );

  return {
    id: generateId(),
    name: `Stadium (${totalSeats.toLocaleString()} seats)`,
    bounds: { width: cols * (sectionWidth + 30), height: Math.ceil(numSections / cols) * (sectionHeight + 30) },
    categories: CATEGORIES,
    seatStatuses: [
      { id: "available", name: "Available", color: "#4caf50" },
      { id: "locked", name: "Locked", color: "#f44336" },
      { id: "booked", name: "Booked", color: "#9e9e9e" },
    ],
    sections,
    gaAreas: [],
    tables: [],
  };
}
