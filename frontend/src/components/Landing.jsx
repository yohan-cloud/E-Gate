import { Link } from "react-router-dom";

export default function Landing() {
  return (
    <div className="landing-shell">
      <div className="card landing-card">
        <div className="landing-kicker">Barangay 663-A Identification System</div>
        <h2 style={{ marginTop: 0 }}>Choose Your Portal</h2>
        <p>Admin, resident, and gate operations now each have their own route and workspace.</p>
        <div className="landing-grid">
          <Link className="landing-link" to="/admin/login">
            <div className="landing-panel">
              <div className="landing-panel-title">Admin Portal</div>
              <div className="landing-panel-copy">Events, analytics, verifications, and resident management.</div>
            </div>
          </Link>
          <Link className="landing-link" to="/resident/login">
            <div className="landing-panel">
              <div className="landing-panel-title">Resident Portal</div>
              <div className="landing-panel-copy">Registrations, profile, event browsing, and verification.</div>
            </div>
          </Link>
          <Link className="landing-link" to="/gate/login">
            <div className="landing-panel">
              <div className="landing-panel-title">Gate Portal</div>
              <div className="landing-panel-copy">Scanner station with a live entry log and event selection.</div>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
