import { memo } from "react";
import type { useHealth } from "../../features/home/use-health";
import { cx, healthStripClass } from "../../lib/ui";

const timeFormatter = new Intl.DateTimeFormat([], {
  hour: "numeric",
  minute: "2-digit",
});

type HealthState = ReturnType<typeof useHealth>;

interface HealthStripProps {
  health: HealthState;
}

const StatusDot = memo(function StatusDot({
  label,
  state,
}: {
  label: string;
  state: "online" | "offline" | "warning";
}) {
  const colors = {
    online: "bg-success-fg shadow-[0_0_4px_rgba(63,185,80,0.35)]",
    offline: "bg-danger-fg shadow-[0_0_4px_rgba(248,81,73,0.35)]",
    warning: "bg-warning-fg shadow-[0_0_4px_rgba(210,153,34,0.35)]",
  };

  const textColors = {
    online: "text-success-fg",
    offline: "text-danger-fg",
    warning: "text-warning-fg",
  };

  return (
    <div className="flex items-center gap-1.5">
      <span
        className={cx(
          "inline-block h-1.5 w-1.5 shrink-0 rounded-full transition-colors duration-300 ease-out",
          colors[state]
        )}
      />
      <span
        className={cx(
          "font-medium text-[10.5px] tabular-nums leading-none transition-colors duration-300 ease-out",
          textColors[state]
        )}
      >
        {label}
      </span>
    </div>
  );
});

export function HealthStrip({ health }: HealthStripProps) {
  const serverState = health.serverOnline ? "online" : "offline";
  const audioState = health.audioDeviceAvailable ? "online" : "warning";

  return (
    <footer className={healthStripClass}>
      <StatusDot
        label="Server connected"
        state={serverState as "online" | "offline"}
      />
      <span className="font-medium text-[10px] text-fg-subtle leading-none">
        &middot;
      </span>
      <StatusDot
        label={health.audioDeviceAvailable ? "Audio ready" : "No audio device"}
        state={audioState as "online" | "warning"}
      />
      <span className="font-medium text-[10px] text-fg-subtle leading-none">
        &middot;
      </span>
      <span className="font-medium text-[10.5px] text-fg-subtle tabular-nums leading-none">
        {health.lastSync
          ? `Synced ${timeFormatter.format(health.lastSync)}`
          : "Not synced"}
      </span>
    </footer>
  );
}
