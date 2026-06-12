import { Info, Plus } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { buttonClass, inputClass, labelClass } from "../../../lib/ui";
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

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newMemberName.trim()) {
      return;
    }

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
  }

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
            onClick={() => setIsAdding(!isAdding)}
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
                <div className={labelClass}>Name</div>
                <input
                  autoFocus
                  className={inputClass}
                  onChange={(e) => setNewMemberName(e.target.value)}
                  required
                  value={newMemberName}
                />
              </div>
              <div className="grid gap-1.5">
                <div className={labelClass}>Email (optional)</div>
                <input
                  className={inputClass}
                  onChange={(e) => setNewMemberEmail(e.target.value)}
                  type="email"
                  value={newMemberEmail}
                />
              </div>
              <div className="grid gap-1.5 md:col-span-2">
                <div className={labelClass}>Image URL (optional)</div>
                <input
                  className={inputClass}
                  onChange={(e) => setNewMemberImage(e.target.value)}
                  placeholder="https://example.com/avatar.png"
                  type="url"
                  value={newMemberImage}
                />
              </div>
              <div className="mt-2 flex justify-end gap-2 md:col-span-2">
                <button
                  className={buttonClass({ variant: "ghost" })}
                  onClick={() => setIsAdding(false)}
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

function EditableMemberCard({
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

  const updateMember = useUpdateClientMember();
  const deleteMember = useDeleteClientMember();

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editName.trim()) {
      return;
    }

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
  }

  async function handleDelete() {
    // biome-ignore lint/suspicious/noAlert: MVP confirm
    if (!confirm(`Are you sure you want to remove ${member.name}?`)) {
      return;
    }
    await deleteMember.mutateAsync({ clientId, memberId: member.id });
  }

  if (isEditing) {
    return (
      <motion.form
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-3 rounded-xl border border-accent bg-bg-elevated p-4 shadow-lg"
        initial={{ opacity: 0, y: 10 }}
        onSubmit={handleSave}
      >
        <div className="grid gap-1.5">
          <div className={labelClass}>Name</div>
          <input
            autoFocus
            className={inputClass}
            onChange={(e) => setEditName(e.target.value)}
            required
            value={editName}
          />
        </div>
        <div className="grid gap-1.5">
          <div className={labelClass}>Email (optional)</div>
          <input
            className={inputClass}
            onChange={(e) => setEditEmail(e.target.value)}
            type="email"
            value={editEmail}
          />
        </div>
        <div className="grid gap-1.5">
          <div className={labelClass}>Image URL (optional)</div>
          <input
            className={inputClass}
            onChange={(e) => setEditImage(e.target.value)}
            placeholder="https://..."
            type="url"
            value={editImage}
          />
        </div>
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
              onClick={() => setIsEditing(false)}
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
            onClick={() => setIsEditing(true)}
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

            <div className="pointer-events-none absolute top-full right-0 z-10 mt-2 w-48 translate-y-2 rounded-lg border border-white/10 bg-zinc-900 p-3 font-medium text-[11px] text-fg-muted opacity-0 shadow-xl transition-all group-hover:translate-y-0 group-hover:opacity-100">
              <div className="mb-1 font-semibold text-white">Known Traits</div>
              <ul className="m-0 list-disc space-y-1 pl-3">
                {Array.isArray(member.persona.traits) &&
                  member.persona.traits
                    .slice(0, 3)
                    .map((trait: string, _idx: number) => (
                      <li key={trait}>{trait}</li>
                    ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
