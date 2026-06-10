import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useClients } from "../../features/meetings/use-clients";
import { useStartMeeting } from "../../features/meetings/use-start-meeting";
import {
  buttonClass,
  cx,
  formClass,
  formErrorClass,
  formGroupClass,
  formPanelClass,
  inputClass,
  labelClass,
  segmentButtonActiveClass,
  segmentButtonClass,
  segmentControlClass,
  selectClass,
  textareaClass,
} from "../../lib/ui";
import { AppShell } from "../shared";

type ScheduleMode = "now" | "schedule";

function readStartMeetingValidationError(
  clientId: string,
  scheduleMode: ScheduleMode,
  scheduledAtLocal: string
): string | null {
  if (!clientId) {
    return "Select a client first";
  }
  if (scheduleMode === "schedule" && !scheduledAtLocal.trim()) {
    return "Pick a date and time for a scheduled meeting";
  }
  return null;
}

function scheduledIsoFromForm(
  scheduleMode: ScheduleMode,
  scheduledAtLocal: string
): string | undefined {
  if (scheduleMode !== "schedule") {
    return undefined;
  }
  const trimmed = scheduledAtLocal.trim();
  return trimmed ? new Date(trimmed).toISOString() : undefined;
}

export function StartMeetingPage() {
  const navigate = useNavigate();
  const clientsQuery = useClients();
  const startMeetingMutation = useStartMeeting();

  const [clientId, setClientId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [agenda, setAgenda] = useState("");
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>("now");
  const [scheduledAtLocal, setScheduledAtLocal] = useState("");
  const [error, setError] = useState<string | null>(null);

  const selectedClient = useMemo(() => {
    return (clientsQuery.data ?? []).find((c) => c.id === clientId);
  }, [clientsQuery.data, clientId]);

  const isSubmitDisabled = useMemo(() => {
    return clientId.trim().length === 0 || startMeetingMutation.isPending;
  }, [clientId, startMeetingMutation.isPending]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationError = readStartMeetingValidationError(
      clientId,
      scheduleMode,
      scheduledAtLocal
    );
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);

    try {
      const scheduledIso = scheduledIsoFromForm(scheduleMode, scheduledAtLocal);
      const trimmedTitle = title.trim();

      const session = await startMeetingMutation.mutateAsync({
        clientId,
        ...(trimmedTitle ? { title: trimmedTitle } : {}),
        ...(description.trim() ? { description: description.trim() } : {}),
        ...(agenda.trim() ? { agenda: agenda.trim() } : {}),
        ...(scheduledIso ? { scheduledAt: scheduledIso } : {}),
      });

      navigate(`/meeting/${session.sessionId}`, {
        state: {
          role: "host",
          websocketUrl: session.websocketUrl,
          clientName: selectedClient?.name ?? "Client",
          meetingTitle: trimmedTitle || "Untitled meeting",
          startedAt: Date.now(),
          allowNameCustomization: session.allowNameCustomization,
        },
      });
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "Could not start meeting";
      setError(message);
    }
  }

  return (
    <AppShell
      subtitle="Create an ad-hoc or scheduled session tied to a client."
      title="Start meeting mode"
    >
      <section className={cx(formPanelClass, "max-w-[560px]")}>
        {clientsQuery.isPending ? (
          <p className="text-fg-muted text-xs">Loading clients...</p>
        ) : null}
        {clientsQuery.error ? (
          <p className={formErrorClass}>{clientsQuery.error.message}</p>
        ) : null}

        <form className={cx(formClass, "gap-4")} onSubmit={onSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <div className={formGroupClass}>
              <label className={labelClass} htmlFor="meeting-client">
                Client
              </label>
              <select
                className={selectClass}
                id="meeting-client"
                onChange={(event) => setClientId(event.target.value)}
                required
                value={clientId}
              >
                <option value="">Select a client</option>
                {(clientsQuery.data ?? []).map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
            </div>

            <div className={formGroupClass}>
              <label className={labelClass} htmlFor="meeting-title">
                Meeting title (optional)
              </label>
              <input
                className={inputClass}
                id="meeting-title"
                onChange={(event) => setTitle(event.target.value)}
                placeholder="e.g. Weekly sync"
                type="text"
                value={title}
              />
            </div>
          </div>

          <div className={formGroupClass}>
            <span className={labelClass}>Start time</span>
            <div className={segmentControlClass}>
              <button
                className={cx(
                  segmentButtonClass,
                  scheduleMode === "now" ? segmentButtonActiveClass : ""
                )}
                onClick={() => setScheduleMode("now")}
                type="button"
              >
                Start now
              </button>
              <button
                className={cx(
                  segmentButtonClass,
                  scheduleMode === "schedule" ? segmentButtonActiveClass : ""
                )}
                onClick={() => setScheduleMode("schedule")}
                type="button"
              >
                Schedule
              </button>
            </div>
            {scheduleMode === "schedule" ? (
              <input
                aria-label="Scheduled start"
                className={cx(inputClass, "mt-2")}
                onChange={(event) => setScheduledAtLocal(event.target.value)}
                type="datetime-local"
                value={scheduledAtLocal}
              />
            ) : null}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className={formGroupClass}>
              <label className={labelClass} htmlFor="meeting-description">
                Description (optional)
              </label>
              <textarea
                className={textareaClass}
                id="meeting-description"
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Context or objectives"
                rows={4}
                value={description}
              />
            </div>
            <div className={formGroupClass}>
              <label className={labelClass} htmlFor="meeting-agenda">
                Agenda (optional, one item per line)
              </label>
              <textarea
                className={cx(textareaClass, "font-mono text-[12px]")}
                id="meeting-agenda"
                onChange={(event) => setAgenda(event.target.value)}
                placeholder={"Kickoff\nRoadmap review\nQ&A"}
                rows={4}
                value={agenda}
              />
            </div>
          </div>

          {error ? <p className={formErrorClass}>{error}</p> : null}

          <button
            className={buttonClass()}
            disabled={isSubmitDisabled}
            type="submit"
          >
            {startMeetingMutation.isPending
              ? "Starting..."
              : "Start and enter room"}
          </button>
        </form>
      </section>
    </AppShell>
  );
}
