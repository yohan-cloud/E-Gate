import { Link } from "react-router-dom";

const PORTALS = [
  {
    to: "/admin/login",
    title: "Admin Portal",
    copy: "Manage users, reports, events, and approvals.",
    cta: "Enter Portal",
    badge: "A",
    tone: "admin",
  },
  {
    to: "/resident/login",
    title: "Resident Portal",
    copy: "Access profile, ID, event registration, and requests.",
    cta: "Enter Portal",
    badge: "R",
    tone: "resident",
  },
  {
    to: "/gate/login",
    title: "Guest / Scanner",
    copy: "Quick entry for scanning and attendance.",
    cta: "Enter Portal",
    badge: "G",
    tone: "gate",
  },
];

export default function Landing() {
  return (
    <div className="landing-shell">
      <div className="card landing-card landing-card-compact">
        <div className="landing-kicker landing-kicker-soft">Welcome</div>
        <h2 className="landing-title">Choose your portal</h2>
        <p className="landing-copy">Select an option to continue to your dashboard.</p>
        <div className="landing-grid">
          {PORTALS.map((portal) => (
            <Link key={portal.to} className="landing-link" to={portal.to}>
              <div className={`landing-panel landing-panel-compact ${portal.tone}`}>
                <div className="landing-panel-top">
                  <div className={`landing-panel-icon ${portal.tone}`}>{portal.badge}</div>
                  <div className="landing-panel-content">
                    <div className="landing-panel-title">{portal.title}</div>
                    <div className="landing-panel-copy">{portal.copy}</div>
                  </div>
                  <div className="landing-panel-arrow" aria-hidden="true">›</div>
                </div>
                <div className={`landing-panel-cta ${portal.tone}`}>{portal.cta}</div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
