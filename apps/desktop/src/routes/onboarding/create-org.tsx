import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { api } from "../../lib/api";
import { authClient } from "../../lib/auth-client";
import { AppShell } from "../shared";

const createOrgSchema = z.object({
  name: z.string().min(2, "Organization name is required"),
  slug: z
    .string()
    .min(2, "Slug is required")
    .regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers, and hyphens"),
});

export function OnboardingCreateOrgPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validationError = useMemo(() => {
    const parsed = createOrgSchema.safeParse({ name, slug });
    if (parsed.success) {
      return null;
    }
    return parsed.error.issues[0]?.message ?? "Invalid input";
  }, [name, slug]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsed = createOrgSchema.safeParse({ name, slug });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await api.post("/orgs", parsed.data);
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
          : "Could not create organization";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AppShell title="Create organization">
      <section className="panel form-panel">
        <form className="auth-form" onSubmit={onSubmit}>
          <label htmlFor="org-name">Organization name</label>
          <input
            id="org-name"
            onChange={(event) => {
              const value = event.target.value;
              setName(value);
              if (!slug) {
                setSlug(
                  value
                    .toLowerCase()
                    .replace(/\s+/g, "-")
                    .replace(/[^a-z0-9-]/g, "")
                );
              }
            }}
            type="text"
            value={name}
          />

          <label htmlFor="org-slug">Slug</label>
          <input
            id="org-slug"
            onChange={(event) => setSlug(event.target.value)}
            type="text"
            value={slug}
          />

          {error ? <p className="form-error">{error}</p> : null}

          <button
            disabled={isSubmitting || Boolean(validationError)}
            type="submit"
          >
            {isSubmitting ? "Creating..." : "Create and continue"}
          </button>
        </form>
      </section>
    </AppShell>
  );
}
