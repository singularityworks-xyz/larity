import { Bell, Calendar, Mic, MonitorUp, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";

export function WelcomePage() {
  return (
    <div className="welcome-page">
      <div className="welcome-hero">
        <h1 className="welcome-mark">Larity</h1>
        <p className="welcome-tagline">Work, with memory.</p>
      </div>

      <div className="welcome-actions">
        <Link className="btn btn-primary btn-lg" to="/login">
          Sign In
        </Link>
        <Link className="btn btn-secondary btn-lg" to="/register">
          Create Account
        </Link>
      </div>

      <div className="welcome-permissions">
        <h3 className="welcome-permissions-header">What Larity needs</h3>

        <div className="permission-row">
          <Mic size={14} />
          <span>Microphone access for voice detection and assistant</span>
        </div>
        <div className="permission-row">
          <MonitorUp size={14} />
          <span>
            System audio loopback for meeting capture (supported platforms)
          </span>
        </div>
        <div className="permission-row">
          <Calendar size={14} />
          <span>
            Calendar access to sync upcoming meetings
            <span className="badge badge-outline" style={{ marginLeft: 6 }}>
              coming later
            </span>
          </span>
        </div>
        <div className="permission-row">
          <Bell size={14} />
          <span>Notifications for meeting alerts and reminders</span>
        </div>
        <div className="permission-row">
          <ShieldCheck size={14} />
          <span>
            All permissions are requested during setup — you stay in control
          </span>
        </div>
      </div>
    </div>
  );
}
