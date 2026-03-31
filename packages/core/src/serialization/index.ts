import type { Venue } from "../models/types";
import { normalizeVenue } from "../models/helpers";

export function serializeVenue(venue: Venue): string {
  return JSON.stringify(venue, null, 2);
}

export function deserializeVenue(json: string): Venue {
  return normalizeVenue(JSON.parse(json) as Venue);
}
