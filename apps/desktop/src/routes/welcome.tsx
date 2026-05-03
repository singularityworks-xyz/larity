import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import larityLogo from "../assets/larity-logo-dark.svg";
import { cx } from "../lib/ui";
import { applyWindowProfile, WINDOW_PROFILES } from "../lib/window";

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
  logo: 600,
  wordmark: 1400,
  tagline: 2300,
  cta: 3300,
  complete: 4500,
};

export function WelcomePage() {
  const [stage, setStage] = useState<Stage>("idle");
  const navigate = useNavigate();
  const bgRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);

  // Set window to small portrait intro size
  useEffect(() => {
    applyWindowProfile(WINDOW_PROFILES.intro, { center: true }).catch(() => {
      // window resize is best-effort outside Tauri
    });
  }, []);

  // Animate the background gradient — ramps up then eases to a gentle drift
  useEffect(() => {
    const DURATION = 4000; // ms over which gradient peaks and settles
    const PEAK_SPEED = 0.001; // much slower peak rotation (rad/ms)
    const BASE_SPEED = 0.0002; // very gentle resting drift

    let angle = 0;

    const tick = (now: number) => {
      if (!startTimeRef.current) {
        startTimeRef.current = now;
      }
      const elapsed = now - startTimeRef.current;
      const t = Math.min(elapsed / DURATION, 1);

      // Bell-curve: ramp up fast, then decay back to BASE_SPEED
      const bell = Math.sin(t * Math.PI);
      const speed = BASE_SPEED + (PEAK_SPEED - BASE_SPEED) * bell;
      angle += speed * 16; // assumes ~16ms per frame

      if (bgRef.current) {
        bgRef.current.style.setProperty("--angle", `${angle}rad`);
      }

      animFrameRef.current = requestAnimationFrame(tick);
    };

    animFrameRef.current = requestAnimationFrame(tick);
    return () => {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
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
      {/* Animated gradient layer */}
      <div
        className="pointer-events-none absolute -inset-1/2 z-0 bg-[conic-gradient(from_var(--angle,0rad)_at_50%_50%,transparent_0deg,#ffffff40_40deg,#cccccc60_80deg,#99999938_110deg,transparent_150deg,transparent_210deg,#e6e6e655_250deg,#ffffff48_290deg,transparent_330deg,transparent_360deg)] blur-[48px] will-change-transform before:absolute before:inset-[15%] before:animate-[splashBloom_5s_cubic-bezier(0.45,0,0.55,1)_infinite_alternate] before:rounded-full before:bg-[radial-gradient(ellipse_at_50%_60%,rgba(255,255,255,0.22)_0%,rgba(200,200,200,0.12)_35%,transparent_70%)] before:content-[''] after:absolute after:inset-[30%] after:animate-[splashBloom_7s_cubic-bezier(0.45,0,0.55,1)_infinite_alternate-reverse] after:rounded-full after:bg-[radial-gradient(ellipse_at_50%_50%,rgba(255,255,255,0.14)_0%,transparent_65%)] after:content-['']"
        ref={bgRef}
      />

      <main
        aria-label="Larity introduction"
        className="relative z-[1] flex w-full max-w-80 flex-col items-center bg-transparent px-10 pt-14 pb-12"
      >
        {/* Logo */}
        <div
          className={cx(
            "mb-7 translate-y-5 scale-[0.96] opacity-0 blur-[6px] transition-[opacity,transform,filter] duration-[1300ms] ease-[cubic-bezier(0.16,1,0.3,1)]",
            visible("logo") && "translate-y-0 scale-100 opacity-100 blur-none"
          )}
        >
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
            "mb-3.5 translate-y-5 scale-[0.98] text-center font-['Share_Tech_Mono','Courier_New',monospace] font-normal text-[#f0f0f0] text-[28px] leading-none tracking-[0.26em] opacity-0 blur-[4px] transition-[opacity,transform,filter] delay-[140ms] duration-[1300ms] ease-[cubic-bezier(0.16,1,0.3,1)] [text-shadow:0_0_32px_rgba(255,255,255,0.45),0_0_8px_rgba(255,255,255,0.2)]",
            visible("wordmark") &&
              "translate-y-0 scale-100 opacity-100 blur-none"
          )}
        >
          LARITY
        </div>

        {/* Tagline */}
        <div
          className={cx(
            "mb-9 translate-y-4 text-center font-medium text-[rgba(161,161,161,0.7)] text-xs leading-normal tracking-[0.06em] opacity-0 blur-[3px] transition-[opacity,transform,filter] delay-[180ms] duration-[1150ms] ease-[cubic-bezier(0.16,1,0.3,1)]",
            visible("tagline") && "translate-y-0 opacity-100 blur-none"
          )}
        >
          Work, with memory.
        </div>

        {/* Accent divider */}
        <div
          className={cx(
            "mb-9 h-px w-9 translate-y-3 scale-x-50 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.7),transparent)] opacity-0 transition-[opacity,transform] delay-[260ms] duration-[1200ms] ease-[cubic-bezier(0.16,1,0.3,1)]",
            visible("tagline") && "translate-y-0 scale-x-100 opacity-100"
          )}
        />

        {/* CTA */}
        <button
          className={cx(
            "relative h-auto cursor-pointer overflow-hidden rounded-[var(--radius-1)] border border-white/30 bg-[linear-gradient(180deg,rgba(255,255,255,0.16),rgba(255,255,255,0.045))] px-7 py-[11px] font-['Share_Tech_Mono','Courier_New',monospace] font-normal text-[11px] text-[rgba(248,248,248,0.96)] leading-none tracking-[0.22em] shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_0_26px_rgba(255,255,255,0.12),inset_0_1px_0_rgba(255,255,255,0.18)] backdrop-blur-sm transition-[opacity,transform,filter,border-color,color,box-shadow,background-color] delay-[220ms] duration-[1200ms] ease-[cubic-bezier(0.16,1,0.3,1)] before:absolute before:inset-0 before:bg-[linear-gradient(115deg,transparent_0%,rgba(255,255,255,0.24)_38%,transparent_62%)] before:opacity-0 before:transition-opacity before:duration-300 before:content-[''] after:absolute after:inset-[1px] after:rounded-[7px] after:bg-[radial-gradient(ellipse_at_50%_0%,rgba(255,255,255,0.16),transparent_58%)] after:content-[''] hover:border-white/60 hover:bg-[linear-gradient(180deg,rgba(255,255,255,0.22),rgba(255,255,255,0.07))] hover:text-white hover:shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_0_28px_rgba(255,255,255,0.22),inset_0_1px_0_rgba(255,255,255,0.28),inset_0_0_18px_rgba(255,255,255,0.08)] hover:before:opacity-100 active:scale-[0.96] active:shadow-[0_0_0_1px_rgba(255,255,255,0.04),inset_0_0_14px_rgba(0,0,0,0.35)]",
            "translate-y-5 scale-[0.96] opacity-0 blur-[5px]",
            visible("cta") && "translate-y-0 scale-100 opacity-100 blur-none"
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
