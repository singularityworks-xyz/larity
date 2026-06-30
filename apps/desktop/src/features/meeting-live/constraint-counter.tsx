import { useEffect, useRef, useState } from "react";
import { cx } from "../../lib/ui";

interface ConstraintCounterProps {
  className?: string;
  count: number;
}

export function ConstraintCounter({
  count,
  className,
}: ConstraintCounterProps) {
  const [isPulsing, setIsPulsing] = useState(false);
  const prevCountRef = useRef(count);

  useEffect(() => {
    if (count > prevCountRef.current) {
      setIsPulsing(true);
      const timeout = window.setTimeout(() => setIsPulsing(false), 600);
      prevCountRef.current = count;
      return () => window.clearTimeout(timeout);
    }
    prevCountRef.current = count;
  }, [count]);

  if (count === 0) {
    return null;
  }

  return (
    <output
      aria-label={`${count} tracked constraint${count === 1 ? "" : "s"}`}
      className={cx(
        "inline-flex h-[20px] shrink-0 items-center gap-1.5 rounded-[5px] border px-2 font-medium font-mono text-[10px] tabular-nums leading-none transition-shadow duration-300",
        "border-[rgba(210,153,34,0.2)] bg-[rgba(210,153,34,0.06)] text-warning-fg",
        isPulsing && "animate-[counter-pulse_0.6s_ease-out]",
        className
      )}
    >
      <svg
        aria-hidden="true"
        className="h-[10px] w-[10px] shrink-0 text-warning-fg/70"
        fill="none"
        height="10"
        stroke="currentColor"
        strokeWidth="1.5"
        viewBox="0 0 10 10"
        width="10"
      >
        <title>Constraint</title>
        <path d="M5 1L1 8.5h8L5 1z" strokeLinejoin="round" />
      </svg>
      {count}
    </output>
  );
}
