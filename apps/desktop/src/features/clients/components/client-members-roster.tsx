import { Info, Plus } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type FormEvent, memo, useCallback, useState } from "react";
import {
  buttonClass,
  formErrorClass,
  inputClass,
  labelClass,
} from "../../../lib/ui";
import { useAuthSession } from "../../auth/use-session";
import type { ClientMember } from "../types";
import { useClientMembers } from "../use-client-members";
import { useCreateClientMember } from "../use-create-client-member";
import { useDeleteClientMember } from "../use-delete-client-member";
import { useUpdateClientMember } from "../use-update-client-member";

export function ClientMembersRoster({ clientId }: { clientId: string }) {
  const { user } = useAuthSession();
  const canManage = user?.role === "OWNER" || user?.role === "ADMIN";

  const { data: members, isLoading } = useClientMembers(clientId);
  const createMember = useCreateClientMember();

  const [isAdding, setIsAdding] = useState(false);
  const [newMemberName, setNewMemberName] = useState("");
  const [newMemberEmail, setNewMemberEmail] = useState("");
  const [newMemberImage, setNewMemberImage] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleAdd = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!newMemberName.trim()) {
        return;
      }
      setError(null);

      try {
        await createMember.mutateAsync({
          clientId,
          name: newMemberName.trim(),
          email: newMemberEmail.trim() || undefined,
          image: newMemberImage.trim() || undefined,
          role: "CONTACT",
        });

        setNewMemberName("");
        setNewMemberEmail("");
        setNewMemberImage("");
        setIsAdding(false);
      } catch (err) {
        console.error("Failed to add member:", err);
        const message =
          err instanceof Error ? err.message : "Failed to add member";
        setError(message);
      }
    },
    [clientId, createMember, newMemberEmail, newMemberImage, newMemberName]
  );

  const handleToggleAdd = useCallback(() => {
    setIsAdding((prev) => !prev);
  }, []);

  const handleCancelAdd = useCallback(() => {
    setIsAdding(false);
  }, []);

  if (isLoading) {
    return (
      <div className="flex animate-pulse gap-4">
        <div className="h-16 w-32 rounded bg-bg-subtle" />
        <div className="h-16 w-32 rounded bg-bg-subtle" />
      </div>
    );
  }

  return (
    <section className="mt-8 flex flex-col gap-4">
      <div className="flex items-center justify-between border-border-subtle border-b pb-2">
        <h2 className="m-0 font-medium text-[14px] text-fg">Team Roster</h2>
        {canManage && (
          <button
            className={buttonClass({ variant: "ghost", size: "sm" })}
            onClick={handleToggleAdd}
            type="button"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Member
          </button>
        )}
      </div>

      <AnimatePresence>
        {isAdding && (
          <motion.form
            animate={{ height: "auto", opacity: 1 }}
            className="overflow-hidden"
            exit={{ height: 0, opacity: 0 }}
            initial={{ height: 0, opacity: 0 }}
            onSubmit={handleAdd}
          >
            <div className="mb-4 grid grid-cols-1 gap-4 rounded-lg border border-border bg-bg-elevated p-4 md:grid-cols-2">
              <div className="grid gap-1.5">
                <label className={labelClass} htmlFor="add-member-name">
                  Name
                </label>
                <input
                  autoFocus
                  className={inputClass}
                  id="add-member-name"
                  onChange={(e) => setNewMemberName(e.target.value)}
                  required
                  value={newMemberName}
                />
              </div>
              <div className="grid gap-1.5">
                <label className={labelClass} htmlFor="add-member-email">
                  Email (optional)
                </label>
                <input
                  className={inputClass}
                  id="add-member-email"
                  onChange={(e) => setNewMemberEmail(e.target.value)}
                  type="email"
                  value={newMemberEmail}
                />
              </div>
              <div className="grid gap-1.5 md:col-span-2">
                <label className={labelClass} htmlFor="add-member-image">
                  Image URL (optional)
                </label>
                <input
                  className={inputClass}
                  id="add-member-image"
                  onChange={(e) => setNewMemberImage(e.target.value)}
                  placeholder="https://example.com/avatar.png"
                  type="url"
                  value={newMemberImage}
                />
              </div>
              {error ? (
                <div className="md:col-span-2">
                  <p className={formErrorClass}>{error}</p>
                </div>
              ) : null}
              <div className="mt-2 flex justify-end gap-2 md:col-span-2">
                <button
                  className={buttonClass({ variant: "ghost" })}
                  onClick={handleCancelAdd}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className={buttonClass({ variant: "primary" })}
                  disabled={createMember.isPending || !newMemberName.trim()}
                  type="submit"
                >
                  {createMember.isPending ? "Adding..." : "Save Member"}
                </button>
              </div>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {members?.length || isAdding ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          <AnimatePresence>
            {members?.map((member, i) => (
              <EditableMemberCard
                canManage={canManage}
                clientId={clientId}
                index={i}
                key={member.id}
                member={member}
              />
            ))}
          </AnimatePresence>
        </div>
      ) : (
        <div className="rounded-[var(--radius-1)] border border-border border-dashed bg-transparent p-6 text-center text-[13px] text-fg-muted">
          No team members added yet.
        </div>
      )}
    </section>
  );
}

const EditableMemberCard = memo(function EditableMemberCard({
  member,
  index,
  clientId,
  canManage,
}: {
  member: ClientMember;
  index: number;
  clientId: string;
  canManage: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(member.name);
  const [editEmail, setEditEmail] = useState(member.email || "");
  const [editImage, setEditImage] = useState(member.image || "");
  const [error, setError] = useState<string | null>(null);

  const updateMember = useUpdateClientMember();
  const deleteMember = useDeleteClientMember();

  const handleSave = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!editName.trim()) {
        return;
      }
      setError(null);

      try {
        await updateMember.mutateAsync({
          clientId,
          memberId: member.id,
          data: {
            name: editName.trim(),
            email: editEmail.trim() || undefined,
            image: editImage.trim() || undefined,
          },
        });
        setIsEditing(false);
      } catch (err) {
        console.error("Failed to update member:", err);
        const message =
          err instanceof Error ? err.message : "Failed to update member";
        setError(message);
      }
    },
    [clientId, editEmail, editImage, editName, member.id, updateMember]
  );

  const handleDelete = useCallback(async () => {
    // biome-ignore lint/suspicious/noAlert: MVP confirm
    if (!confirm(`Are you sure you want to remove ${member.name}?`)) {
      return;
    }
    setError(null);
    try {
      await deleteMember.mutateAsync({ clientId, memberId: member.id });
    } catch (err) {
      console.error("Failed to delete member:", err);
      const message =
        err instanceof Error ? err.message : "Failed to delete member";
      setError(message);
    }
  }, [clientId, deleteMember, member.id, member.name]);

  const handleCancelEdit = useCallback(() => {
    setIsEditing(false);
  }, []);

  const handleStartEdit = useCallback(() => {
    setIsEditing(true);
  }, []);

  if (isEditing) {
    return (
      <motion.form
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-3 rounded-xl border border-accent bg-bg-elevated p-4 shadow-lg"
        initial={{ opacity: 0, y: 10 }}
        onSubmit={handleSave}
      >
        <div className="grid gap-1.5">
          <label
            className={labelClass}
            htmlFor={`edit-member-name-${member.id}`}
          >
            Name
          </label>
          <input
            autoFocus
            className={inputClass}
            id={`edit-member-name-${member.id}`}
            onChange={(e) => setEditName(e.target.value)}
            required
            value={editName}
          />
        </div>
        <div className="grid gap-1.5">
          <label
            className={labelClass}
            htmlFor={`edit-member-email-${member.id}`}
          >
            Email (optional)
          </label>
          <input
            className={inputClass}
            id={`edit-member-email-${member.id}`}
            onChange={(e) => setEditEmail(e.target.value)}
            type="email"
            value={editEmail}
          />
        </div>
        <div className="grid gap-1.5">
          <label
            className={labelClass}
            htmlFor={`edit-member-image-${member.id}`}
          >
            Image URL (optional)
          </label>
          <input
            className={inputClass}
            id={`edit-member-image-${member.id}`}
            onChange={(e) => setEditImage(e.target.value)}
            placeholder="https://..."
            type="url"
            value={editImage}
          />
        </div>
        {error ? <p className={formErrorClass}>{error}</p> : null}
        <div className="mt-2 flex items-center justify-between">
          <button
            className="font-medium text-[11px] text-danger-fg transition-colors hover:text-danger-fg/80"
            onClick={handleDelete}
            type="button"
          >
            Delete
          </button>
          <div className="flex items-center gap-2">
            <button
              className={buttonClass({ variant: "ghost", size: "sm" })}
              onClick={handleCancelEdit}
              type="button"
            >
              Cancel
            </button>
            <button
              className={buttonClass({ variant: "primary", size: "sm" })}
              disabled={updateMember.isPending || !editName.trim()}
              type="submit"
            >
              Save
            </button>
          </div>
        </div>
      </motion.form>
    );
  }

  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className="group relative flex cursor-default items-center gap-3 rounded-xl border border-border bg-bg-elevated p-3 transition-all hover:border-accent/50 hover:shadow-[0_0_15px_rgba(255,255,255,0.03)]"
      initial={{ opacity: 0, y: 10 }}
      transition={{ delay: index * 0.05 }}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-gradient-to-br from-zinc-800 to-zinc-900">
        {member.image ? (
          // biome-ignore lint/performance/noImgElement: not a Next.js project
          <img
            alt={member.name}
            className="h-full w-full rounded-full object-cover"
            height={40}
            src={member.image}
            width={40}
          />
        ) : (
          <span className="font-bold text-[14px] text-fg-muted uppercase">
            {member.name.charAt(0)}
          </span>
        )}
      </div>
      <div className="flex flex-col overflow-hidden">
        <span className="truncate font-semibold text-[13px] text-fg">
          {member.name}
        </span>
        <span className="truncate text-[11px] text-fg-muted">
          {member.role.replace("_", " ")}
        </span>
      </div>

      {canManage && (
        <div className="absolute top-2 right-2 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            className="rounded bg-bg-subtle px-2 py-1 font-medium text-[10px] text-fg-muted hover:bg-bg-emphasis hover:text-fg"
            onClick={handleStartEdit}
            type="button"
          >
            Edit
          </button>
        </div>
      )}

      {/* Persona Tooltip / Indicator */}
      {member.persona && Object.keys(member.persona).length > 0 && (
        <div
          className={`absolute opacity-0 transition-opacity group-hover:opacity-100 ${
            canManage ? "top-8 right-3" : "top-3 right-3"
          }`}
        >
          <div className="relative flex h-5 w-5 items-center justify-center rounded-full bg-accent/20 text-accent">
            <Info className="h-3 w-3" />

            <div className="pointer-events-none absolute top-full right-0 z-20 mt-2 w-64 translate-y-2 rounded-xl border border-border-strong bg-bg-elevated p-4 font-medium text-[11px] text-fg-muted opacity-0 shadow-2xl transition-all group-hover:translate-y-0 group-hover:opacity-100">
              <div className="mb-3 border-border-subtle border-b pb-2 font-semibold text-[13px] text-fg">
                AI Persona Profile
              </div>
              <div className="flex flex-col gap-3">
                {member.persona.tone && (
                  <div>
                    <span className="mb-0.5 block text-[10px] text-fg-subtle uppercase tracking-wider">
                      Tone
                    </span>
                    <span className="text-fg capitalize leading-tight">
                      {member.persona.tone}
                    </span>
                  </div>
                )}
                {member.persona.communicationStyle && (
                  <div>
                    <span className="mb-0.5 block text-[10px] text-fg-subtle uppercase tracking-wider">
                      Style
                    </span>
                    <span className="text-fg leading-tight">
                      {member.persona.communicationStyle}
                    </span>
                  </div>
                )}
                {Array.isArray(member.persona.keyPriorities) &&
                  member.persona.keyPriorities.length > 0 && (
                    <div>
                      <span className="mb-1 block text-[10px] text-fg-subtle uppercase tracking-wider">
                        Key Priorities
                      </span>
                      <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
                        {member.persona.keyPriorities
                          .slice(0, 3)
                          .map((priority: string) => (
                            <li
                              className="rounded border border-accent/20 bg-accent/10 px-1.5 py-0.5 font-medium text-[9px] text-accent"
                              key={priority}
                            >
                              {priority}
                            </li>
                          ))}
                      </ul>
                    </div>
                  )}
              </div>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
});
