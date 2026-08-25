import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, X } from "lucide-react";
import type React from "react";
import { LarityLogo } from "../icons";
import { DotmSquare18 } from "../ui/dotm-square-18";
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
        className={`fixed inset-0 z-[99999] flex select-none flex-col items-center justify-between bg-[#0b0c0e] font-sans text-[#ededed] antialiased transition-all duration-300 ease-out ${
          isBootComplete
            ? "pointer-events-none scale-[0.99] opacity-0 blur-[2px]"
            : "opacity-100"
        }`}
        style={{ willChange: "opacity, transform" }}
      >
        {/* Top Window Titlebar */}
        <header
          className="flex h-11 w-full select-none items-center justify-between px-5"
          data-tauri-drag-region
        >
          <div className="flex items-center gap-2.5" data-tauri-drag-region>
            <div className="h-1.5 w-1.5 rounded-full bg-neutral-600/70" />
            <span className="font-['Share_Tech_Mono','Courier_New',monospace] font-medium text-[12px] text-neutral-500 tracking-[0.24em]">
              LARITY
            </span>
          </div>

          <div className="flex items-center gap-1 [-webkit-app-region:no-drag] [app-region:no-drag]">
            <button
              aria-label="Minimize window"
              className="flex h-8 w-8 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-white/5 hover:text-neutral-200"
              onClick={minimizeWindow}
              type="button"
            >
              <Minus size={14} strokeWidth={1.5} />
            </button>
            <button
              aria-label="Close window"
              className="flex h-8 w-8 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-white/5 hover:text-neutral-200"
              onClick={closeWindow}
              type="button"
            >
              <X size={14} strokeWidth={1.5} />
            </button>
          </div>
        </header>

        {/* Center Stage Cluster with Generous Proportions & Optical Centering */}
        <main className="flex flex-col items-center justify-center px-6 pb-12 text-center">
          {/* Confident, Scaled Geometric Logo */}
          <div className="flex items-center justify-center">
            <LarityLogo className="h-[52px] w-[58px] text-white drop-shadow-[0_0_24px_rgba(255,255,255,0.09)] transition-transform duration-700 hover:scale-[1.02]" />
          </div>

          {/* Equalizer Sound Bars & Status Label */}
          <div className="mt-8 flex h-7 items-center justify-center gap-3">
            <div className="flex items-center justify-center">
              <DotmSquare18
                animated
                bloom
                color="#f4f4f5"
                dotSize={3.5}
                halo={0.15}
                size={22}
                speed={1.5}
              />
            </div>
            <span className="font-medium text-[13px] text-neutral-200 tracking-tight subpixel-antialiased">
              {stepLabel}
            </span>
          </div>

          {/* Clean Hairline Progress Bar */}
          <div className="mt-5 h-[2px] w-52 overflow-hidden rounded-full bg-neutral-800/90">
            <div
              className="h-full bg-neutral-200 transition-all duration-500 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {/* ── Offline Reconnect UI ── */}
          {isRetrying && (
            <div className="mt-7 flex flex-col items-center gap-3.5 text-center">
              <p className="font-mono text-[12px] text-neutral-400">
                Reconnecting in {retrySecondsRemaining}s...
              </p>
              <div className="flex items-center gap-2.5 [-webkit-app-region:no-drag] [app-region:no-drag]">
                <button
                  className="rounded-md border border-neutral-700 bg-neutral-800/90 px-3 py-1.5 font-medium text-[12px] text-neutral-200 shadow-sm transition-all hover:border-neutral-600 hover:bg-neutral-700 hover:text-white active:scale-[0.98]"
                  onClick={triggerRetryNow}
                  type="button"
                >
                  Retry Now
                </button>
                <button
                  className="rounded-md border border-neutral-800 bg-neutral-900/60 px-3 py-1.5 font-medium text-[12px] text-neutral-400 transition-all hover:border-neutral-700 hover:text-neutral-200 active:scale-[0.98]"
                  onClick={continueOffline}
                  type="button"
                >
                  Offline
                </button>
                <button
                  className="px-2.5 py-1.5 font-medium text-[12px] text-neutral-500 transition-colors hover:text-neutral-300"
                  onClick={signOutAndReset}
                  type="button"
                >
                  Sign Out
                </button>
              </div>
            </div>
          )}
        </main>

        {/* Bottom Spacer (Balances the 44px titlebar) */}
        <footer className="h-11 w-full" />
      </div>
    </>
  );
}
