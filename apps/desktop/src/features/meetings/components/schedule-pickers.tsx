import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cx } from "../../../lib/ui";

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

export function parse24HourTime(time24: string): {
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

export function formatTo24HourTime(
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

export interface CustomDatePickerProps {
  onChange: (val: string) => void;
  shortcuts: { label: string; value: string }[];
  value: string;
}

export function CustomDatePicker({
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

export interface CustomTimePickerProps {
  onChange: (val: string) => void;
  shortcuts: { label: string; value: string }[];
  value: string;
}

export function CustomTimePicker({
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
