import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, X } from "lucide-react";
import type React from "react";
import { DotmSquare17 } from "../ui/dotm-square-17";
import { useBootSequence } from "./use-boot-sequence";

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

export function AppBootLoader({ children }: { children: React.ReactNode }) {
  const {
    stepLabel,
    progressPercent,
    isBootComplete,
    isRetrying,
    retrySecondsRemaining,
    triggerRetryNow,
    continueOffline,
    signOutAndReset,
  } = useBootSequence();

  return (
    <>
      {/* ── Live React App (Mounted underneath) ── */}
      {children}

      {/* ── Minimal Monochrome Stage-Driven Boot Loader ── */}
      <div
        className={`fixed inset-0 z-[99999] flex select-none flex-col items-center justify-between bg-[#0b0c0e] font-sans text-[#ededed] transition-all duration-300 ease-out ${
          isBootComplete
            ? "pointer-events-none scale-[0.99] opacity-0 blur-[2px]"
            : "opacity-100"
        }`}
        style={{ willChange: "opacity, transform" }}
      >
        {/* Top Title Drag Bar */}
        <header
          className="flex h-9 w-full select-none items-center justify-between px-4"
          data-tauri-drag-region
        >
          <div className="flex items-center gap-2" data-tauri-drag-region>
            <span className="font-['Share_Tech_Mono','Courier_New',monospace] text-[#52525b] text-[11px] tracking-[0.22em]">
              LARITY
            </span>
          </div>

          <div className="flex items-center gap-1 [-webkit-app-region:no-drag] [app-region:no-drag]">
            <button
              aria-label="Minimize"
              className="flex h-7 w-7 items-center justify-center rounded text-neutral-500 transition-colors hover:bg-white/5 hover:text-neutral-300"
              onClick={minimizeWindow}
              type="button"
            >
              <Minus size={12} strokeWidth={1.5} />
            </button>
            <button
              aria-label="Close"
              className="flex h-7 w-7 items-center justify-center rounded text-neutral-500 transition-colors hover:bg-white/5 hover:text-neutral-300"
              onClick={closeWindow}
              type="button"
            >
              <X size={12} strokeWidth={1.5} />
            </button>
          </div>
        </header>

        {/* Center Minimal Cluster */}
        <main className="flex flex-col items-center justify-center px-6 text-center">
          <DotmSquare17
            animated
            bloom
            color="#ededed"
            dotSize={4}
            halo={0.25}
            size={36}
            speed={2.2}
          />

          <p className="mt-6 font-medium text-[12px] text-neutral-300 tracking-tight">
            {stepLabel}
          </p>

          <div className="mt-4 h-[1.5px] w-32 overflow-hidden rounded-full bg-neutral-800">
            <div
              className="h-full bg-neutral-200 transition-all duration-500 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {/* ── Offline Reconnect UI ── */}
          {isRetrying && (
            <div className="mt-6 flex flex-col items-center gap-3 text-center">
              <p className="text-[11px] text-neutral-400">
                Reconnecting in {retrySecondsRemaining}s...
              </p>
              <div className="flex items-center gap-2 [-webkit-app-region:no-drag] [app-region:no-drag]">
                <button
                  className="rounded border border-neutral-700 bg-neutral-800/80 px-2.5 py-1 font-medium text-[11px] text-neutral-200 transition-colors hover:bg-neutral-700"
                  onClick={triggerRetryNow}
                  type="button"
                >
                  Retry Now
                </button>
                <button
                  className="rounded border border-neutral-800 bg-transparent px-2.5 py-1 font-medium text-[11px] text-neutral-400 transition-colors hover:text-neutral-200"
                  onClick={continueOffline}
                  type="button"
                >
                  Offline
                </button>
                <button
                  className="px-2 py-1 font-medium text-[11px] text-neutral-500 transition-colors hover:text-neutral-300"
                  onClick={signOutAndReset}
                  type="button"
                >
                  Sign Out
                </button>
              </div>
            </div>
          )}
        </main>

        {/* Bottom Spacer */}
        <footer className="h-9 w-full" />
      </div>
    </>
  );
}
