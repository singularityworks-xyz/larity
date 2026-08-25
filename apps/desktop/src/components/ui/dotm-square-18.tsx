import { useMemo } from "react";
import {
  type DotAnimationResolver,
  DotMatrixBase,
  type DotMatrixCommonProps,
} from "./dotmatrix-core";
import {
  useCyclePhase,
  useDotMatrixPhases,
  usePrefersReducedMotion,
} from "./dotmatrix-hooks";

export type DotmSquare18Props = DotMatrixCommonProps;

const BASE_OPACITY = 0.1;
const CAP_OPACITY = 1.0;

export function DotmSquare18({
  speed = 1.4,
  pattern = "full",
  animated = true,
  hoverAnimated = false,
  ...rest
}: DotmSquare18Props) {
  const reducedMotion = usePrefersReducedMotion();
  const { phase: matrixPhase } = useDotMatrixPhases({
    animated: Boolean(animated && !reducedMotion),
    hoverAnimated: Boolean(hoverAnimated && !reducedMotion),
    speed,
  });
  const animPhase = useCyclePhase({
    active: !reducedMotion && matrixPhase !== "idle",
    cycleMsBase: 1600,
    speed,
  });

  const resolver = useMemo<DotAnimationResolver>(
    () =>
      ({ isActive, row, col, phase }) => {
        if (!isActive) {
          return { className: "dmx-inactive" };
        }

        if (reducedMotion || phase === "idle") {
          return { style: { opacity: (4 - row) * 0.2 + 0.2 } };
        }

        // Upward wave: row 4 (bottom) -> row 0 (top)
        const t = animPhase * Math.PI * 2;
        const rowOffset = (4 - row) * 0.85;
        const colHarmonic = Math.abs(col - 2) * 0.15;
        const phaseValue = t - rowOffset + colHarmonic;

        // Sine envelope with sharp power curve for crisp DotMatrix bloom
        const rawSine = Math.sin(phaseValue);
        const wave = ((rawSine + 1) / 2) ** 2.2;
        const opacity = BASE_OPACITY + wave * (CAP_OPACITY - BASE_OPACITY);

        return {
          style: {
            opacity,
          },
        };
      },
    [reducedMotion, animPhase]
  );

  return (
    <DotMatrixBase
      {...rest}
      animated={animated}
      animationResolver={resolver}
      bloom={rest.bloom ?? true}
      dotSize={rest.dotSize ?? 3.5}
      halo={rest.halo ?? 0.2}
      pattern={pattern}
      phase={matrixPhase}
      reducedMotion={reducedMotion}
      size={rest.size ?? 22}
      speed={speed}
    />
  );
}
