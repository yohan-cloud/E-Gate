export const AUDIENCE_OPTIONS = [
  { value: "all", label: "All Audience" },
  { value: "kids_only", label: "Kids / Teens", group: "Age Group" },
  { value: "adult_only", label: "Adults", group: "Age Group" },
  { value: "senior_only", label: "Senior Citizens", group: "Age Group" },
  { value: "resident_only", label: "Residents", group: "Status" },
  { value: "client_only", label: "Clients", group: "Status" },
  { value: "registered_voter_only", label: "Registered Here", group: "Voter Status" },
  { value: "not_yet_voter_only", label: "Not Yet Voters", group: "Voter Status" },
];

export const AUDIENCE_LABELS = Object.fromEntries(AUDIENCE_OPTIONS.map((option) => [option.value, option.label]));

export function parseAudienceValue(value) {
  if (!value || value === "all") return ["all"];
  const parsed = String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return parsed.length ? parsed : ["all"];
}

export function stringifyAudienceValue(values) {
  const unique = [...new Set(values.filter(Boolean))];
  if (unique.length === 0 || unique.includes("all")) return "all";
  return unique.join(",");
}
