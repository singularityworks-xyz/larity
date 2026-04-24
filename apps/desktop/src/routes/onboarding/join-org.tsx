import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { api } from "../../lib/api";
import { authClient } from "../../lib/auth-client";
import { AppShell } from "../shared";

const joinOrgSchema = z.object({
  code: z.string().min(6, "Enter a valid invite code").max(64),
});

export function OnboardingJoinOrgPage() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validationError = useMemo(() => {
    const parsed = joinOrgSchema.safeParse({ code });
    if (parsed.success) {
      return null;
    }
    return parsed.error.issues[0]?.message ?? "Invalid code";
  }, [code]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsed = joinOrgSchema.safeParse({ code });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid code");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await api.post("/orgs/join", {
        code: parsed.data.code.trim(),
      });

      await authClient.getSession({
        query: {
          disableCookieCache: true,
        },
      });

      navigate("/dashboard");
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "Could not join org";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AppShell title="Join organization">
      <section className="panel form-panel">
        <form className="auth-form" onSubmit={onSubmit}>
          <label htmlFor="invite-code">Invite code</label>
          <input
            id="invite-code"
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            type="text"
            value={code}
          />

          {error ? <p className="form-error">{error}</p> : null}

          <button
            disabled={isSubmitting || Boolean(validationError)}
            type="submit"
          >
            {isSubmitting ? "Joining..." : "Join organization"}
          </button>
        </form>
      </section>
    </AppShell>
  );
}
