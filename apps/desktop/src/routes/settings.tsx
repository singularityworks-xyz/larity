import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useState } from "react";
import { useAuthSession } from "../features/auth/use-session";
import { api } from "../lib/api";
import { VadManager } from "../services/vad";

type CorrelationState = "TEAM MEMBER" | "EXTERNAL";
type VadDebugEventType = "speech_start" | "speech_end";

interface VadDebugEvent {
  id: string;
  type: VadDebugEventType;
  ts: number;
}

const TEAM_MEMBER_STATE: CorrelationState = "TEAM MEMBER";
const EXTERNAL_STATE: CorrelationState = "EXTERNAL";
const SPEECH_ACTIVE_MS = 2500;

function formatTimestamp(ts: number | null): string {
  if (!ts) {
    return "Never";
  }
  return new Date(ts).toLocaleTimeString();
}

type TabId = "guardrails" | "audio";

// --- Guardrail Types ---
export type GuardrailRuleType =
  | "NDA"
  | "LEGAL"
  | "TERMINOLOGY"
  | "INTERNAL"
  | "CUSTOM";
export type GuardrailSeverity = "INFO" | "WARNING" | "BLOCK";

export interface PolicyGuardrail {
  id: string;
  name: string;
  description: string;
  ruleType: GuardrailRuleType;
  severity: GuardrailSeverity;
  isActive: boolean;
}

export function SettingsPage() {
  const vadManager = useMemo(() => new VadManager(), []);

  // Auth State
  const { user } = useAuthSession();
  const orgId = user?.orgId;

  // Tab State
  const [activeTab, setActiveTab] = useState<TabId>("guardrails");

  // VAD State
  const [isRunning, setIsRunning] = useState(false);
  const [speechDetected, setSpeechDetected] = useState(false);
  const [lastSpeechStartTs, setLastSpeechStartTs] = useState<number | null>(
    null
  );
  const [lastSpeechEndTs, setLastSpeechEndTs] = useState<number | null>(null);
  const [nowTs, setNowTs] = useState(Date.now());
  const [events, setEvents] = useState<VadDebugEvent[]>([]);
  const [warning, setWarning] = useState("");
  const [permissionDecision, setPermissionDecision] = useState("loading");
  const [audioDeviceCount, setAudioDeviceCount] = useState<number | null>(null);
  const [lastPreflightError, setLastPreflightError] = useState<string>("");

  // Guardrail State
  const [guardrails, setGuardrails] = useState<PolicyGuardrail[]>([]);
  const [isLoadingGuardrails, setIsLoadingGuardrails] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newType, setNewType] = useState<GuardrailRuleType>("CUSTOM");
  const [newSeverity, setNewSeverity] = useState<GuardrailSeverity>("WARNING");

  // Fetch guardrails
  async function fetchGuardrails() {
    if (!orgId) return;
    try {
      const data = await api.get<PolicyGuardrail[]>(
        `/policy-guardrails/?orgId=${orgId}`
      );
      // Filter out client-specific guardrails so global settings only show org ones
      const orgGuardrails = data.filter((g: any) => !g.clientId);
      setGuardrails(orgGuardrails);
    } catch (e) {
      console.error("Failed to fetch guardrails", e);
    } finally {
      setIsLoadingGuardrails(false);
    }
  }

  useEffect(() => {
    fetchGuardrails();
  }, [orgId]);

  // VAD Cleanup
  useEffect(() => {
    return () => {
      invoke("audio_capture_stop").catch(() => {});
      vadManager.destroy();
    };
  }, [vadManager]);

  // VAD Permission Init
  useEffect(() => {
    invoke<string>("linux_media_permission_get_decision")
      .then((decision) => setPermissionDecision(decision))
      .catch(() => setPermissionDecision("unknown"));
  }, []);

  // VAD Loop
  useEffect(() => {
    if (!isRunning) return;
    const interval = window.setInterval(() => {
      const now = Date.now();
      setNowTs(now);
      if (!lastSpeechStartTs) {
        setSpeechDetected(false);
        return;
      }
      const active = now - lastSpeechStartTs <= SPEECH_ACTIVE_MS;
      setSpeechDetected(active);
    }, 200);
    return () => window.clearInterval(interval);
  }, [isRunning, lastSpeechStartTs]);

  const correlationState: CorrelationState = speechDetected
    ? TEAM_MEMBER_STATE
    : EXTERNAL_STATE;

  async function startVADTest() {
    setWarning("");
    setLastPreflightError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      for (const track of stream.getTracks()) track.stop();

      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter((d) => d.kind === "audioinput");
      setAudioDeviceCount(audioInputs.length);

      try {
        await invoke("audio_capture_start", {
          sessionId: "vad-test",
          micDeviceId: null,
          sysDeviceId: null,
          role: "participant",
        });
      } catch (captureError) {
        if (!String(captureError).includes("already running")) {
          throw captureError;
        }
      }

      await vadManager.start({
        onSpeechStart: () => {
          const now = Date.now();
          setLastSpeechStartTs(now);
          setSpeechDetected(true);
          setEvents((prev) =>
            [
              {
                id: `speech_start_${now}`,
                type: "speech_start" as const,
                ts: now,
              },
              ...prev,
            ].slice(0, 30)
          );
        },
        onSpeechEnd: () => {
          const now = Date.now();
          setLastSpeechEndTs(now);
          setSpeechDetected(false);
          setEvents((prev) =>
            [
              { id: `speech_end_${now}`, type: "speech_end" as const, ts: now },
              ...prev,
            ].slice(0, 30)
          );
        },
      });
      setIsRunning(true);
    } catch (error) {
      const message = String(error);
      setWarning(`Unable to start VAD test: ${message}`);
      setLastPreflightError(message);
      setIsRunning(false);
    }
  }

  function stopVADTest() {
    vadManager.destroy();
    invoke("audio_capture_stop").catch(() => {});
    setIsRunning(false);
    setSpeechDetected(false);
  }

  function clearDebugHistory() {
    setEvents([]);
    setLastSpeechStartTs(null);
    setLastSpeechEndTs(null);
  }

  async function resetPermissionDecision() {
    try {
      await invoke("linux_media_permission_reset");
      const decision = await invoke<string>(
        "linux_media_permission_get_decision"
      );
      setPermissionDecision(decision);
    } catch (error) {
      setWarning(`Unable to reset permission decision: ${String(error)}`);
    }
  }

  const msSinceLastSpeechStart =
    lastSpeechStartTs === null ? null : nowTs - lastSpeechStartTs;

  // --- Guardrail Actions ---
  async function handleAddGuardrail(e: React.FormEvent) {
    e.preventDefault();
    if (!(newName.trim() && newDesc.trim() && orgId)) return;
    try {
      const newGuardrail = await api.post<PolicyGuardrail>(
        "/policy-guardrails/",
        {
          orgId,
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
    } catch (e) {
      setWarning(`Failed to add guardrail: ${String(e)}`);
    }
  }

  async function toggleGuardrail(id: string) {
    const target = guardrails.find((g) => g.id === id);
    if (!target) return;

    // Optimistic UI update
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
      // Revert if API fails
      setGuardrails((prev) =>
        prev.map((g) => (g.id === id ? { ...g, isActive: target.isActive } : g))
      );
      setWarning(`Failed to toggle guardrail: ${String(e)}`);
    }
  }

  async function seedDefaultGuardrails() {
    if (!orgId) return;
    setIsLoadingGuardrails(true);
    try {
      await api.post("/policy-guardrails/seed", { orgId });
      await fetchGuardrails();
    } catch (e) {
      setWarning(`Failed to load defaults: ${String(e)}`);
      setIsLoadingGuardrails(false);
    }
  }

  function renderAudioTab() {
    return (
      <section className="fade-in slide-in-from-bottom-2 animate-in duration-300">
        <div className="rounded-xl border border-border bg-bg-subtle p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="font-medium text-fg text-sm">VAD Correlation</h2>
              <p className="mt-1.5 max-w-[80%] text-fg-muted text-xs leading-relaxed">
                Speak into your microphone. If VAD detects speech, this test
                reports <strong>TEAM MEMBER</strong>; otherwise{" "}
                <strong>EXTERNAL</strong>.
              </p>
            </div>
            <span
              className={
                correlationState === TEAM_MEMBER_STATE
                  ? "rounded-full border border-success-fg/30 bg-success-bg px-2.5 py-1 font-semibold text-[11px] text-success-fg uppercase tracking-wide"
                  : "rounded-full border border-border-subtle bg-bg px-2.5 py-1 font-semibold text-[11px] text-fg-muted uppercase tracking-wide"
              }
            >
              {correlationState}
            </span>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              className="inline-flex h-8 items-center rounded-md border border-border bg-bg px-4 font-medium text-fg text-xs transition-colors hover:bg-bg-elevated disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isRunning}
              onClick={() => startVADTest().catch(() => {})}
              type="button"
            >
              Start Test
            </button>
            <button
              className="inline-flex h-8 items-center rounded-md border border-border bg-bg px-4 font-medium text-fg text-xs transition-colors hover:bg-bg-elevated disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!isRunning}
              onClick={stopVADTest}
              type="button"
            >
              Stop Test
            </button>
            <div className="ml-2 flex items-center gap-2">
              <div
                className={`h-2 w-2 rounded-full ${isRunning ? "animate-pulse bg-success-fg" : "bg-fg-muted"}`}
              />
              <span className="font-medium text-fg-muted text-xs">
                {isRunning ? "Listening..." : "Idle"}
              </span>
            </div>
          </div>

          <div className="mt-5 flex items-center justify-between border-border-subtle border-t pt-5">
            <div className="flex flex-col gap-1">
              <span className="font-medium text-fg text-xs">
                Linux Media Permission
              </span>
              <span className="text-[11px] text-fg-muted capitalize">
                {permissionDecision}
              </span>
            </div>
            <button
              className="inline-flex h-7 items-center rounded font-medium text-[11px] text-fg-muted transition-colors hover:text-fg"
              onClick={() => resetPermissionDecision().catch(() => {})}
              type="button"
            >
              Reset Decision
            </button>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-4 rounded-lg border border-border-subtle bg-bg p-4 text-xs">
            <div className="flex flex-col gap-1.5 text-fg-muted">
              <span className="font-semibold text-[10px] text-fg-subtle uppercase tracking-wider">
                Hardware
              </span>
              <p>
                Audio inputs:{" "}
                <span className="font-medium text-fg">
                  {audioDeviceCount === null ? "n/a" : audioDeviceCount}
                </span>
              </p>
            </div>
            <div className="flex flex-col gap-1.5 text-fg-muted">
              <span className="font-semibold text-[10px] text-fg-subtle uppercase tracking-wider">
                Timings
              </span>
              <p>
                Speech Start:{" "}
                <span className="text-fg">
                  {formatTimestamp(lastSpeechStartTs)}
                </span>
              </p>
              <p>
                Speech End:{" "}
                <span className="text-fg">
                  {formatTimestamp(lastSpeechEndTs)}
                </span>
              </p>
            </div>
          </div>

          <div className="mt-6 overflow-hidden rounded-lg border border-border bg-bg">
            <div className="flex items-center justify-between border-border border-b bg-bg-elevated px-4 py-2">
              <p className="font-medium text-fg text-xs uppercase tracking-wide">
                Event Log
              </p>
              <button
                className="font-medium text-[11px] text-fg-subtle transition-colors hover:text-fg"
                onClick={clearDebugHistory}
                type="button"
              >
                Clear
              </button>
            </div>
            <div className="min-h-[120px] bg-bg p-2">
              {events.length === 0 ? (
                <div className="flex h-full items-center justify-center pt-8">
                  <p className="text-[11px] text-fg-muted italic">
                    No events recorded
                  </p>
                </div>
              ) : (
                <ul className="max-h-[200px] space-y-1.5 overflow-y-auto pr-2">
                  {events.map((event) => (
                    <li
                      className="flex items-center justify-between rounded px-2 py-1.5 text-[11px] transition-colors hover:bg-bg-subtle"
                      key={event.id}
                    >
                      <span
                        className={`font-semibold uppercase tracking-wider ${event.type === "speech_start" ? "text-success-fg" : "text-fg-subtle"}`}
                      >
                        {event.type.replace("_", " ")}
                      </span>
                      <span className="font-mono text-fg-muted">
                        {new Date(event.ts).toLocaleTimeString()}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </section>
    );
  }

  function renderGuardrailsTab() {
    return (
      <section className="fade-in slide-in-from-bottom-2 animate-in duration-300">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-fg">Active Guardrails</h2>
            <p className="mt-1.5 max-w-[85%] text-fg-muted text-xs leading-relaxed">
              Define the compliance rules and operational boundaries that the
              LLM enforces during all organizational meetings.
            </p>
          </div>
          <button
            className="inline-flex h-8 items-center justify-center rounded-md bg-accent px-4 font-semibold text-[11px] text-fg-on-accent tracking-wide transition-all hover:scale-[1.02] hover:bg-accent-hover active:scale-95"
            onClick={() => setIsAdding(!isAdding)}
            type="button"
          >
            {isAdding ? "Cancel" : "+ Add Policy"}
          </button>
        </div>

        {isAdding && (
          <form
            className="slide-in-from-top-4 mb-8 animate-in overflow-hidden rounded-xl border border-border bg-bg-elevated shadow-xl duration-300"
            onSubmit={handleAddGuardrail}
          >
            <div className="border-border border-b bg-bg-subtle px-5 py-4">
              <h3 className="font-semibold text-fg text-sm">
                Create New Guardrail
              </h3>
            </div>

            <div className="p-5">
              <div className="mb-5 grid grid-cols-1 gap-5 md:grid-cols-[1fr_200px]">
                <div className="flex flex-col gap-2">
                  <label className="font-semibold text-[11px] text-fg-muted uppercase tracking-wider">
                    Policy Name
                  </label>
                  <input
                    className="rounded-md border border-border bg-bg px-3 py-2 text-fg text-sm outline-none transition-colors placeholder:text-fg-subtle focus:border-ring"
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. strict internal NDA"
                    required
                    value={newName}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4 md:grid-cols-1">
                  <div className="flex flex-col gap-2">
                    <label className="font-semibold text-[11px] text-fg-muted uppercase tracking-wider">
                      Rule Type
                    </label>
                    <select
                      className="rounded-md border border-border bg-bg px-3 py-2 text-fg text-sm outline-none transition-colors focus:border-ring"
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
                    <label className="font-semibold text-[11px] text-fg-muted uppercase tracking-wider">
                      Severity
                    </label>
                    <select
                      className="rounded-md border border-border bg-bg px-3 py-2 text-fg text-sm outline-none transition-colors focus:border-ring"
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
                <label className="font-semibold text-[11px] text-fg-muted uppercase tracking-wider">
                  Enforcement Criteria
                </label>
                <textarea
                  className="resize-none rounded-md border border-border bg-bg px-3 py-2 text-fg text-sm outline-none transition-colors placeholder:text-fg-subtle focus:border-ring"
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
          {isLoadingGuardrails ? (
            <div className="flex justify-center py-12">
              <span className="animate-pulse font-medium text-fg-muted text-xs">
                Loading guardrails...
              </span>
            </div>
          ) : (
            guardrails.map((g) => (
              <div
                className={`group relative flex flex-col justify-between overflow-hidden rounded-xl border border-border bg-bg-subtle transition-all duration-300 hover:border-border-strong hover:bg-bg-elevated hover:shadow-sm ${g.isActive ? "" : "opacity-60 grayscale-[0.6]"}`}
                key={g.id}
              >
                <div
                  className={`absolute top-0 left-0 h-full w-1 ${g.severity === "BLOCK" ? "bg-danger-fg" : g.severity === "WARNING" ? "bg-warning-fg" : "bg-info-fg"}`}
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
                          className={`rounded-[4px] border px-2 py-0.5 font-bold text-[9px] uppercase tracking-widest ${g.severity === "BLOCK" ? "border-danger-fg/30 bg-danger-bg/50 text-danger-fg" : g.severity === "WARNING" ? "border-warning-fg/30 bg-warning-bg/50 text-warning-fg" : "border-info-fg/30 bg-info-bg/50 text-info-fg"}`}
                        >
                          {g.severity}
                        </span>
                      </div>
                    </div>

                    <button
                      className={`relative inline-flex h-[18px] w-8 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-300 ease-in-out focus:outline-none ${g.isActive ? "bg-success-fg" : "bg-border-strong"}`}
                      onClick={() => toggleGuardrail(g.id)}
                      type="button"
                    >
                      <span
                        className={`pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow ring-0 transition duration-300 ease-in-out ${g.isActive ? "translate-x-[14px]" : "translate-x-0"}`}
                      />
                    </button>
                  </div>

                  <p className="mt-3 max-w-[90%] text-[13px] text-fg-muted leading-relaxed">
                    {g.description}
                  </p>
                </div>
              </div>
            ))
          )}

          {guardrails.length === 0 && !isAdding && !isLoadingGuardrails && (
            <div className="fade-in flex animate-in flex-col items-center justify-center rounded-xl border border-border border-dashed bg-bg-subtle py-16 text-center duration-500">
              <p className="font-medium text-fg text-sm">
                No guardrails active
              </p>
              <p className="mt-1.5 mb-5 text-fg-muted text-xs">
                Create rules to enforce compliance across all meetings.
              </p>
              <button
                className="inline-flex h-8 items-center justify-center rounded-md border border-border bg-bg px-5 font-semibold text-[11px] text-fg uppercase tracking-wide transition-all hover:scale-[1.02] hover:bg-bg-elevated active:scale-95"
                onClick={seedDefaultGuardrails}
                type="button"
              >
                Load Default Policies
              </button>
            </div>
          )}
        </div>
      </section>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-[860px] flex-col gap-6 px-2 pt-4 pb-12">
      <div className="flex items-center justify-between border-border border-b pb-4">
        <div>
          <h1 className="font-semibold text-fg text-lg tracking-tight">
            Configuration
          </h1>
          <p className="mt-1 text-fg-muted text-xs">
            Manage system diagnostics and global organization policies.
          </p>
        </div>
      </div>

      {warning && (
        <p className="rounded-md border border-warning-fg/30 bg-warning-bg px-3 py-2.5 font-medium text-warning-fg text-xs">
          {warning}
        </p>
      )}

      <div className="flex items-center gap-1 border-border-subtle border-b pb-px">
        <button
          className={`relative top-px border-b-2 px-4 py-2 font-medium text-xs tracking-wide transition-all ${
            activeTab === "guardrails"
              ? "border-accent text-fg"
              : "border-transparent text-fg-subtle hover:border-border-strong hover:text-fg"
          }`}
          onClick={() => setActiveTab("guardrails")}
          type="button"
        >
          Guardrails & Policy
        </button>
        <button
          className={`relative top-px border-b-2 px-4 py-2 font-medium text-xs tracking-wide transition-all ${
            activeTab === "audio"
              ? "border-accent text-fg"
              : "border-transparent text-fg-subtle hover:border-border-strong hover:text-fg"
          }`}
          onClick={() => setActiveTab("audio")}
          type="button"
        >
          Audio & VAD
        </button>
      </div>

      <div className="pt-2">
        {activeTab === "guardrails" ? renderGuardrailsTab() : renderAudioTab()}
      </div>
    </main>
  );
}
