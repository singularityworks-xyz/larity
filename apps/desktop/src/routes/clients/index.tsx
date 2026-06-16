import { ArrowLeft } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { InitialsAvatar } from "../../components/avatar";
import { useClients } from "../../features/clients/use-clients";
import { buttonClass, cx, inputClass } from "../../lib/ui";

export function ClientsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [sortOption, setSortOption] = useState("updatedDesc");
  const { data: clients, isLoading } = useClients();

  // O(N log N) optimal sorting & filtering with memoization to minimize CPU load
  const processedClients = useMemo(() => {
    if (!clients) {
      return [];
    }

    // 1. Filter
    let result = clients;
    if (filterStatus !== "ALL") {
      result = result.filter((c) => c.status === filterStatus);
    }

    if (search) {
      const searchLower = search.toLowerCase();
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(searchLower) ||
          c.industry?.toLowerCase().includes(searchLower)
      );
    }

    // 2. Sort
    return result.slice().sort((a, b) => {
      switch (sortOption) {
        case "nameAsc":
          return a.name.localeCompare(b.name);
        case "nameDesc":
          return b.name.localeCompare(a.name);
        case "updatedAsc":
          return (
            new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()
          );
        default:
          return (
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
          );
      }
    });
  }, [clients, search, filterStatus, sortOption]);

  return (
    <div className="fade-in flex animate-in flex-col gap-6 duration-300">
      <header className="flex flex-col gap-4">
        <nav className="flex items-center font-medium text-[13px] text-fg-muted">
          <Link
            className="no-underline transition-colors hover:text-fg"
            to="/home"
          >
            Home
          </Link>
          <span className="mx-2 text-border-subtle">/</span>
          <span className="text-fg">Clients</span>
        </nav>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              aria-label="Go back"
              className="group flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-border bg-bg-elevated text-fg-subtle transition-all [-webkit-app-region:no-drag] [app-region:no-drag] hover:bg-bg-subtle hover:text-fg active:scale-95"
              onClick={() => navigate(-1)}
              type="button"
            >
              <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
            </button>
            <h1 className="m-0 font-semibold text-fg text-xl tracking-tight">
              Clients
            </h1>
          </div>
          <button
            className={buttonClass({ variant: "primary", size: "sm" })}
            onClick={() => navigate("/clients/add")}
            type="button"
          >
            New Client
          </button>
        </div>
      </header>

      <div className="flex items-center gap-2">
        <div className="relative w-full max-w-[320px]">
          <svg
            aria-labelledby="searchIconTitle"
            className="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-fg-muted"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <title id="searchIconTitle">Search icon</title>
            <path
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
            />
          </svg>
          <input
            className={cx(inputClass, "h-8 bg-transparent pl-8 text-[13px]")}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search clients..."
            type="text"
            value={search}
          />
        </div>
        <select
          aria-label="Filter clients by status"
          className={cx(
            buttonClass({ variant: "secondary" }),
            "w-auto cursor-pointer pr-6 font-normal"
          )}
          onChange={(e) => setFilterStatus(e.target.value)}
          value={filterStatus}
        >
          <option value="ALL">All Status</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
          <option value="ARCHIVED">Archived</option>
        </select>
        <select
          aria-label="Sort clients"
          className={cx(
            buttonClass({ variant: "secondary" }),
            "w-auto cursor-pointer pr-6 font-normal"
          )}
          onChange={(e) => setSortOption(e.target.value)}
          value={sortOption}
        >
          <option value="updatedDesc">Recently Updated</option>
          <option value="updatedAsc">Oldest Updated</option>
          <option value="nameAsc">Name (A-Z)</option>
          <option value="nameDesc">Name (Z-A)</option>
        </select>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-[13px] text-fg-muted">
          Loading...
        </div>
      ) : (
        <div className="flex flex-col overflow-hidden rounded-[var(--radius-1)] border border-border bg-bg-elevated">
          {processedClients.map((client, i) => (
            <button
              className="group fade-in slide-in-from-bottom-1 flex w-full animate-in cursor-pointer items-center justify-between border-border border-b bg-transparent p-3.5 text-left outline-none transition-colors duration-150 last:border-b-0 hover:bg-bg-subtle focus-visible:bg-bg-subtle"
              key={client.id}
              onClick={() => navigate(`/clients/${client.id}`)}
              style={{
                animationDelay: `${i * 30}ms`,
                animationFillMode: "both",
              }}
              type="button"
            >
              <div className="flex items-center gap-3">
                <InitialsAvatar
                  className="h-8 w-8 text-[11px]"
                  name={client.name}
                />
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-[13px] text-fg leading-none">
                      {client.name}
                    </span>
                    {client.status === "ACTIVE" ? (
                      <span
                        aria-label="Active status"
                        className="flex h-1.5 w-1.5 rounded-full bg-success-fg"
                        role="img"
                        title="Active"
                      />
                    ) : (
                      <span
                        aria-label="Inactive status"
                        className="flex h-1.5 w-1.5 rounded-full bg-fg-muted"
                        role="img"
                        title="Inactive"
                      />
                    )}
                  </div>
                  <span className="text-[12px] text-fg-muted leading-none">
                    {client?.industry ?? "No industry"}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-4 text-[12px] text-fg-muted">
                <span className="font-mono text-[11px] opacity-0 transition-opacity group-hover:opacity-100">
                  {client.id.split("-")[0]}
                </span>
                <span>
                  Updated {new Date(client.updatedAt).toLocaleDateString()}
                </span>
              </div>
            </button>
          ))}
          {processedClients.length === 0 && (
            <div className="p-8 text-center text-[13px] text-fg-muted">
              No clients found.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
