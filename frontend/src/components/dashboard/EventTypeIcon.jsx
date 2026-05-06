const EVENT_TYPE_META = {
  mandatory_governance_meetings: {
    label: "Mandatory Governance Meetings",
    shortLabel: "GOV",
    tone: "governance",
    icon: GovernanceIcon,
  },
  health_and_social_services: {
    label: "Health and Social Services",
    shortLabel: "HLT",
    tone: "health",
    icon: HealthIcon,
  },
  community_events: {
    label: "Community Events",
    shortLabel: "COM",
    tone: "community",
    icon: CommunityIcon,
  },
  operations_and_compliance: {
    label: "Operations and Compliance",
    shortLabel: "OPS",
    tone: "compliance",
    icon: ComplianceIcon,
  },
};

export function getEventTypeMeta(eventType) {
  return EVENT_TYPE_META[eventType] || {
    label: "Barangay Event",
    shortLabel: "EVT",
    tone: "default",
    icon: CalendarIcon,
  };
}

export default function EventTypeIcon({ eventType }) {
  const meta = getEventTypeMeta(eventType);
  const Icon = meta.icon;

  return (
    <div className="event-type-icon" data-event-tone={meta.tone} title={meta.label} aria-label={meta.label}>
      <Icon />
      <span>{meta.shortLabel}</span>
    </div>
  );
}

function SvgFrame({ children }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

function GovernanceIcon() {
  return (
    <SvgFrame>
      <path d="M7 4h7l3 3v13H7z" />
      <path d="M14 4v4h4" />
      <path d="M9.5 11h5" />
      <path d="M9.5 14h5" />
      <path d="M9.5 17h3" />
    </SvgFrame>
  );
}

function HealthIcon() {
  return (
    <SvgFrame>
      <path d="M12 20s-7-4.35-7-10a4 4 0 0 1 7-2.65A4 4 0 0 1 19 10c0 5.65-7 10-7 10z" />
      <path d="M12 8v6" />
      <path d="M9 11h6" />
    </SvgFrame>
  );
}

function CommunityIcon() {
  return (
    <SvgFrame>
      <path d="M8.5 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
      <path d="M15.5 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
      <path d="M4.5 19v-1.4c0-2.2 1.8-4 4-4s4 1.8 4 4V19" />
      <path d="M11.5 19v-1.4c0-2.2 1.8-4 4-4s4 1.8 4 4V19" />
    </SvgFrame>
  );
}

function ComplianceIcon() {
  return (
    <SvgFrame>
      <path d="M12 3l7 3v5c0 4.6-2.9 8.2-7 10-4.1-1.8-7-5.4-7-10V6z" />
      <path d="M8.5 12.2l2.2 2.2 4.8-5" />
    </SvgFrame>
  );
}

function CalendarIcon() {
  return (
    <SvgFrame>
      <path d="M7 3v4" />
      <path d="M17 3v4" />
      <path d="M5 6h14v14H5z" />
      <path d="M5 10h14" />
    </SvgFrame>
  );
}
