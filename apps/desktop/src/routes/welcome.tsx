import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { cx } from "../lib/ui";
import { applyWindowProfile, WINDOW_PROFILES } from "../lib/window";

const larityLogo = "/images/larity-logo-dark.svg";

type Stage = "idle" | "logo" | "wordmark" | "tagline" | "cta" | "complete";

const STAGE_ORDER: Stage[] = [
  "idle",
  "logo",
  "wordmark",
  "tagline",
  "cta",
  "complete",
];

const STAGE_DELAYS: Record<Stage, number> = {
  idle: 0,
  logo: 400,
  wordmark: 1000,
  tagline: 1650,
  cta: 2350,
  complete: 3200,
};

export function WelcomePage() {
  const [stage, setStage] = useState<Stage>("idle");
  const navigate = useNavigate();

  // Set window to small portrait intro size
  useEffect(() => {
    applyWindowProfile(WINDOW_PROFILES.intro, { center: true }).catch(() => {
      // window resize is best-effort outside Tauri
    });
  }, []);

  // Drive sequential element entry
  useEffect(() => {
    const stages: Stage[] = ["logo", "wordmark", "tagline", "cta", "complete"];
    const timers: ReturnType<typeof setTimeout>[] = [];

    for (const s of stages) {
      const id = setTimeout(() => {
        setStage(s);
      }, STAGE_DELAYS[s]);
      timers.push(id);
    }

    return () => {
      for (const id of timers) {
        clearTimeout(id);
      }
    };
  }, []);

  const visible = (s: Stage) =>
    STAGE_ORDER.indexOf(stage) >= STAGE_ORDER.indexOf(s);

  return (
    <div className="relative isolate flex h-screen w-screen items-center justify-center overflow-hidden bg-black">
      {/* GPU-composited ambient background glow layers */}
      <div className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center overflow-hidden">
        {/* Rotating conic light sweep */}
        <div className="h-[180vmax] w-[180vmax] shrink-0 transform-gpu animate-[welcomeSpin_22s_linear_infinite] rounded-full bg-[conic-gradient(from_0deg_at_50%_50%,transparent_0deg,#ffffff40_40deg,#cccccc60_80deg,#99999938_110deg,transparent_150deg,transparent_210deg,#e6e6e655_250deg,#ffffff48_290deg,transparent_330deg,transparent_360deg)] blur-[48px] will-change-transform" />

        {/* Outer ambient bloom */}
        <div className="absolute h-[120vmax] w-[120vmax] transform-gpu animate-[splashBloom_5s_cubic-bezier(0.45,0,0.55,1)_infinite_alternate] rounded-full bg-[radial-gradient(ellipse_at_50%_50%,rgba(255,255,255,0.22)_0%,rgba(200,200,200,0.12)_35%,transparent_70%)] blur-[40px] will-change-transform" />

        {/* Inner core bloom */}
        <div className="absolute h-[80vmax] w-[80vmax] transform-gpu animate-[splashBloom_7s_cubic-bezier(0.45,0,0.55,1)_infinite_alternate-reverse] rounded-full bg-[radial-gradient(ellipse_at_50%_50%,rgba(255,255,255,0.14)_0%,transparent_65%)] blur-[28px] will-change-transform" />
      </div>

      <main
        aria-label="Larity introduction"
        className="relative z-[1] flex w-full max-w-80 flex-col items-center bg-transparent px-10 pt-14 pb-12"
      >
        {/* Logo */}
        <div
          className={cx(
            "mb-7 translate-y-4 scale-[0.96] opacity-0 transition-[opacity,transform] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-transform",
            visible("logo") && "translate-y-0 scale-100 opacity-100"
          )}
        >
          {/* biome-ignore lint/performance/noImgElement: not a Next.js project */}
          <img
            alt="Larity logo"
            className="block h-auto w-11 drop-shadow-[0_0_18px_rgba(255,255,255,0.55)]"
            height={40}
            src={larityLogo}
            width={40}
          />
        </div>

        {/* Wordmark */}
        <div
          className={cx(
            "mb-3.5 translate-y-4 scale-[0.98] text-center font-['Share_Tech_Mono','Courier_New',monospace] font-normal text-[#f0f0f0] text-[28px] leading-none tracking-[0.26em] opacity-0 transition-[opacity,transform] delay-[100ms] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-transform [text-shadow:0_0_32px_rgba(255,255,255,0.45),0_0_8px_rgba(255,255,255,0.2)]",
            visible("wordmark") && "translate-y-0 scale-100 opacity-100"
          )}
        >
          LARITY
        </div>

        {/* Tagline */}
        <div
          className={cx(
            "mb-9 translate-y-3 text-center font-medium text-[rgba(161,161,161,0.7)] text-xs leading-normal tracking-[0.06em] opacity-0 transition-[opacity,transform] delay-[120ms] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-transform",
            visible("tagline") && "translate-y-0 opacity-100"
          )}
        >
          Work, with memory.
        </div>

        {/* Accent divider */}
        <div
          className={cx(
            "mb-9 h-px w-9 translate-y-2 scale-x-50 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.7),transparent)] opacity-0 transition-[opacity,transform] delay-[180ms] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-transform",
            visible("tagline") && "translate-y-0 scale-x-100 opacity-100"
          )}
        />

        {/* CTA */}
        <button
          className={cx(
            "relative h-auto cursor-pointer overflow-hidden rounded-[var(--radius-button,6px)] border border-white/30 bg-[linear-gradient(180deg,rgba(255,255,255,0.16),rgba(255,255,255,0.045))] px-7 py-[11px] font-['Share_Tech_Mono','Courier_New',monospace] font-normal text-[11px] text-[rgba(248,248,248,0.96)] leading-none tracking-[0.22em] shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_0_26px_rgba(255,255,255,0.12),inset_0_1px_0_rgba(255,255,255,0.18)] transition-[opacity,transform,border-color,color,box-shadow,background-color] delay-[150ms] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-transform before:absolute before:inset-0 before:bg-[linear-gradient(115deg,transparent_0%,rgba(255,255,255,0.24)_38%,transparent_62%)] before:opacity-0 before:transition-opacity before:duration-300 before:content-[''] after:absolute after:inset-[1px] after:rounded-[5px] after:bg-[radial-gradient(ellipse_at_50%_0%,rgba(255,255,255,0.16),transparent_58%)] after:content-[''] hover:border-white/60 hover:bg-[linear-gradient(180deg,rgba(255,255,255,0.22),rgba(255,255,255,0.07))] hover:text-white hover:shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_0_28px_rgba(255,255,255,0.22),inset_0_1px_0_rgba(255,255,255,0.28),inset_0_0_18px_rgba(255,255,255,0.08)] hover:before:opacity-100 active:scale-[0.96] active:shadow-[0_0_0_1px_rgba(255,255,255,0.04),inset_0_0_14px_rgba(0,0,0,0.35)]",
            "translate-y-4 scale-[0.96] opacity-0",
            visible("cta") && "translate-y-0 scale-100 opacity-100"
          )}
          onClick={() => {
            navigate("/login");
          }}
          type="button"
        >
          <span className="relative z-10">BEGIN &gt;</span>
        </button>
      </main>
    </div>
  );
}
