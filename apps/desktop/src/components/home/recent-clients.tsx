import { useCallback, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useClients } from "../../features/clients/use-clients";
import { cx, panelClass } from "../../lib/ui";
import { InitialsAvatar } from "../avatar";

const RECENT_CLIENTS_LIMIT = 5;

export function RecentClientsPanel() {
  const navigate = useNavigate();
  const { data: clients, isLoading } = useClients();
  const topClients = useMemo(
    () =>
      [...(clients ?? [])]
        .sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        )
        .slice(0, RECENT_CLIENTS_LIMIT),
    [clients]
  );
  const handleClientClick = useCallback(
    (id: string) => navigate(`/clients/${id}`),
    [navigate]
  );

  if (isLoading) {
    return <div className={cx(panelClass, "h-24 animate-pulse")} />;
  }

  if (!clients || clients.length === 0) {
    return null;
  }

  return (
    <div className={cx(panelClass, "flex flex-col gap-3")}>
      <div className="flex items-center justify-between">
        <h3 className="m-0 font-semibold text-[13px] text-fg">
          Recent Clients
        </h3>
        <Link
          className="text-[12px] text-fg-muted no-underline transition-colors hover:text-fg"
          to="/clients"
        >
          View all
        </Link>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {topClients.map((client) => (
          <button
            className="fade-in slide-in-from-bottom-1 flex animate-in cursor-pointer items-center gap-1.5 rounded-full border border-border bg-bg-elevated px-2 py-1 transition-colors duration-150 hover:border-border-strong hover:bg-bg-overlay"
            key={client.id}
            onClick={() => handleClientClick(client.id)}
            type="button"
          >
            <InitialsAvatar
              className="h-3 w-3 border-0 bg-accent-muted text-[8px] text-accent-fg"
              name={client.name}
            />
            <span className="font-medium text-[11px] text-fg leading-none">
              {client.name}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
