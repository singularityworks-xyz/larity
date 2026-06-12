import { Link, useNavigate } from "react-router-dom";
import { useClients } from "../../features/clients/use-clients";
import { cx, panelClass } from "../../lib/ui";
import { InitialsAvatar } from "../avatar";

export function RecentClientsPanel() {
  const navigate = useNavigate();
  const { data: clients, isLoading } = useClients();

  if (isLoading) {
    return <div className={cx(panelClass, "h-24 animate-pulse")} />;
  }

  if (!clients || clients.length === 0) {
    return null;
  }

  const topClients = [...clients]
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )
    .slice(0, 5);

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

      <div className="flex flex-wrap gap-2">
        {topClients.map((client, i) => (
          <button
            className="fade-in slide-in-from-bottom-1 flex animate-in cursor-pointer items-center gap-2 rounded-[var(--radius-1)] border border-border bg-bg-elevated px-3 py-1.5 transition-colors duration-150 hover:border-border-strong hover:bg-bg-subtle"
            key={client.id}
            onClick={() => navigate(`/clients/${client.id}`)}
            style={{ animationDelay: `${i * 30}ms`, animationFillMode: "both" }}
            type="button"
          >
            <InitialsAvatar
              className="h-4 w-4 border-0 text-[9px]"
              name={client.name}
            />
            <span className="font-medium text-[12px] text-fg leading-none">
              {client.name}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
