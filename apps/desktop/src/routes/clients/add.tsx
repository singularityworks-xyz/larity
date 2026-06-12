import { Plus, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { useCreateClient } from "../../features/clients/use-create-client";
import { api } from "../../lib/api";
import {
  buttonClass,
  formClass,
  formErrorClass,
  formPanelClass,
  inputClass,
  labelClass,
  textareaClass,
} from "../../lib/ui";
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

interface PendingMember {
  id: string;
  name: string;
  role: string;
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

  // Pending members state
  const [pendingMembers, setPendingMembers] = useState<PendingMember[]>([]);
  const [newMemberName, setNewMemberName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

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

  function handleAddMember() {
    if (!newMemberName.trim()) {
      return;
    }
    setPendingMembers((prev) => [
      ...prev,
      { id: crypto.randomUUID(), name: newMemberName.trim(), role: "CONTACT" },
    ]);
    setNewMemberName("");
  }

  function handleRemoveMember(id: string) {
    setPendingMembers((prev) => prev.filter((m) => m.id !== id));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const parsed = createClientSchema.safeParse(normalizedInput);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }

    let createdClient: { id: string } | null = null;
    try {
      setIsCreating(true);
      const client = await createClient.mutateAsync(parsed.data);
      createdClient = client;

      // Create all pending members sequentially
      for (const member of pendingMembers) {
        await api.post(`/clients/${client.id}/members`, {
          name: member.name,
          role: "CONTACT",
        });
      }

      navigate("/meetings/start");
    } catch (requestError) {
      if (createdClient) {
        try {
          await api.delete(`/clients/${createdClient.id}`);
        } catch (rollbackError) {
          console.error(
            "Rollback failed for client:",
            createdClient.id,
            rollbackError
          );
        }
      }
      const message =
        requestError instanceof Error
          ? requestError.message
          : "Could not create client";
      setError(message);
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <AppShell
      subtitle="Create a client and add their key stakeholders"
      title="Add client"
    >
      <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-2">
        {/* Left Column: Client Details */}
        <section className={formPanelClass}>
          <div className="mb-4 border-white/5 border-b pb-2">
            <h2 className="m-0 font-semibold text-fg text-sm tracking-wide">
              Client Details
            </h2>
          </div>
          <form
            className={formClass}
            id="create-client-form"
            onSubmit={onSubmit}
          >
            <label className={labelClass} htmlFor="client-name">
              Client name
            </label>
            <input
              className={inputClass}
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

            <label className={labelClass} htmlFor="client-slug">
              Slug
            </label>
            <input
              className={inputClass}
              id="client-slug"
              onChange={(event) => {
                setSlugEdited(true);
                setSlug(event.target.value);
              }}
              type="text"
              value={slug}
            />

            <label className={labelClass} htmlFor="client-industry">
              Industry (optional)
            </label>
            <input
              className={inputClass}
              id="client-industry"
              onChange={(event) => setIndustry(event.target.value)}
              type="text"
              value={industry}
            />

            <label className={labelClass} htmlFor="client-description">
              Description (optional)
            </label>
            <textarea
              className={textareaClass}
              id="client-description"
              onChange={(event) => setDescription(event.target.value)}
              rows={4}
              value={description}
            />
            {error ? <p className={formErrorClass}>{error}</p> : null}
          </form>
        </section>

        {/* Right Column: Initial Team Members */}
        <section className={`${formPanelClass} flex h-full flex-col`}>
          <div className="mb-4 border-white/5 border-b pb-2">
            <h2 className="m-0 font-semibold text-fg text-sm tracking-wide">
              Initial Team
            </h2>
          </div>

          <div className="flex flex-1 flex-col gap-4">
            <div className="flex items-end gap-2">
              <div className="grid flex-1 gap-1">
                <label className={labelClass} htmlFor="member-name">
                  Member Name
                </label>
                <input
                  className={inputClass}
                  id="member-name"
                  onChange={(e) => setNewMemberName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddMember();
                    }
                  }}
                  placeholder="e.g. Jane Doe"
                  type="text"
                  value={newMemberName}
                />
              </div>
              <button
                className={buttonClass({ variant: "secondary" })}
                onClick={handleAddMember}
                type="button"
              >
                <Plus className="h-4 w-4" />
                Add
              </button>
            </div>

            <div className="min-h-[150px] flex-1 overflow-y-auto rounded-lg border border-white/5 bg-black/20 p-3">
              {pendingMembers.length === 0 ? (
                <div className="flex h-full items-center justify-center text-fg-muted text-xs italic">
                  No members added yet.
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <AnimatePresence>
                    {pendingMembers.map((member) => (
                      <motion.div
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        className="flex items-center gap-2 rounded-full border border-border bg-bg-emphasis px-3 py-1.5 shadow-[0_0_15px_rgba(255,255,255,0.03)] transition-shadow hover:shadow-[0_0_20px_rgba(255,255,255,0.06)]"
                        exit={{ opacity: 0, scale: 0.8, y: -10 }}
                        initial={{ opacity: 0, scale: 0.8, y: 10 }}
                        key={member.id}
                        layout
                        transition={{
                          type: "spring",
                          stiffness: 400,
                          damping: 25,
                        }}
                      >
                        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 font-bold text-[9px] text-white uppercase">
                          {member.name.charAt(0)}
                        </div>
                        <span className="font-medium text-fg text-xs">
                          {member.name}
                        </span>
                        <button
                          className="ml-1 p-0.5 text-fg-subtle transition-colors hover:text-danger-fg"
                          onClick={() => handleRemoveMember(member.id)}
                          type="button"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 flex justify-end border-white/5 border-t pt-4">
            <button
              className={buttonClass()}
              disabled={isCreating || Boolean(validationError)}
              form="create-client-form"
              type="submit"
            >
              {isCreating ? "Saving everything..." : "Complete Setup"}
            </button>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
