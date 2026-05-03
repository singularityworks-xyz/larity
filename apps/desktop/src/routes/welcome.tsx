import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import larityLogo from "../assets/larity-logo-dark.svg";
import { applyWindowProfile, WINDOW_PROFILES } from "../lib/window";
import "../styles/welcome.css";

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

/** Joins class names, filtering out falsy values. */
function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

export function WelcomePage() {
  const [stage, setStage] = useState<Stage>("idle");
  const navigate = useNavigate();
  const bgRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);

  // Set window to small portrait intro size
  useEffect(() => {
    applyWindowProfile(WINDOW_PROFILES.intro).catch(() => {
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
    <div className="splash-root">
      {/* Animated gradient layer */}
      <div className="splash-bg" ref={bgRef} />

      <main aria-label="Larity introduction" className="splash-card">
        {/* Logo */}
        <div
          className={cx(
            "splash-item",
            "splash-logo",
            visible("logo") && "splash-item--in"
          )}
        >
          <img
            alt="Larity logo"
            className="splash-logo-img"
            height={40}
            src={larityLogo}
            width={40}
          />
        </div>

        {/* Wordmark */}
        <div
          className={cx(
            "splash-item",
            "splash-wordmark",
            visible("wordmark") && "splash-item--in"
          )}
        >
          LARITY
        </div>

        {/* Tagline */}
        <div
          className={cx(
            "splash-item",
            "splash-tagline",
            visible("tagline") && "splash-item--in"
          )}
        >
          Work, with memory.
        </div>

        {/* Accent divider */}
        <div
          className={cx(
            "splash-item",
            "splash-divider",
            visible("tagline") && "splash-item--in"
          )}
        />

        {/* CTA */}
        <button
          className={cx(
            "splash-item",
            "splash-cta",
            visible("cta") && "splash-item--in"
          )}
          onClick={() => {
            navigate("/login");
          }}
          type="button"
        >
          BEGIN &gt;
        </button>
      </main>
    </div>
  );
}
