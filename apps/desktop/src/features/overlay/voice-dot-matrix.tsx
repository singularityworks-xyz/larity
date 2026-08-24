import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef } from "react";

// Deterministic animation delays for each dot position (row × 5 + col),
// matching the SVG sparkle's pseudo-random stagger pattern. Values in ms.
const DOT_DELAYS: number[] = [
  // row 0
  0, 2283, 1617, 1466, 31,
  // row 1
  2106, 296, 1206, 333, 2241,
  // row 2
  1929, 967, 1238, 1004, 2252,
  // row 3
  1955, 2517, 1139, 1076, 1362,
  // row 4
  2132, 920, 1274, 1310, 1019,
];

const CYCLE_MS = 1400;
const GRID_SIZE = 5;
const DOT_STEP = 5.5; // gap between dot centres
const DOT_START = 2.5; // first dot centre offset

interface Dot {
  cx: number;
  cy: number;
  delayRandom: number;
  delayRipple: number;
  id: string;
}

// Pre-built so React never sees array-index keys.
const DOTS: Dot[] = Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, i) => {
  const row = Math.floor(i / GRID_SIZE);
  const col = i % GRID_SIZE;
  // Center is row 2, col 2
  const distFromCenter = Math.sqrt((row - 2) ** 2 + (col - 2) ** 2);
  return {
    id: `r${row}c${col}`,
    cx: DOT_START + col * DOT_STEP,
    cy: DOT_START + row * DOT_STEP,
    delayRandom: DOT_DELAYS[i] ?? 0,
    delayRipple: Math.round(distFromCenter * 150),
  };
});

interface VoiceDotMatrixProps {
  /** Whether the user is currently speaking — drives the animation. */
  isSpeaking: boolean;
  /** Accessible label for the indicator. */
  label?: string;
}

/**
 * A 5×5 dot matrix that idles at near-invisible opacity and shifts to
 * a rippling hue effect while the user is speaking.
 */
export function VoiceDotMatrix({ isSpeaking, label }: VoiceDotMatrixProps) {
  const ariaLabel =
    label ?? (isSpeaking ? "You are speaking" : "Microphone silent");

  const svgRef = useRef<SVGSVGElement>(null);
  const activeLayerRef = useRef<SVGGElement>(null);
  const isSpeakingRef = useRef(isSpeaking);

  useEffect(() => {
    isSpeakingRef.current = isSpeaking;
    if (!isSpeaking) {
      if (svgRef.current) {
        svgRef.current.style.transform = "scale(1)";
      }
      if (activeLayerRef.current) {
        activeLayerRef.current.style.opacity = "0";
      }
    }
  }, [isSpeaking]);

  useEffect(() => {
    let isMounted = true;
    let unlisten: (() => void) | undefined;
    listen<number>("raw-mic-amplitude", (e) => {
      if (!isSpeakingRef.current) {
        return;
      }
      const amplitude = e.payload;
      if (svgRef.current) {
        svgRef.current.style.transform = `scale(${1 + Math.min(0.2, amplitude * 0.5)})`;
      }
      if (activeLayerRef.current) {
        activeLayerRef.current.style.opacity = String(
          Math.min(1, 0.3 + amplitude * 4)
        );
      }
    }).then((f) => {
      if (isMounted) {
        unlisten = f;
      } else {
        f();
      }
    });
    return () => {
      isMounted = false;
      unlisten?.();
    };
  }, []);

  return (
    <output
      aria-label={ariaLabel}
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: 28, height: 28 }}
    >
      <svg
        aria-hidden="true"
        ref={svgRef}
        style={{
          width: 28,
          height: 28,
          overflow: "visible",
          transform: "scale(1)",
          transition: "transform 75ms ease-out",
        }}
        viewBox="0 0 28 28"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Base layer: static dim dots that give the matrix its shape */}
        <g
          style={{
            color: "var(--fg-subtle)",
            opacity: isSpeaking ? 0.05 : 0.2,
            transition: "opacity 300ms ease-out",
          }}
        >
          {DOTS.map((dot) => (
            <circle
              cx={dot.cx}
              cy={dot.cy}
              fill="currentColor"
              key={`base-${dot.id}`}
              r={1.8}
            />
          ))}
        </g>

        {/* Active layer: continuously animating dots, revealed when speaking */}
        <g
          ref={activeLayerRef}
          style={{
            color: "var(--accent)",
            opacity: isSpeaking ? 0.3 : 0,
            transition: "opacity 75ms ease-out, color 300ms ease-out",
          }}
        >
          {DOTS.map((dot) => (
            <circle
              cx={dot.cx}
              cy={dot.cy}
              fill="currentColor"
              key={`twinkle-${dot.id}`}
              r={1.8}
              style={{
                // Switches from random twinkle (idle but hidden) to centre ripple (active)
                animation: isSpeaking
                  ? `dot-twinkle ${CYCLE_MS}ms cubic-bezier(0.65, 0, 0.35, 1) ${dot.delayRipple}ms infinite both`
                  : `dot-twinkle ${CYCLE_MS}ms cubic-bezier(0.65, 0, 0.35, 1) -${dot.delayRandom}ms infinite both`,
              }}
            />
          ))}
        </g>
      </svg>
    </output>
  );
}
