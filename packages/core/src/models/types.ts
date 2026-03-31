export interface Vec2 {
  x: number;
  y: number;
}

export interface Bounds {
  width: number;
  height: number;
}

export interface AABB {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export type SeatStatus = string;

export interface SeatStatusDefinition {
  id: string;
  name: string;
  color: string;
}

export interface PricingCategory {
  id: string;
  name: string;
  color: string;
}

export interface Seat {
  id: string;
  label: string;
  position: Vec2;
  status: SeatStatus;
  categoryId: string;
}

export interface Row {
  id: string;
  label: string;
  seats: Seat[];
}

export interface Section {
  id: string;
  label: string;
  position: Vec2;
  rotation: number;
  categoryId: string;
  rows: Row[];
  outline: Vec2[];
}

export interface GeneralAdmissionArea {
  id: string;
  label: string;
  shape: Vec2[];
  capacity: number;
  categoryId: string;
}

export interface Table {
  id: string;
  label: string;
  position: Vec2;
  shape: "round" | "rectangular";
  seats: Seat[];
  categoryId: string;
}

export interface Venue {
  id: string;
  name: string;
  bounds: Bounds;
  backgroundImage?: string;
  backgroundImageOpacity?: number;
  sections: Section[];
  gaAreas: GeneralAdmissionArea[];
  tables: Table[];
  categories: PricingCategory[];
  seatStatuses: SeatStatusDefinition[];
}
