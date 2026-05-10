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
  id: string;
  cx: number;
  cy: number;
  delay: number;
}

// Pre-built so React never sees array-index keys.
const DOTS: Dot[] = Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, i) => {
  const row = Math.floor(i / GRID_SIZE);
  const col = i % GRID_SIZE;
  return {
    id: `r${row}c${col}`,
    cx: DOT_START + col * DOT_STEP,
    cy: DOT_START + row * DOT_STEP,
    delay: DOT_DELAYS[i],
  };
});

interface VoiceDotMatrixProps {
  /** Whether the user is currently speaking — drives the twinkle animation. */
  isSpeaking: boolean;
  /** Accessible label for the indicator. */
  label?: string;
}

/**
 * A 5×5 dot matrix that idles at near-invisible opacity and independently
 * twinkles each dot on a staggered loop while the user is speaking.
 */
export function VoiceDotMatrix({ isSpeaking, label }: VoiceDotMatrixProps) {
  const ariaLabel =
    label ?? (isSpeaking ? "You are speaking" : "Microphone silent");

  return (
    <output
      aria-label={ariaLabel}
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: 28, height: 28 }}
    >
      <svg
        aria-hidden="true"
        style={{ width: 28, height: 28, overflow: "visible" }}
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
              r={1.6}
            />
          ))}
        </g>

        {/* Active layer: continuously animating dots, revealed when speaking */}
        <g
          style={{
            color: "var(--success-fg)",
            opacity: isSpeaking ? 1 : 0,
            transition: "opacity 200ms ease-out",
          }}
        >
          {DOTS.map((dot) => (
            <circle
              cx={dot.cx}
              cy={dot.cy}
              fill="currentColor"
              key={`twinkle-${dot.id}`}
              r={1.6}
              style={{
                // Animation runs continuously in background to maintain chaotic phase
                animation: `dot-twinkle ${CYCLE_MS}ms cubic-bezier(0.65, 0, 0.35, 1) -${dot.delay}ms infinite both`,
              }}
            />
          ))}
        </g>
      </svg>
    </output>
  );
}
