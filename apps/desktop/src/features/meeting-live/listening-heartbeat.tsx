import { cx } from "../../lib/ui";

interface ListeningHeartbeatProps {
  isActive: boolean;
  label?: string;
}

export function ListeningHeartbeat({
  isActive,
  label = "Audio processing active",
}: ListeningHeartbeatProps) {
  return (
    <output
      aria-label={isActive ? label : "Audio stream disconnected"}
      className="relative inline-flex h-[9px] w-[9px] shrink-0 items-center justify-center"
    >
      {isActive ? (
        <>
          <span className="absolute inline-block h-full w-full animate-[overlay-heartbeat_2s_ease-in-out_infinite] rounded-full bg-success-fg/40" />
          <span className="relative inline-block h-[9px] w-[9px] rounded-full bg-success-fg" />
        </>
      ) : (
        <span className="inline-block h-[7px] w-[7px] rounded-full bg-fg-subtle/50" />
      )}
      <span className="sr-only">{isActive ? label : "Disconnected"}</span>
    </output>
  );
}

interface HeartbeatDotInlineProps {
  isActive: boolean;
  size?: number;
  className?: string;
}

export function HeartbeatDotInline({
  isActive,
  size = 6,
  className,
}: HeartbeatDotInlineProps) {
  if (!isActive) {
    return (
      <span
        aria-hidden
        className={cx(
          "inline-block shrink-0 rounded-full bg-fg-subtle/40",
          className
        )}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={cx(
        "relative inline-flex shrink-0 items-center justify-center",
        className
      )}
      style={{ width: size + 3, height: size + 3 }}
    >
      <span className="absolute inline-block h-full w-full animate-[overlay-heartbeat_2s_ease-in-out_infinite] rounded-full bg-success-fg/30" />
      <span
        className="relative inline-block rounded-full bg-success-fg"
        style={{ width: size, height: size }}
      />
    </span>
  );
}
