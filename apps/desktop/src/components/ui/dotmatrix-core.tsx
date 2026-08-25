import type { CSSProperties } from "react";
import "../dotmatrix-loader.css";

export type MatrixPattern = "diamond" | "full" | "outline" | "cross";
export type DotShape = "circle" | "square";
export type DotMatrixPhase =
  | "idle"
  | "collapse"
  | "hoverRipple"
  | "loadingRipple";

export interface DotMatrixCommonProps {
  animated?: boolean;
  ariaLabel?: string;
  bloom?: boolean;
  className?: string;
  color?: string;
  dotClassName?: string;
  dotShape?: DotShape;
  dotSize?: number;
  halo?: number;
  hoverAnimated?: boolean;
  muted?: boolean;
  opacityBase?: number;
  opacityMid?: number;
  opacityPeak?: number;
  pattern?: MatrixPattern;
  size?: number;
  speed?: number;
}

export interface DotAnimationContext {
  angleFromCenter: number;
  col: number;
  distanceFromCenter: number;
  index: number;
  isActive: boolean;
  manhattanDistance: number;
  phase: DotMatrixPhase;
  radiusNormalized: number;
  reducedMotion: boolean;
  row: number;
}

export interface DotAnimationState {
  className?: string;
  style?: CSSProperties;
}

export type DotAnimationResolver = (
  ctx: DotAnimationContext
) => DotAnimationState;

export const MATRIX_SIZE = 5;
const CENTER = Math.floor(MATRIX_SIZE / 2);
const MAX_RADIUS = Math.hypot(CENTER, CENTER);

export function rowMajorIndex(row: number, col: number): number {
  return row * MATRIX_SIZE + col;
}

export function indexToCoord(index: number): { row: number; col: number } {
  return {
    row: Math.floor(index / MATRIX_SIZE),
    col: index % MATRIX_SIZE,
  };
}

export function distanceFromCenter(index: number): number {
  const { row, col } = indexToCoord(index);
  return Math.hypot(row - CENTER, col - CENTER);
}

export function polarAngle(index: number): number {
  const { row, col } = indexToCoord(index);
  return Math.atan2(row - CENTER, col - CENTER);
}

export function normalizedRadius(index: number): number {
  const { row, col } = indexToCoord(index);
  return Math.hypot(row - CENTER, col - CENTER) / MAX_RADIUS;
}

export function manhattanDistance(index: number): number {
  const { row, col } = indexToCoord(index);
  return Math.abs(row - CENTER) + Math.abs(col - CENTER);
}

export interface DotMatrixBaseProps extends DotMatrixCommonProps {
  animationResolver?: DotAnimationResolver;
  phase: DotMatrixPhase;
  reducedMotion?: boolean;
}

export function DotMatrixBase({
  size = 36,
  dotSize = 5,
  color = "#818cf8",
  speed = 1,
  ariaLabel = "Loading",
  className,
  dotShape = "circle",
  muted = false,
  bloom = true,
  halo = 0.5,
  dotClassName,
  phase,
  reducedMotion = false,
  animationResolver,
  opacityBase,
  opacityMid,
  opacityPeak,
}: DotMatrixBaseProps) {
  const safeSpeed = speed > 0 ? speed : 1;
  const speedScale = 1 / safeSpeed;
  const gap = Math.max(
    1,
    Math.floor((size - dotSize * MATRIX_SIZE) / (MATRIX_SIZE - 1))
  );
  const unit = dotSize + gap;
  const center = Math.floor(MATRIX_SIZE / 2);

  const dmxVarStyle: CSSProperties = {
    width: size,
    height: size,
    ["--dmx-speed" as string]: speedScale,
    ["--dmx-dot-size" as string]: `${dotSize}px`,
    ["--dmx-halo-level" as string]: halo,
    ["--dmx-dot-fill" as string]: color,
    color,
    ...(opacityBase !== undefined && {
      ["--dmx-opacity-base" as string]: opacityBase,
    }),
    ...(opacityMid !== undefined && {
      ["--dmx-opacity-mid" as string]: opacityMid,
    }),
    ...(opacityPeak !== undefined && {
      ["--dmx-opacity-peak" as string]: opacityPeak,
    }),
  };

  const dots = Array.from({ length: MATRIX_SIZE * MATRIX_SIZE }).map(
    (_, index) => {
      const { row, col } = indexToCoord(index);
      const distance = distanceFromCenter(index);
      const angle = polarAngle(index);
      const radiusNormalizedValue = normalizedRadius(index);
      const manhattan = manhattanDistance(index);
      const deltaX = (col - center) * unit;
      const deltaY = (row - center) * unit;

      const animationState = animationResolver
        ? animationResolver({
            index,
            row,
            col,
            distanceFromCenter: distance,
            angleFromCenter: angle,
            radiusNormalized: radiusNormalizedValue,
            manhattanDistance: manhattan,
            phase,
            isActive: true,
            reducedMotion,
          })
        : {};

      const dotStyle: CSSProperties = {
        width: dotSize,
        height: dotSize,
        ["--dmx-distance" as string]: distance,
        ["--dmx-row" as string]: row,
        ["--dmx-col" as string]: col,
        ["--dmx-x" as string]: `${deltaX}px`,
        ["--dmx-y" as string]: `${deltaY}px`,
        ["--dmx-angle" as string]: angle,
        ["--dmx-radius" as string]: radiusNormalizedValue,
        ["--dmx-manhattan" as string]: manhattan,
        ...animationState.style,
      };

      return (
        <span
          aria-hidden="true"
          className={[
            "dmx-dot",
            bloom && "dmx-bloom-dot",
            dotClassName,
            animationState.className,
          ]
            .filter(Boolean)
            .join(" ")}
          key={`matrix-dot-${row}-${col}`}
          style={dotStyle}
        />
      );
    }
  );

  return (
    <div
      aria-label={ariaLabel}
      className={[
        "dmx-root",
        `dmx-dot-shape-${dotShape}`,
        muted && "dmx-muted",
        bloom && "dmx-bloom",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      role="status"
      style={dmxVarStyle}
    >
      <div className="dmx-grid" style={{ gap }}>
        {dots}
      </div>
    </div>
  );
}
