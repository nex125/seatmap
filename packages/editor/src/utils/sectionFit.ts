import type { Section, Vec2 } from "@nex125/seatmap-core";

const DEFAULT_SEAT_RADIUS = 7;
const SECTION_BORDER_PADDING_SEATS = 0.75;

export function getSectionFitPadding(): number {
  return DEFAULT_SEAT_RADIUS * (1 + SECTION_BORDER_PADDING_SEATS * 2);
}

export function getSectionSeatLocalBounds(section: Pick<Section, "rows">): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} | null {
  const seats = section.rows.flatMap((row) => row.seats);
  if (seats.length === 0) return null;

  return seats.reduce(
    (bounds, seat) => ({
      minX: Math.min(bounds.minX, seat.position.x),
      minY: Math.min(bounds.minY, seat.position.y),
      maxX: Math.max(bounds.maxX, seat.position.x),
      maxY: Math.max(bounds.maxY, seat.position.y),
    }),
    {
      minX: seats[0]!.position.x,
      minY: seats[0]!.position.y,
      maxX: seats[0]!.position.x,
      maxY: seats[0]!.position.y,
    },
  );
}

export function buildSectionOutlineToFitSeats(
  section: Pick<Section, "rows">,
  padding = getSectionFitPadding(),
): Vec2[] | null {
  const bounds = getSectionSeatLocalBounds(section);
  if (!bounds) return null;

  return [
    { x: bounds.minX - padding, y: bounds.minY - padding },
    { x: bounds.maxX + padding, y: bounds.minY - padding },
    { x: bounds.maxX + padding, y: bounds.maxY + padding },
    { x: bounds.minX - padding, y: bounds.maxY + padding },
  ];
}
