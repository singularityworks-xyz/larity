const DOT_DELAYS: number[] = [
  0, 2283, 1617, 1466, 31, 2106, 296, 1206, 333, 2241, 1929, 967, 1238, 1004,
  2252, 1955, 2517, 1139, 1076, 1362, 2132, 920, 1274, 1310, 1019,
];

const CYCLE_MS = 1400;
const GRID_SIZE = 5;
const DOT_STEP = 5.5;
const DOT_START = 2.5;

interface Dot {
  cx: number;
  cy: number;
  delayRandom: number;
  delayRipple: number;
  id: string;
}

const DOTS: Dot[] = DOT_DELAYS.map((delayRandom, index) => {
  const row = Math.floor(index / GRID_SIZE);
  const col = index % GRID_SIZE;
  const distFromCenter = Math.sqrt((row - 2) ** 2 + (col - 2) ** 2);
  return {
    id: `r${row}c${col}`,
    cx: DOT_START + col * DOT_STEP,
    cy: DOT_START + row * DOT_STEP,
    delayRandom,
    delayRipple: Math.round(distFromCenter * 150),
  };
});

interface VoiceDotMatrixProps {
  amplitude?: number;
  isSpeaking: boolean;
  label?: string;
}

export function VoiceDotMatrix({
  isSpeaking,
  amplitude = 0,
  label,
}: VoiceDotMatrixProps) {
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
        style={{
          width: 28,
          height: 28,
          overflow: "visible",
          transform: isSpeaking
            ? `scale(${1 + Math.min(0.2, amplitude * 0.5)})`
            : "scale(1)",
          transition: "transform 75ms ease-out",
        }}
        viewBox="0 0 28 28"
        xmlns="http://www.w3.org/2000/svg"
      >
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

        <g
          style={{
            color: "var(--accent)",
            opacity: isSpeaking ? Math.min(1, 0.3 + amplitude * 4) : 0,
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
