import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { useCreateClient } from "../../features/clients/use-create-client";
import { AppShell } from "../shared";

const createClientSchema = z.object({
  name: z.string().min(1, "Client name is required").max(255),
  slug: z
    .string()
    .min(1, "Slug is required")
    .max(100)
    .regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers, and hyphens"),
  description: z.string().max(1000).optional(),
  industry: z.string().max(100).optional(),
});

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function AddClientPage() {
  const navigate = useNavigate();
  const createClient = useCreateClient();

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [industry, setIndustry] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [slugEdited, setSlugEdited] = useState(false);

  const normalizedInput = useMemo(() => {
    return {
      name: name.trim(),
      slug: slugify(slug),
      description: description.trim() || undefined,
      industry: industry.trim() || undefined,
    };
  }, [description, industry, name, slug]);

  const validationError = useMemo(() => {
    const parsed = createClientSchema.safeParse(normalizedInput);
    if (parsed.success) {
      return null;
    }
    return parsed.error.issues[0]?.message ?? "Invalid input";
  }, [normalizedInput]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const parsed = createClientSchema.safeParse(normalizedInput);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }

    try {
      await createClient.mutateAsync(parsed.data);
      navigate("/meetings/start");
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "Could not create client";
      setError(message);
    }
  }

  return (
    <AppShell
      subtitle="Create a client for your organization"
      title="Add client"
    >
      <section className="panel form-panel">
        <form className="auth-form" onSubmit={onSubmit}>
          <label htmlFor="client-name">Client name</label>
          <input
            id="client-name"
            onChange={(event) => {
              const value = event.target.value;
              setName(value);
              if (!slugEdited) {
                setSlug(slugify(value));
              }
            }}
            type="text"
            value={name}
          />

          <label htmlFor="client-slug">Slug</label>
          <input
            id="client-slug"
            onChange={(event) => {
              setSlugEdited(true);
              setSlug(event.target.value);
            }}
            type="text"
            value={slug}
          />

          <label htmlFor="client-industry">Industry (optional)</label>
          <input
            id="client-industry"
            onChange={(event) => setIndustry(event.target.value)}
            type="text"
            value={industry}
          />

          <label htmlFor="client-description">Description (optional)</label>
          <textarea
            className="text-area-input"
            id="client-description"
            onChange={(event) => setDescription(event.target.value)}
            rows={4}
            value={description}
          />

          {error ? <p className="form-error">{error}</p> : null}

          <button
            disabled={createClient.isPending || Boolean(validationError)}
            type="submit"
          >
            {createClient.isPending ? "Creating..." : "Create client"}
          </button>
        </form>
      </section>
    </AppShell>
  );
}
