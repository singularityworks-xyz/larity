import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useClients } from "../../features/meetings/use-clients";
import { useStartMeeting } from "../../features/meetings/use-start-meeting";
import { AppShell } from "../shared";

export function StartMeetingPage() {
  const navigate = useNavigate();
  const clientsQuery = useClients();
  const startMeetingMutation = useStartMeeting();

  const [clientId, setClientId] = useState("");
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  const isSubmitDisabled = useMemo(() => {
    return clientId.trim().length === 0 || startMeetingMutation.isPending;
  }, [clientId, startMeetingMutation.isPending]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!clientId) {
      setError("Select a client first");
      return;
    }

    setError(null);

    try {
      const session = await startMeetingMutation.mutateAsync({
        clientId,
        title: title.trim() || undefined,
      });

      navigate(`/meeting/${session.sessionId}`, {
        state: {
          role: "host",
          websocketUrl: session.websocketUrl,
        },
      });
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "Could not start meeting";
      setError(message);
    }
  }

  return (
    <AppShell title="Start ad-hoc meeting">
      <section className="panel form-panel">
        {clientsQuery.isPending ? <p>Loading clients...</p> : null}
        {clientsQuery.error ? (
          <p className="form-error">{clientsQuery.error.message}</p>
        ) : null}

        <form className="auth-form" onSubmit={onSubmit}>
          <label htmlFor="meeting-client">Client</label>
          <select
            className="select-input"
            id="meeting-client"
            onChange={(event) => setClientId(event.target.value)}
            value={clientId}
          >
            <option value="">Select a client</option>
            {(clientsQuery.data ?? []).map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>

          <label htmlFor="meeting-title">Meeting title (optional)</label>
          <input
            id="meeting-title"
            onChange={(event) => setTitle(event.target.value)}
            type="text"
            value={title}
          />

          {error ? <p className="form-error">{error}</p> : null}

          <button disabled={isSubmitDisabled} type="submit">
            {startMeetingMutation.isPending
              ? "Starting..."
              : "Start and enter room"}
          </button>
        </form>
      </section>
    </AppShell>
  );
}
