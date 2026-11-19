import { Calendar, Play, Video } from "lucide-react";
import { motion } from "motion/react";
import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { cx, formErrorClass } from "../../../lib/ui";
import { AppShell } from "../../../routes/shared";
import { useClientMembers } from "../../clients/use-client-members";
import { useClients } from "../../clients/use-clients";
import { ExpectedParticipantsPicker } from "./components/expected-participants-picker";
import {
  CustomDatePicker,
  CustomTimePicker,
} from "./components/schedule-pickers";
import { useCreateMeetingParticipant } from "./use-create-meeting-participant";
import { useScheduleMeeting } from "./use-schedule-meeting";
import { useStartMeeting } from "./use-start-meeting";

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
    return;
  }
  const trimmed = scheduledAtLocal.trim();
  return trimmed ? new Date(trimmed).toISOString() : undefined;
}

export function StartMeetingPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const clientsQuery = useClients();
  const startMeetingMutation = useStartMeeting();
  const scheduleMeetingMutation = useScheduleMeeting();
  const createParticipant = useCreateMeetingParticipant();

  const [clientId, setClientId] = useState(searchParams.get("clientId") || "");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>("now");

  // Custom Date/Time State & Shortcuts
  const initialDate = useMemo(
    () => new Date().toISOString().split("T")[0] ?? "",
    []
  );
  const initialTime = useMemo(() => {
    const d = new Date();
    d.setHours(d.getHours() + 1);
    return `${String(d.getHours()).padStart(2, "0")}:00`;
  }, []);

  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [selectedTime, setSelectedTime] = useState(initialTime);
  const [scheduledAtLocal, setScheduledAtLocal] = useState(
    `${initialDate}T${initialTime}`
  );
  const [error, setError] = useState<string | null>(null);

  const dateShortcuts = useMemo(() => {
    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(today.getDate() + 1);

    const nextMonday = new Date();
    const daysToMonday = (1 - today.getDay() + 7) % 7 || 7;
    nextMonday.setDate(today.getDate() + daysToMonday);

    const nextFriday = new Date();
    const daysToFriday = (5 - today.getDay() + 7) % 7 || 7;
    nextFriday.setDate(today.getDate() + daysToFriday);

    const formatDateString = (d: Date) => d.toISOString().split("T")[0] ?? "";

    return [
      { label: "Today", value: formatDateString(today) },
      { label: "Tomorrow", value: formatDateString(tomorrow) },
      { label: "Next Monday", value: formatDateString(nextMonday) },
      { label: "Next Friday", value: formatDateString(nextFriday) },
    ];
  }, []);

  const timeShortcuts = useMemo(
    () => [
      { label: "9:00 AM", value: "09:00" },
      { label: "11:00 AM", value: "11:00" },
      { label: "1:00 PM", value: "13:00" },
      { label: "3:00 PM", value: "15:00" },
      { label: "5:00 PM", value: "17:00" },
    ],
    []
  );

  const { data: members } = useClientMembers(clientId);

  const [expectedMemberIds, setExpectedMemberIds] = useState<Set<string>>(
    new Set()
  );

  const selectedClient = useMemo(
    () => (clientsQuery.data ?? []).find((c) => c.id === clientId),
    [clientsQuery.data, clientId]
  );

  const isSubmitDisabled = useMemo(
    () =>
      clientId.trim().length === 0 ||
      startMeetingMutation.isPending ||
      scheduleMeetingMutation.isPending ||
      createParticipant.isPending,
    [
      clientId,
      startMeetingMutation.isPending,
      scheduleMeetingMutation.isPending,
      createParticipant.isPending,
    ]
  );

  async function syncParticipants(meetingId: string) {
    if (expectedMemberIds.size === 0 || !members) {
      return;
    }
    await Promise.all(
      Array.from(expectedMemberIds).map(async (memberId) => {
        const member = members.find((m) => m.id === memberId);
        if (!member) {
          return;
        }
        try {
          await createParticipant.mutateAsync({
            meetingId,
            externalName: member.name,
            externalEmail: member.email || undefined,
            role: "PARTICIPANT",
          });
        } catch (err) {
          console.error(
            `Failed to create participant for member ${memberId} in meeting ${meetingId}`,
            err
          );
        }
      })
    );
  }

  async function handleScheduleMode(
    scheduledIso: string,
    trimmedTitle: string
  ) {
    const response = await scheduleMeetingMutation.mutateAsync({
      clientId,
      ...(trimmedTitle ? { title: trimmedTitle } : {}),
      ...(description.trim() ? { description: description.trim() } : {}),
      scheduledAt: scheduledIso,
    });
    await syncParticipants(response.id);
    navigate("/home");
  }

  async function handleStartMode(trimmedTitle: string) {
    const session = await startMeetingMutation.mutateAsync({
      clientId,
      ...(trimmedTitle ? { title: trimmedTitle } : {}),
      ...(description.trim() ? { description: description.trim() } : {}),
    });

    await syncParticipants(session.meetingId);

    navigate(`/meeting/${session.sessionId}/waiting-room`, {
      state: {
        role: "host",
        websocketUrl: session.websocketUrl,
        clientName: selectedClient?.name ?? "Client",
        meetingTitle: trimmedTitle || "Untitled meeting",
        startedAt: Date.now(),
        allowNameCustomization: session.allowNameCustomization,
        meetingId: session.meetingId,
      },
    });
  }

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

      if (scheduleMode === "schedule") {
        if (!scheduledIso) {
          throw new Error("Schedule date is required");
        }
        await handleScheduleMode(scheduledIso, trimmedTitle);
      } else {
        await handleStartMode(trimmedTitle);
      }
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "Could not start or schedule meeting";
      setError(message);
    }
  }

  return (
    <AppShell
      subtitle="Create an ad-hoc or scheduled session tied to a client."
      title="Start Meeting"
    >
      <motion.div
        animate={{ opacity: 1, y: 0 }}
        className="w-full overflow-hidden rounded-[16px] border border-border bg-bg-elevated shadow-sm"
        initial={{ opacity: 0, y: 20 }}
        transition={{ duration: 0.3 }}
      >
        <div className="border-border/40 border-b bg-bg-subtle/50 px-6 py-5 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
              <Video className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-bold font-heading text-fg text-lg tracking-tight">
                Meeting Details
              </h2>
              <p className="font-medium text-fg-muted text-xs">
                Configure your session parameters
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 pt-5">
          {clientsQuery.isPending ? (
            <p className="mb-4 text-fg-muted text-xs">Loading clients...</p>
          ) : null}
          {clientsQuery.error ? (
            <p className={cx(formErrorClass, "mb-4")}>
              {clientsQuery.error.message}
            </p>
          ) : null}

          <form className="flex flex-col gap-6" onSubmit={onSubmit}>
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <label
                  className="font-semibold text-fg text-xs"
                  htmlFor="meeting-client"
                >
                  Client <span className="text-danger">*</span>
                </label>
                <select
                  className="h-11 w-full rounded-full border border-border bg-bg-subtle px-4 font-medium text-fg text-sm transition-colors hover:border-border-strong focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                  id="meeting-client"
                  onChange={(event) => {
                    setClientId(event.target.value);
                    setExpectedMemberIds(new Set());
                  }}
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

              <div className="flex flex-col gap-2">
                <label
                  className="font-semibold text-fg text-xs"
                  htmlFor="meeting-title"
                >
                  Meeting Title{" "}
                  <span className="font-normal text-fg-muted">(optional)</span>
                </label>
                <input
                  className="h-11 w-full rounded-full border border-border bg-bg-subtle px-4 font-medium text-fg text-sm transition-colors placeholder:text-fg-subtle hover:border-border-strong focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                  id="meeting-title"
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="e.g. Weekly sync"
                  type="text"
                  value={title}
                />
              </div>
            </div>

            <ExpectedParticipantsPicker
              clientId={clientId}
              onSelectionChange={setExpectedMemberIds}
              selectedIds={expectedMemberIds}
            />

            <div className="flex flex-col gap-3 rounded-xl border border-border bg-bg-subtle/30 p-4">
              <span className="font-semibold text-fg text-xs">Timing</span>

              <div className="flex w-full rounded-full border border-border/60 bg-bg-subtle/50 p-1 shadow-[inset_0_2px_4px_rgba(0,0,0,0.05)] backdrop-blur-sm dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.1),inset_0_2px_4px_rgba(0,0,0,0.2)]">
                <button
                  className={cx(
                    "flex flex-1 items-center justify-center gap-2 rounded-full py-2.5 text-center font-semibold text-sm transition-all duration-300",
                    scheduleMode === "now"
                      ? "bg-bg-elevated text-fg shadow-[0_2px_8px_rgba(0,0,0,0.05),inset_0_1px_0_rgba(255,255,255,0.1)] ring-1 ring-border"
                      : "text-fg-muted hover:bg-fg/5 hover:text-fg"
                  )}
                  onClick={() => setScheduleMode("now")}
                  type="button"
                >
                  <Video className="h-4 w-4" /> Start Now
                </button>
                <button
                  className={cx(
                    "flex flex-1 items-center justify-center gap-2 rounded-full py-2.5 text-center font-semibold text-sm transition-all duration-300",
                    scheduleMode === "schedule"
                      ? "bg-bg-elevated text-fg shadow-[0_2px_8px_rgba(0,0,0,0.05),inset_0_1px_0_rgba(255,255,255,0.1)] ring-1 ring-border"
                      : "text-fg-muted hover:bg-fg/5 hover:text-fg"
                  )}
                  onClick={() => setScheduleMode("schedule")}
                  type="button"
                >
                  <Calendar className="h-4 w-4" /> Schedule Later
                </button>
              </div>

              {scheduleMode === "schedule" && (
                <motion.div
                  animate={{ opacity: 1, height: "auto" }}
                  className="mt-3 flex flex-col gap-5 border-border/40 border-t pt-5"
                  exit={{ opacity: 0, height: 0 }}
                  initial={{ opacity: 0, height: 0 }}
                >
                  <div className="grid gap-5 sm:grid-cols-2">
                    {/* Date Selector */}
                    <div className="flex flex-col gap-2">
                      <span className="font-semibold text-fg text-xs">
                        Date
                      </span>
                      <CustomDatePicker
                        onChange={(dateVal) => {
                          setSelectedDate(dateVal);
                          setScheduledAtLocal(`${dateVal}T${selectedTime}`);
                        }}
                        shortcuts={dateShortcuts}
                        value={selectedDate}
                      />
                    </div>

                    {/* Time Selector */}
                    <div className="flex flex-col gap-2">
                      <span className="font-semibold text-fg text-xs">
                        Time
                      </span>
                      <CustomTimePicker
                        onChange={(timeVal) => {
                          setSelectedTime(timeVal);
                          setScheduledAtLocal(`${selectedDate}T${timeVal}`);
                        }}
                        shortcuts={timeShortcuts}
                        value={selectedTime}
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <label
                className="font-semibold text-fg text-xs"
                htmlFor="meeting-description"
              >
                Description{" "}
                <span className="font-normal text-fg-muted">(optional)</span>
              </label>
              <textarea
                className="w-full resize-none rounded-lg border border-border bg-bg-subtle px-3 py-2.5 font-medium text-fg text-sm transition-colors placeholder:text-fg-subtle hover:border-border-strong focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                id="meeting-description"
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Context or objectives"
                rows={3}
                value={description}
              />
            </div>

            {error ? (
              <div className="rounded-lg border border-danger/20 bg-danger/5 p-3 font-medium text-danger text-sm">
                {error}
              </div>
            ) : null}

            <div className="mt-2 flex justify-end border-border/40 border-t pt-5">
              <button
                className="flex items-center gap-2 rounded-full bg-gradient-to-b from-accent to-accent/90 px-6 py-2.5 font-semibold text-accent-fg text-sm shadow-[0_2px_8px_rgba(0,0,0,0.15),inset_0_1px_0_rgba(255,255,255,0.2)] ring-1 ring-black/5 ring-inset transition-all duration-300 hover:shadow-[0_4px_16px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.2)] hover:brightness-110 active:scale-95 disabled:pointer-events-none disabled:opacity-50 dark:ring-white/10"
                disabled={isSubmitDisabled}
                type="submit"
              >
                {startMeetingMutation.isPending ||
                scheduleMeetingMutation.isPending ||
                createParticipant.isPending ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent-fg/30 border-t-accent-fg" />
                    {scheduleMode === "schedule"
                      ? "Scheduling..."
                      : "Starting..."}
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 fill-current" />
                    {scheduleMode === "now"
                      ? "Start Session"
                      : "Schedule Session"}
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </motion.div>
    </AppShell>
  );
}
