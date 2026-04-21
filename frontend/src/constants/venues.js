export const FALLBACK_VENUES = [
  { id: null, name: "Function Hall", max_capacity: 50, is_active: true },
  { id: null, name: "Barangay Hall", max_capacity: 25, is_active: true },
  { id: null, name: "Sacred Heart", max_capacity: 50, is_active: true },
  { id: null, name: "Hospicio Quadrangle", max_capacity: 300, is_active: true },
  { id: null, name: "St. Joseph Hall", max_capacity: 50, is_active: true },
  { id: null, name: "Court", max_capacity: 300, is_active: true },
];

export function normalizeVenueList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
}

export function buildVenueCapacityMap(venues) {
  return Object.fromEntries((venues || []).map((venue) => [venue.name, venue.max_capacity]));
}
