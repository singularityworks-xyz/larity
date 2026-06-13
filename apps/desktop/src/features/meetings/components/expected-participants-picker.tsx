import { Check, Plus } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Avatar } from "../../../components/avatar";
import { buttonClass, cx, inputClass } from "../../../lib/ui";
import { useClientMembers } from "../../clients/use-client-members";
import { useCreateClientMember } from "../../clients/use-create-client-member";

export function ExpectedParticipantsPicker({
  clientId,
  selectedIds,
  onSelectionChange,
}: {
  clientId: string;
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
}) {
  const { data: members, isLoading } = useClientMembers(clientId);
  const createMember = useCreateClientMember();

  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const toggleSelection = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    onSelectionChange(next);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) {
      return;
    }
    setError(null);
    try {
      const newMember = await createMember.mutateAsync({
        clientId,
        name: newName.trim(),
        role: "CONTACT",
      });
      const next = new Set(selectedIds);
      next.add(newMember.id);
      onSelectionChange(next);
      setIsAdding(false);
      setNewName("");
    } catch {
      setError("Failed to create participant. Please try again.");
    }
  };

  if (!clientId) {
    return null;
  }

  return (
    <div className="mt-4 flex flex-col gap-3">
      <div className="font-medium text-[11px] text-fg-muted uppercase tracking-wider">
        Expected Participants
      </div>

      <div className="flex flex-wrap gap-2">
        {isLoading ? (
          <div className="text-[11px] text-fg-muted">Loading members...</div>
        ) : (
          <AnimatePresence>
            {members?.map((m) => {
              const isSelected = selectedIds.has(m.id);
              return (
                <motion.button
                  className={cx(
                    "flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 font-medium text-xs transition-all duration-200",
                    isSelected
                      ? "border-accent bg-accent text-accent-fg shadow-[0_0_15px_rgba(var(--accent-rgb),0.3)]"
                      : "border-border bg-bg-subtle text-fg hover:border-fg-subtle hover:bg-bg-emphasis"
                  )}
                  key={m.id}
                  layout
                  onClick={() => toggleSelection(m.id)}
                  type="button"
                >
                  <div
                    className={cx(
                      "flex h-4 w-4 items-center justify-center rounded-full border transition-colors",
                      isSelected
                        ? "border-accent-fg/30 bg-accent-fg/10"
                        : "border-border bg-bg"
                    )}
                  >
                    {isSelected ? (
                      <Check className="h-2.5 w-2.5 text-accent-fg" />
                    ) : (
                      <Avatar
                        className="h-full w-full rounded-full border-none text-[8px]"
                        image={m.image}
                        name={m.name}
                        size={16}
                      />
                    )}
                  </div>
                  {m.name}
                </motion.button>
              );
            })}

            {!isAdding && (
              <motion.button
                className="flex cursor-pointer items-center gap-1.5 rounded-full border border-border-strong border-dashed bg-transparent px-3 py-1.5 font-medium text-fg-muted text-xs transition-colors hover:border-fg-subtle hover:bg-bg-subtle hover:text-fg"
                layout
                onClick={() => setIsAdding(true)}
                type="button"
              >
                <Plus className="h-3.5 w-3.5" />
                Add new
              </motion.button>
            )}
          </AnimatePresence>
        )}
      </div>

      {isAdding && (
        <form
          className="mt-1 flex items-center gap-2 rounded-xl border border-border bg-bg-subtle p-2"
          onSubmit={handleCreate}
        >
          <input
            autoFocus
            className={cx(
              inputClass,
              "flex-1 border-transparent bg-bg shadow-none"
            )}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New member name..."
            value={newName}
          />
          <button
            className={buttonClass({ variant: "secondary", size: "sm" })}
            disabled={!newName.trim() || createMember.isPending}
            type="submit"
          >
            Save
          </button>
          <button
            className={buttonClass({ variant: "ghost", size: "sm" })}
            onClick={() => setIsAdding(false)}
            type="button"
          >
            Cancel
          </button>
        </form>
      )}
      {error && (
        <div className="mt-1.5 text-[11px] text-danger-fg">{error}</div>
      )}
    </div>
  );
}
