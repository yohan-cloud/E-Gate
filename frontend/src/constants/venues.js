export const FALLBACK_VENUES = [
  { id: null, name: "Function Hall", max_capacity: 50, is_active: true },
  { id: null, name: "Barangay Hall", max_capacity: 25, is_active: true },
  { id: null, name: "Sacred Heart", max_capacity: 50, is_active: true },
  { id: null, name: "Hospicio Quadrangle", max_capacity: 300, is_active: true },
  { id: null, name: "St. Joseph Hall", max_capacity: 50, is_active: true },
  { id: null, name: "Court", max_capacity: 300, is_active: true },
];

export const TBD_VENUE_VALUE = "__TBD__";
export const TBD_VENUE_NAME = "TBD";

export function normalizeVenueList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
}

export function isTbdVenueName(value) {
  return String(value || "").trim().toLowerCase() === TBD_VENUE_NAME.toLowerCase();
}
