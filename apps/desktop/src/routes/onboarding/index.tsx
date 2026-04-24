import { Link } from "react-router-dom";
import { AppShell } from "../shared";

export function OnboardingHomePage() {
  return (
    <AppShell
      subtitle="Set up your organization before starting meetings"
      title="Organization onboarding"
    >
      <section className="panel onboarding-grid">
        <article className="choice-card">
          <p className="eyebrow">Option 1</p>
          <h2>Create an organization</h2>
          <p>
            Start a fresh workspace for your team, then invite teammates with
            invite codes.
          </p>
          <Link className="button-link" to="/onboarding/create-org">
            Create organization
          </Link>
        </article>

        <article className="choice-card">
          <p className="eyebrow">Option 2</p>
          <h2>Join with invite code</h2>
          <p>
            Enter the invite code shared by your admin to join an existing
            organization.
          </p>
          <Link className="button-link" to="/onboarding/join-org">
            Join organization
          </Link>
        </article>
      </section>
    </AppShell>
  );
}
