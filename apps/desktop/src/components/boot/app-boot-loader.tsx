import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  AlertCircle,
  ArrowRight,
  Minus,
  RefreshCw,
  Volume2,
  X,
} from "lucide-react";
import type React from "react";
import { DotmSquare17 } from "../ui/dotm-square-17";
import { type BootStep, useBootSequence } from "./use-boot-sequence";

async function minimizeWindow() {
  try {
    await getCurrentWindow().minimize();
  } catch {
    // Non-Tauri fallback
  }
}

async function closeWindow() {
  try {
    await getCurrentWindow().close();
  } catch {
    // Non-Tauri fallback
  }
}

const STEP_NAMES: Record<BootStep, string> = {
  1: "Runtime",
  2: "Audio",
  3: "Workspace",
  4: "Ready",
};

function getStepPillClass(isPast: boolean, isCurrent: boolean): string {
  if (isPast) {
    return "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30";
  }
  if (isCurrent) {
    return "bg-neutral-800 text-neutral-100 border border-neutral-700 shadow-sm";
  }
  return "bg-neutral-900/60 text-neutral-600 border border-neutral-800/40";
}

function getStepDotClass(isPast: boolean, isCurrent: boolean): string {
  if (isPast) {
    return "bg-indigo-400";
  }
  if (isCurrent) {
    return "bg-indigo-400 animate-pulse";
  }
  return "bg-neutral-700";
}

export function AppBootLoader({ children }: { children: React.ReactNode }) {
  const {
    step,
    stepLabel,
    statusDetail,
    progressPercent,
    isBootComplete,
    isRetrying,
    retryAttempt,
    retrySecondsRemaining,
    audioWarning,
    error,
    triggerRetryNow,
    continueOffline,
    signOutAndReset,
  } = useBootSequence();

  return (
    <>
      {/* ── Live React App (Mounted underneath) ── */}
      {children}

      {/* ── Stage-Driven Boot Loader Screen ── */}
      <div
        className={`fixed inset-0 z-[99999] flex select-none flex-col items-center justify-between bg-[#0b0c0e] font-sans text-neutral-100 transition-all duration-300 ease-out ${
          isBootComplete
            ? "pointer-events-none scale-[0.99] opacity-0 blur-[2px]"
            : "opacity-100"
        }`}
        style={{ willChange: "opacity, transform" }}
      >
        {/* Top Frameless Title Drag Region */}
        <header
          className="flex h-10 w-full select-none items-center justify-between px-4"
          data-tauri-drag-region
        >
          <div className="flex items-center gap-2" data-tauri-drag-region>
            <span className="font-['Share_Tech_Mono','Courier_New',monospace] text-[11px] text-neutral-500 tracking-[0.25em]">
              LARITY
            </span>
          </div>

          <div className="flex items-center gap-1 [-webkit-app-region:no-drag] [app-region:no-drag]">
            <button
              aria-label="Minimize"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-white/5 hover:text-neutral-200"
              onClick={minimizeWindow}
              type="button"
            >
              <Minus size={13} strokeWidth={1.5} />
            </button>
            <button
              aria-label="Close"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-red-500/20 hover:text-red-300"
              onClick={closeWindow}
              type="button"
            >
              <X size={13} strokeWidth={1.5} />
            </button>
          </div>
        </header>

        {/* Center Loading Cluster */}
        <main className="flex flex-col items-center justify-center px-6 py-12 text-center">
          {/* Centered Dot Matrix Animation */}
          <div className="relative mb-8 flex h-16 w-16 items-center justify-center">
            <div className="absolute inset-0 rounded-2xl bg-indigo-500/10 blur-xl filter" />
            <DotmSquare17
              animated
              bloom
              className="relative z-10 text-indigo-400"
              color="#818cf8"
              dotSize={6}
              halo={0.5}
              size={48}
              speed={2.2}
            />
          </div>

          {/* Step Progression Indicators */}
          <div className="mb-6 flex items-center gap-2">
            {([1, 2, 3, 4] as BootStep[]).map((s) => {
              const isPast = step > s;
              const isCurrent = step === s;
              return (
                <div
                  className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium text-[11px] transition-all duration-300 ${getStepPillClass(isPast, isCurrent)}`}
                  key={s}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${getStepDotClass(isPast, isCurrent)}`}
                  />
                  <span>{STEP_NAMES[s]}</span>
                </div>
              );
            })}
          </div>

          {/* Current Step Label & Subtitle */}
          <div className="mb-6 max-w-sm">
            <h2 className="font-medium text-[15px] text-neutral-100 tracking-tight">
              {stepLabel}
            </h2>
            <p className="mt-1 text-[12px] text-neutral-400 transition-opacity duration-200">
              {statusDetail}
            </p>
          </div>

          {/* Progress Hairline Bar */}
          <div className="mb-6 h-[2px] w-56 overflow-hidden rounded-full bg-neutral-800">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-400 transition-all duration-500 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {/* ── Failure / Exponential Backoff Retry UI ── */}
          {isRetrying && (
            <div className="fade-in zoom-in-95 mt-2 flex max-w-md animate-in flex-col items-center gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-center duration-200">
              <div className="flex items-center gap-2 font-medium text-[13px] text-amber-300">
                <AlertCircle size={15} />
                <span>
                  Reconnecting in {retrySecondsRemaining}s (Attempt #
                  {retryAttempt})
                </span>
              </div>
              <p className="text-[12px] text-neutral-400 leading-relaxed">
                {error ||
                  "Unable to establish connection with Larity services."}
              </p>

              <div className="mt-1 flex flex-wrap items-center justify-center gap-2 [-webkit-app-region:no-drag] [app-region:no-drag]">
                <button
                  className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 font-medium text-[12px] text-white shadow-sm transition-all hover:bg-indigo-500 active:scale-95"
                  onClick={triggerRetryNow}
                  type="button"
                >
                  <RefreshCw className="animate-spin-slow" size={12} />
                  <span>Retry Now</span>
                </button>
                <button
                  className="flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 font-medium text-[12px] text-neutral-200 transition-all hover:bg-neutral-700 active:scale-95"
                  onClick={continueOffline}
                  type="button"
                >
                  <span>Continue Offline</span>
                  <ArrowRight size={12} />
                </button>
                <button
                  className="rounded-lg px-2.5 py-1.5 font-medium text-[11px] text-neutral-400 transition-colors hover:text-neutral-200"
                  onClick={signOutAndReset}
                  type="button"
                >
                  Sign Out
                </button>
              </div>
            </div>
          )}
        </main>

        {/* Bottom Hardware Status / Fallback Notice */}
        <footer className="flex h-10 w-full items-center justify-between px-6 text-[11px] text-neutral-500">
          <div className="flex items-center gap-2">
            {audioWarning ? (
              <span className="flex items-center gap-1 text-amber-400/80">
                <Volume2 size={12} />
                <span>Audio engine fallback active</span>
              </span>
            ) : (
              <span className="text-neutral-500">Larity Desktop v0.1.1</span>
            )}
          </div>
          <span className="font-mono text-[10px] text-neutral-600">
            {step < 4 ? "STAGE_INITIALIZING" : "STAGE_READY"}
          </span>
        </footer>
      </div>
    </>
  );
}
