export const FALLBACK_VENUES = [
  { id: null, name: "Function Hall", city: "Barangay 663-A", address: "", max_capacity: 50, is_active: true },
  { id: null, name: "Barangay Hall", city: "Barangay 663-A", address: "Covered Court", max_capacity: 25, is_active: true },
  { id: null, name: "Sacred Heart", city: "Barangay 663-A", address: "", max_capacity: 50, is_active: true },
  { id: null, name: "Hospicio Quadrangle", city: "Barangay 663-A", address: "", max_capacity: 300, is_active: true },
  { id: null, name: "St. Joseph Hall", city: "Barangay 663-A", address: "", max_capacity: 50, is_active: true },
  { id: null, name: "Court", city: "Barangay 663-A", address: "", max_capacity: 300, is_active: true },
];

export const TBD_VENUE_VALUE = "__TBD__";
export const TBD_VENUE_NAME = "TBD";

export function normalizeVenueList(payload) {
  const rows = Array.isArray(payload) ? payload : Array.isArray(payload?.results) ? payload.results : [];
  return rows.map((venue) => ({
    ...venue,
    city: venue.city || "",
    address: venue.address || "",
  }));
}

export function isTbdVenueName(value) {
  return String(value || "").trim().toLowerCase() === TBD_VENUE_NAME.toLowerCase();
}

export function venueLocationLabel(venue) {
  const parts = [venue?.address, venue?.city].map((part) => String(part || "").trim()).filter(Boolean);
  return parts.join(", ");
}

export function venueOptionLabel(venue) {
  const capacity = venue?.max_capacity || "no capacity";
  return `${venue?.name || "Venue"} (${capacity})`;
}

export function venueFullLabel(venue) {
  const location = venueLocationLabel(venue);
  return location ? `${venue?.name || "Venue"} - ${location}` : venue?.name || "Venue";
}
