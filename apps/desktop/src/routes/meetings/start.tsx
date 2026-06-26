import { Calendar, ChevronLeft, ChevronRight, Play, Video } from "lucide-react";
import { motion } from "motion/react";
import type { FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useClientMembers } from "../../features/clients/use-client-members";
import { ExpectedParticipantsPicker } from "../../features/meetings/components/expected-participants-picker";
import { useClients } from "../../features/meetings/use-clients";
import { useCreateMeetingParticipant } from "../../features/meetings/use-create-meeting-participant";
import { useScheduleMeeting } from "../../features/meetings/use-schedule-meeting";
import { useStartMeeting } from "../../features/meetings/use-start-meeting";
import { cx, formErrorClass } from "../../lib/ui";
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
    return;
  }
  const trimmed = scheduledAtLocal.trim();
  return trimmed ? new Date(trimmed).toISOString() : undefined;
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function parse24HourTime(time24: string): {
  hour: number;
  minute: number;
  isPm: boolean;
} {
  const parts = time24.split(":");
  let hour24 = Number.parseInt(parts[0] || "12", 10);
  if (Number.isNaN(hour24)) {
    hour24 = 12;
  }
  const minute = Number.parseInt(parts[1] || "00", 10) || 0;
  const isPm = hour24 >= 12;
  let hour12 = hour24 % 12;
  if (hour12 === 0) {
    hour12 = 12;
  }
  return { hour: hour12, minute, isPm };
}

function formatTo24HourTime(
  hour12: number,
  minute: number,
  isPm: boolean
): string {
  let h24 = hour12;
  if (isPm) {
    if (h24 < 12) {
      h24 += 12;
    }
  } else if (h24 === 12) {
    h24 = 0;
  }
  const hh = String(h24).padStart(2, "0");
  const mm = String(minute).padStart(2, "0");
  return `${hh}:${mm}`;
}

interface CustomDatePickerProps {
  onChange: (val: string) => void;
  shortcuts: { label: string; value: string }[];
  value: string;
}

function CustomDatePicker({
  value,
  onChange,
  shortcuts,
}: CustomDatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const [year, month, day] = useMemo((): [number, number, number] => {
    const parts = value.split("-").map((x) => Number.parseInt(x, 10));
    if (parts.length === 3 && !Number.isNaN(parts[0])) {
      return [parts[0] as number, (parts[1] ?? 1) - 1, parts[2] ?? 1];
    }
    const d = new Date();
    return [d.getFullYear(), d.getMonth(), d.getDate()];
  }, [value]);

  const [viewYear, setViewYear] = useState(year);
  const [viewMonth, setViewMonth] = useState(month);

  useEffect(() => {
    setViewYear(year);
    setViewMonth(month);
  }, [year, month]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    function handleClickOutside(e: Event) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside, true);
    document.addEventListener("touchstart", handleClickOutside, true);
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside, true);
      document.removeEventListener("touchstart", handleClickOutside, true);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [isOpen]);

  const daysInMonth = useMemo(
    () => new Date(viewYear, viewMonth + 1, 0).getDate(),
    [viewYear, viewMonth]
  );
  const firstDayIndex = useMemo(
    () => new Date(viewYear, viewMonth, 1).getDay(),
    [viewYear, viewMonth]
  );
  const emptyDays = useMemo(
    () =>
      Array.from(
        { length: firstDayIndex },
        (_, i) => `empty-${viewYear}-${viewMonth}-${i}`
      ),
    [firstDayIndex, viewYear, viewMonth]
  );

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const handleDayClick = (d: number) => {
    const formattedMonth = String(viewMonth + 1).padStart(2, "0");
    const formattedDay = String(d).padStart(2, "0");
    onChange(`${viewYear}-${formattedMonth}-${formattedDay}`);
    setIsOpen(false);
  };

  const formattedDisplay = useMemo(() => {
    const d = new Date(year, month, day);
    return d.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }, [year, month, day]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        className="flex h-11 w-full items-center justify-between rounded-full border border-border bg-bg-subtle px-5 font-medium text-fg text-sm transition-colors [-webkit-app-region:no-drag] [app-region:no-drag] hover:border-border-strong focus:border-accent focus:outline-none"
        onClick={() => setIsOpen(!isOpen)}
        type="button"
      >
        <span>{formattedDisplay}</span>
        <Calendar className="h-4 w-4 text-fg-muted" />
      </button>

      {isOpen && (
        <div className="absolute left-0 z-50 mt-2 w-[280px] rounded-xl border border-border bg-bg-elevated p-4 shadow-xl">
          <div className="mb-4 flex items-center justify-between">
            <button
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-bg transition-colors hover:bg-bg-subtle"
              onClick={handlePrevMonth}
              type="button"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="font-semibold text-fg text-xs">
              {MONTH_NAMES[viewMonth]} {viewYear}
            </span>
            <button
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-bg transition-colors hover:bg-bg-subtle"
              onClick={handleNextMonth}
              type="button"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="mb-2 grid grid-cols-7 text-center font-bold text-[10px] text-fg-muted uppercase tracking-wider">
            {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((w) => (
              <span key={w}>{w}</span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-xs">
            {emptyDays.map((k) => (
              <span key={k} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const d = i + 1;
              const isSelected =
                viewYear === year && viewMonth === month && d === day;
              return (
                <button
                  className={cx(
                    "flex h-7 w-7 items-center justify-center rounded-full font-semibold transition-all active:scale-95",
                    isSelected
                      ? "bg-accent text-accent-fg"
                      : "text-fg hover:bg-bg-subtle"
                  )}
                  key={`day-${d}`}
                  onClick={() => handleDayClick(d)}
                  type="button"
                >
                  {d}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {shortcuts.map((s) => {
          const isActive = value === s.value;
          return (
            <button
              className={cx(
                "rounded-full border px-3 py-1 font-semibold text-[11px] transition-all active:scale-95",
                isActive
                  ? "border-accent bg-accent text-accent-fg"
                  : "border-border bg-bg text-fg-muted hover:border-border-strong hover:text-fg"
              )}
              key={s.label}
              onClick={() => {
                onChange(s.value);
                setIsOpen(false);
              }}
              type="button"
            >
              {s.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface CustomTimePickerProps {
  onChange: (val: string) => void;
  shortcuts: { label: string; value: string }[];
  value: string;
}

function CustomTimePicker({
  value,
  onChange,
  shortcuts,
}: CustomTimePickerProps) {
  const hourRef = useRef<HTMLInputElement>(null);
  const minuteRef = useRef<HTMLInputElement>(null);

  const [hourFocused, setHourFocused] = useState(false);
  const [minuteFocused, setMinuteFocused] = useState(false);
  const [activeSegment, setActiveSegment] = useState<"hour" | "minute">("hour");

  const {
    hour: parsedHour,
    minute: parsedMinute,
    isPm: parsedIsPm,
  } = useMemo(() => parse24HourTime(value), [value]);

  const [hourInput, setHourInput] = useState(
    String(parsedHour).padStart(2, "0")
  );
  const [minuteInput, setMinuteInput] = useState(
    String(parsedMinute).padStart(2, "0")
  );

  useEffect(() => {
    if (!hourFocused) {
      setHourInput(String(parsedHour).padStart(2, "0"));
    }
  }, [parsedHour, hourFocused]);

  useEffect(() => {
    if (!minuteFocused) {
      setMinuteInput(String(parsedMinute).padStart(2, "0"));
    }
  }, [parsedMinute, minuteFocused]);

  const stateRef = useRef({
    hour: parsedHour,
    minute: parsedMinute,
    isPm: parsedIsPm,
  });
  stateRef.current = {
    hour: parsedHour,
    minute: parsedMinute,
    isPm: parsedIsPm,
  };

  const incrementHour = () => {
    const { hour, minute, isPm } = stateRef.current;
    const nextHour = hour === 12 ? 1 : hour + 1;
    onChange(formatTo24HourTime(nextHour, minute, isPm));
  };

  const decrementHour = () => {
    const { hour, minute, isPm } = stateRef.current;
    const nextHour = hour === 1 ? 12 : hour - 1;
    onChange(formatTo24HourTime(nextHour, minute, isPm));
  };

  const incrementMinute = () => {
    const { hour, minute, isPm } = stateRef.current;
    const nextMinute = minute === 59 ? 0 : minute + 1;
    onChange(formatTo24HourTime(hour, nextMinute, isPm));
  };

  const decrementMinute = () => {
    const { hour, minute, isPm } = stateRef.current;
    const nextMinute = minute === 0 ? 59 : minute - 1;
    onChange(formatTo24HourTime(hour, nextMinute, isPm));
  };

  const callbacksRef = useRef({
    incrementHour,
    decrementHour,
    incrementMinute,
    decrementMinute,
  });
  callbacksRef.current = {
    incrementHour,
    decrementHour,
    incrementMinute,
    decrementMinute,
  };

  useEffect(() => {
    const hrEl = hourRef.current;
    const minEl = minuteRef.current;

    function handleHourWheelEvent(e: WheelEvent) {
      e.preventDefault();
      if (e.deltaY < 0) {
        callbacksRef.current.incrementHour();
      } else {
        callbacksRef.current.decrementHour();
      }
    }

    function handleMinuteWheelEvent(e: WheelEvent) {
      e.preventDefault();
      if (e.deltaY < 0) {
        callbacksRef.current.incrementMinute();
      } else {
        callbacksRef.current.decrementMinute();
      }
    }

    if (hrEl) {
      hrEl.addEventListener("wheel", handleHourWheelEvent, { passive: false });
    }
    if (minEl) {
      minEl.addEventListener("wheel", handleMinuteWheelEvent, {
        passive: false,
      });
    }

    return () => {
      if (hrEl) {
        hrEl.removeEventListener("wheel", handleHourWheelEvent);
      }
      if (minEl) {
        minEl.removeEventListener("wheel", handleMinuteWheelEvent);
      }
    };
  }, []);

  const handleHourChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, "");
    if (val.length === 0) {
      setHourInput("");
      return;
    }
    const num = Number.parseInt(val, 10);
    if (val === "0") {
      setHourInput("0");
      return;
    }
    if (num >= 1 && num <= 12) {
      setHourInput(val);
      onChange(formatTo24HourTime(num, parsedMinute, parsedIsPm));
      if (val.length === 2 || num >= 2) {
        minuteRef.current?.focus();
        minuteRef.current?.select();
      }
    } else if (num > 12) {
      const lastDigit = val.slice(-1);
      const lastNum = Number.parseInt(lastDigit, 10);
      setHourInput(lastDigit);
      onChange(formatTo24HourTime(lastNum, parsedMinute, parsedIsPm));
      minuteRef.current?.focus();
      minuteRef.current?.select();
    }
  };

  const handleMinuteChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, "");
    if (val.length === 0) {
      setMinuteInput("");
      return;
    }
    const num = Number.parseInt(val, 10);
    if (num >= 0 && num <= 59) {
      setMinuteInput(val);
      onChange(formatTo24HourTime(parsedHour, num, parsedIsPm));
    } else if (num > 59) {
      const lastDigit = val.slice(-1);
      const lastNum = Number.parseInt(lastDigit, 10);
      setMinuteInput(lastDigit);
      onChange(formatTo24HourTime(parsedHour, lastNum, parsedIsPm));
    }
  };

  const handleHourBlur = () => {
    setHourFocused(false);
    if (hourInput) {
      const num = Number.parseInt(hourInput, 10);
      setHourInput(String(num).padStart(2, "0"));
    } else {
      setHourInput(String(parsedHour).padStart(2, "0"));
    }
  };

  const handleMinuteBlur = () => {
    setMinuteFocused(false);
    if (minuteInput) {
      const num = Number.parseInt(minuteInput, 10);
      setMinuteInput(String(num).padStart(2, "0"));
    } else {
      setMinuteInput(String(parsedMinute).padStart(2, "0"));
    }
  };

  const handleHourKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      incrementHour();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      decrementHour();
    }
  };

  const handleMinuteKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      incrementMinute();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      decrementMinute();
    } else if (e.key === "Backspace" && !minuteInput) {
      e.preventDefault();
      hourRef.current?.focus();
      hourRef.current?.select();
    }
  };

  const handleIncrementClick = () => {
    if (activeSegment === "hour") {
      incrementHour();
    } else {
      incrementMinute();
    }
  };

  const handleDecrementClick = () => {
    if (activeSegment === "hour") {
      decrementHour();
    } else {
      decrementMinute();
    }
  };

  return (
    <div className="relative">
      <div className="flex h-11 w-full items-center justify-between rounded-full border border-border bg-bg-subtle px-5 font-medium text-fg text-sm transition-colors [-webkit-app-region:no-drag] [app-region:no-drag] focus-within:border-accent focus-within:ring-1 focus-within:ring-accent hover:border-border-strong">
        <div className="flex items-center gap-1">
          <input
            className="w-7 border-none bg-transparent p-0 text-center font-medium text-fg text-sm outline-none focus:outline-none focus:ring-0"
            inputMode="numeric"
            maxLength={2}
            onBlur={handleHourBlur}
            onChange={handleHourChange}
            onFocus={(e) => {
              setHourFocused(true);
              setActiveSegment("hour");
              e.target.select();
            }}
            onKeyDown={handleHourKeyDown}
            pattern="[0-9]*"
            placeholder="12"
            ref={hourRef}
            type="text"
            value={hourInput}
          />
          <span className="select-none font-semibold text-fg-muted text-sm">
            :
          </span>
          <input
            className="w-7 border-none bg-transparent p-0 text-center font-medium text-fg text-sm outline-none focus:outline-none focus:ring-0"
            inputMode="numeric"
            maxLength={2}
            onBlur={handleMinuteBlur}
            onChange={handleMinuteChange}
            onFocus={(e) => {
              setMinuteFocused(true);
              setActiveSegment("minute");
              e.target.select();
            }}
            onKeyDown={handleMinuteKeyDown}
            pattern="[0-9]*"
            placeholder="00"
            ref={minuteRef}
            type="text"
            value={minuteInput}
          />
        </div>

        <div className="flex items-center gap-3">
          <div className="flex rounded-full border border-border bg-bg-elevated p-0.5">
            <button
              className={cx(
                "rounded-full px-2.5 py-0.5 font-bold text-[10px] uppercase transition-all active:scale-95",
                parsedIsPm
                  ? "text-fg-muted hover:text-fg"
                  : "bg-accent text-accent-fg shadow-[0_1px_3px_rgba(0,0,0,0.1)]"
              )}
              onClick={() => {
                onChange(formatTo24HourTime(parsedHour, parsedMinute, false));
                hourRef.current?.focus();
              }}
              type="button"
            >
              AM
            </button>
            <button
              className={cx(
                "rounded-full px-2.5 py-0.5 font-bold text-[10px] uppercase transition-all active:scale-95",
                parsedIsPm
                  ? "bg-accent text-accent-fg shadow-[0_1px_3px_rgba(0,0,0,0.1)]"
                  : "text-fg-muted hover:text-fg"
              )}
              onClick={() => {
                onChange(formatTo24HourTime(parsedHour, parsedMinute, true));
                hourRef.current?.focus();
              }}
              type="button"
            >
              PM
            </button>
          </div>

          <div className="flex flex-col text-fg-muted">
            <button
              className="flex h-4 w-4 items-center justify-center rounded transition-colors hover:bg-bg-emphasis hover:text-fg active:scale-90"
              onClick={handleIncrementClick}
              tabIndex={-1}
              type="button"
            >
              ▲
            </button>
            <button
              className="flex h-4 w-4 items-center justify-center rounded transition-colors hover:bg-bg-emphasis hover:text-fg active:scale-90"
              onClick={handleDecrementClick}
              tabIndex={-1}
              type="button"
            >
              ▼
            </button>
          </div>
        </div>
      </div>

      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {shortcuts.map((t) => {
          const isActive = value === t.value;
          return (
            <button
              className={cx(
                "rounded-full border px-3 py-1 font-semibold text-[11px] transition-all active:scale-95",
                isActive
                  ? "border-accent bg-accent text-accent-fg"
                  : "border-border bg-bg text-fg-muted hover:border-border-strong hover:text-fg"
              )}
              key={t.label}
              onClick={() => {
                onChange(t.value);
              }}
              type="button"
            >
              {t.label}
            </button>
          );
        })}
      </div>
    </div>
  );
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
