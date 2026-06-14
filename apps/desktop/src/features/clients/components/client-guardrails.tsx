import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../../lib/api";
import type {
  GuardrailRuleType,
  GuardrailSeverity,
  PolicyGuardrail,
} from "../../../routes/settings";
import { useAuthSession } from "../../auth/use-session";

function GuardrailCard({
  g,
  toggleGuardrail,
}: {
  g: PolicyGuardrail;
  toggleGuardrail: (id: string) => void;
}) {
  const getSeverityLineClass = (severity: GuardrailSeverity) => {
    if (severity === "BLOCK") {
      return "bg-danger-fg";
    }
    if (severity === "WARNING") {
      return "bg-warning-fg";
    }
    return "bg-info-fg";
  };

  const getSeverityBadgeClass = (severity: GuardrailSeverity) => {
    if (severity === "BLOCK") {
      return "border-danger-fg/30 bg-danger-bg/50 text-danger-fg";
    }
    if (severity === "WARNING") {
      return "border-warning-fg/30 bg-warning-bg/50 text-warning-fg";
    }
    return "border-info-fg/30 bg-info-bg/50 text-info-fg";
  };

  const wrapperClass = `group relative flex flex-col justify-between overflow-hidden rounded-xl border border-border bg-bg-subtle transition-all duration-300 hover:border-border-strong hover:bg-bg-elevated hover:shadow-sm ${
    g.isActive ? "" : "opacity-60 grayscale-[0.6]"
  }`;

  return (
    <div className={wrapperClass}>
      <div
        className={`absolute top-0 left-0 h-full w-1 ${getSeverityLineClass(
          g.severity
        )}`}
      />
      <div className="p-5 pl-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <h3 className="font-semibold text-fg text-sm tracking-tight">
              {g.name}
            </h3>
            <div className="flex items-center gap-1.5">
              <span className="rounded-[4px] border border-border-subtle bg-bg px-2 py-0.5 font-bold text-[9px] text-fg-subtle uppercase tracking-widest">
                {g.ruleType}
              </span>
              <span
                className={`rounded-[4px] border px-2 py-0.5 font-bold text-[9px] uppercase tracking-widest ${getSeverityBadgeClass(
                  g.severity
                )}`}
              >
                {g.severity}
              </span>
            </div>
          </div>

          <button
            className={`relative inline-flex h-[18px] w-8 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-300 ease-in-out focus:outline-none ${
              g.isActive ? "bg-success-fg" : "bg-border-strong"
            }`}
            onClick={() => toggleGuardrail(g.id)}
            type="button"
          >
            <span
              className={`pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow ring-0 transition duration-300 ease-in-out ${
                g.isActive ? "translate-x-[14px]" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        <p className="mt-3 max-w-[90%] text-[13px] text-fg-muted leading-relaxed">
          {g.description}
        </p>
      </div>
    </div>
  );
}

export function ClientGuardrails({ clientId }: { clientId: string }) {
  const { user } = useAuthSession();
  const orgId = user?.orgId;

  const [guardrails, setGuardrails] = useState<PolicyGuardrail[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newType, setNewType] = useState<GuardrailRuleType>("CUSTOM");
  const [newSeverity, setNewSeverity] = useState<GuardrailSeverity>("WARNING");
  const [warning, setWarning] = useState("");

  useEffect(() => {
    async function fetchClientGuardrails() {
      if (!(orgId && clientId)) {
        return;
      }
      try {
        const data = await api.get<PolicyGuardrail[]>(
          `/policy-guardrails/?orgId=${orgId}`
        );
        setGuardrails(
          data.filter(
            (g: PolicyGuardrail & { clientId?: string }) =>
              g.clientId === clientId
          )
        );
      } catch (e) {
        console.error("Failed to fetch client guardrails", e);
      } finally {
        setIsLoading(false);
      }
    }
    fetchClientGuardrails();
  }, [orgId, clientId]);

  async function handleAddGuardrail(e: React.FormEvent) {
    e.preventDefault();
    if (!(newName.trim() && newDesc.trim() && orgId)) {
      return;
    }
    try {
      const newGuardrail = await api.post<PolicyGuardrail>(
        "/policy-guardrails/",
        {
          orgId,
          clientId,
          name: newName.trim(),
          description: newDesc.trim(),
          ruleType: newType,
          severity: newSeverity,
        }
      );
      setGuardrails([newGuardrail, ...guardrails]);
      setIsAdding(false);
      setNewName("");
      setNewDesc("");
      setNewType("CUSTOM");
      setNewSeverity("WARNING");
      setWarning("");
    } catch (e) {
      setWarning(`Failed to add guardrail: ${String(e)}`);
    }
  }

  async function toggleGuardrail(id: string) {
    const target = guardrails.find((g) => g.id === id);
    if (!target) {
      return;
    }

    setGuardrails((prev) =>
      prev.map((g) => (g.id === id ? { ...g, isActive: !g.isActive } : g))
    );

    try {
      if (target.isActive) {
        await api.post(`/policy-guardrails/${id}/deactivate`);
      } else {
        await api.post(`/policy-guardrails/${id}/activate`);
      }
    } catch (e) {
      setGuardrails((prev) =>
        prev.map((g) => (g.id === id ? { ...g, isActive: target.isActive } : g))
      );
      setWarning(`Failed to toggle guardrail: ${String(e)}`);
    }
  }

  return (
    <section className="mt-8 flex flex-col gap-4">
      <div className="flex items-center justify-between border-border-subtle border-b pb-3">
        <div>
          <h2 className="m-0 font-medium text-[14px] text-fg">
            Client-Specific Guardrails
          </h2>
          <div className="mt-1 flex items-center gap-1.5 text-fg-muted text-xs">
            <span>
              Note: Global organization policies are always enforced alongside
              these by default.
            </span>
            <Link
              className="font-semibold text-accent transition-colors hover:text-accent-hover hover:underline"
              to="/settings"
            >
              Check Policies <span aria-hidden="true">&rarr;</span>
            </Link>
          </div>
        </div>
        <button
          className="inline-flex h-8 items-center justify-center rounded-md bg-accent px-4 font-semibold text-[11px] text-fg-on-accent tracking-wide transition-all hover:scale-[1.02] hover:bg-accent-hover active:scale-95"
          onClick={() => setIsAdding(!isAdding)}
          type="button"
        >
          {isAdding ? "Cancel" : "+ Add Policy"}
        </button>
      </div>

      {warning && (
        <p className="rounded-md border border-warning-fg/30 bg-warning-bg px-3 py-2.5 font-medium text-warning-fg text-xs">
          {warning}
        </p>
      )}

      {isAdding && (
        <form
          className="fade-in slide-in-from-top-4 mb-4 animate-in overflow-hidden rounded-xl border border-border bg-bg-elevated shadow-xl duration-300"
          onSubmit={handleAddGuardrail}
        >
          <div className="border-border border-b bg-bg-subtle px-5 py-4">
            <h3 className="font-semibold text-fg text-sm">
              Create Client Policy
            </h3>
          </div>

          <div className="p-5">
            <div className="mb-5 grid grid-cols-1 gap-5 md:grid-cols-[1fr_200px]">
              <div className="flex flex-col gap-2">
                <label
                  className="font-semibold text-[11px] text-fg-muted uppercase tracking-wider"
                  htmlFor="policy-name"
                >
                  Policy Name
                </label>
                <input
                  className="rounded-md border border-border bg-bg px-3 py-2 text-fg text-sm outline-none transition-colors placeholder:text-fg-subtle focus:border-ring"
                  id="policy-name"
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. exclusive contract terms"
                  required
                  value={newName}
                />
              </div>

              <div className="grid grid-cols-2 gap-4 md:grid-cols-1">
                <div className="flex flex-col gap-2">
                  <label
                    className="font-semibold text-[11px] text-fg-muted uppercase tracking-wider"
                    htmlFor="rule-type"
                  >
                    Rule Type
                  </label>
                  <select
                    className="rounded-md border border-border bg-bg px-3 py-2 text-fg text-sm outline-none transition-colors focus:border-ring"
                    id="rule-type"
                    onChange={(e) =>
                      setNewType(e.target.value as GuardrailRuleType)
                    }
                    value={newType}
                  >
                    <option value="NDA">NDA</option>
                    <option value="LEGAL">Legal</option>
                    <option value="TERMINOLOGY">Terminology</option>
                    <option value="INTERNAL">Internal</option>
                    <option value="CUSTOM">Custom</option>
                  </select>
                </div>

                <div className="flex flex-col gap-2">
                  <label
                    className="font-semibold text-[11px] text-fg-muted uppercase tracking-wider"
                    htmlFor="severity"
                  >
                    Severity
                  </label>
                  <select
                    className="rounded-md border border-border bg-bg px-3 py-2 text-fg text-sm outline-none transition-colors focus:border-ring"
                    id="severity"
                    onChange={(e) =>
                      setNewSeverity(e.target.value as GuardrailSeverity)
                    }
                    value={newSeverity}
                  >
                    <option value="INFO">Info</option>
                    <option value="WARNING">Warning</option>
                    <option value="BLOCK">Block</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="mb-6 flex flex-col gap-2">
              <label
                className="font-semibold text-[11px] text-fg-muted uppercase tracking-wider"
                htmlFor="enforcement-criteria"
              >
                Enforcement Criteria
              </label>
              <textarea
                className="resize-none rounded-md border border-border bg-bg px-3 py-2 text-fg text-sm outline-none transition-colors placeholder:text-fg-subtle focus:border-ring"
                id="enforcement-criteria"
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Describe the exact criteria for this rule. The LLM will use this to evaluate live speech and generate compliance alerts."
                required
                rows={3}
                value={newDesc}
              />
            </div>

            <div className="flex justify-end border-border-subtle border-t pt-4">
              <button
                className="inline-flex h-8 items-center justify-center rounded-md bg-accent px-5 font-semibold text-fg-on-accent text-xs transition-transform hover:scale-[1.02] active:scale-95"
                type="submit"
              >
                Save Guardrail
              </button>
            </div>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 gap-4">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <span className="animate-pulse font-medium text-fg-muted text-xs">
              Loading guardrails...
            </span>
          </div>
        ) : (
          guardrails.map((g) => (
            <GuardrailCard g={g} key={g.id} toggleGuardrail={toggleGuardrail} />
          ))
        )}

        {guardrails.length === 0 && !isAdding && !isLoading && (
          <div className="fade-in flex animate-in flex-col items-center justify-center rounded-xl border border-border border-dashed bg-bg-subtle py-12 text-center duration-500">
            <p className="font-medium text-fg text-sm">
              No specific guardrails for this client
            </p>
            <p className="mt-1.5 text-fg-muted text-xs">
              Global policies apply by default. Add specialized rules here.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
