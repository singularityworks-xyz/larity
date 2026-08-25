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

export type DotmSquare17Props = DotMatrixCommonProps;

const BASE_OPACITY = 0.12;
const STRAND_OPACITY = 1;
const NEAR_STRAND_OPACITY = 0.35;
const STEP_COUNT = 20;
const HELIX_LOOP_RADIANS = (Math.PI * 2) / (STEP_COUNT - 1);

export function DotmSquare17({
  speed = 2.5,
  animated = true,
  hoverAnimated = false,
  ...rest
}: DotmSquare17Props) {
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
      ({ row, col, phase }) => {
        const t =
          reducedMotion || phase === "idle" ? 0 : animPhase * STEP_COUNT;
        const rowPhase = t * HELIX_LOOP_RADIANS + row * 1.24;
        const strandCol = Math.round(2 + 2 * Math.sin(rowPhase));

        if (col === strandCol) {
          return { style: { opacity: STRAND_OPACITY } };
        }

        if (Math.abs(col - strandCol) === 1) {
          return { style: { opacity: NEAR_STRAND_OPACITY } };
        }

        return { style: { opacity: BASE_OPACITY } };
      },
    [reducedMotion, animPhase]
  );

  return (
    <DotMatrixBase
      {...rest}
      animated={animated}
      animationResolver={resolver}
      dotSize={rest.dotSize ?? 5}
      phase={matrixPhase}
      reducedMotion={reducedMotion}
      size={rest.size ?? 40}
      speed={speed}
    />
  );
}
