import type { Venue } from "../models/types";

export function serializeVenue(venue: Venue): string {
  return JSON.stringify(venue, null, 2);
}

export function deserializeVenue(json: string): Venue {
  return JSON.parse(json) as Venue;
}
