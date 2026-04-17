import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import "./App.css";

interface AudioStatus {
  active: boolean;
  backend: string;
  error?: string | null;
}

interface AudioFrameEvent {
  payload: {
    ts: number;
    sessionId: string;
    data: string;
  };
}

function App() {
  const [status, setStatus] = useState<AudioStatus | null>(null);
  const [framesReceived, setFramesReceived] = useState(0);
  const [lastTs, setLastTs] = useState<number>(0);

  useEffect(() => {
    invoke<AudioStatus>("audio_capture_status")
      .then(setStatus)
      .catch(console.error);

    const unlisten = listen("audio-frame", (event: AudioFrameEvent) => {
      setFramesReceived((prev) => prev + 1);
      setLastTs(event.payload.ts);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  async function startCapture() {
    try {
      await invoke("audio_capture_start", { sessionId: "test-session-123" });
      setStatus(await invoke<AudioStatus>("audio_capture_status"));
    } catch (e) {
      console.error("Failed to start:", e);
    }
  }

  async function stopCapture() {
    try {
      await invoke("audio_capture_stop");
      setStatus(await invoke<AudioStatus>("audio_capture_status"));
    } catch (e) {
      console.error("Failed to stop:", e);
    }
  }

  return (
    <main className="container">
      <h1>Welcome to Tauri + React</h1>

      <div
        style={{
          marginTop: "2rem",
          padding: "1rem",
          border: "1px solid #333",
          borderRadius: "8px",
        }}
      >
        <h2>Audio Capture Test</h2>

        <div style={{ marginBottom: "1rem" }}>
          <strong>Status: </strong>
          <pre>{JSON.stringify(status, null, 2)}</pre>
        </div>

        <div style={{ marginBottom: "1rem" }}>
          <strong>Frames Received: </strong> {framesReceived}
          <br />
          <strong>Last Timestamp: </strong> {lastTs || "None"}
        </div>

        <div style={{ display: "flex", gap: "1rem", justifyContent: "center" }}>
          <button
            type="button"
            onClick={startCapture}
            disabled={status?.active}
          >
            Start Capture
          </button>
          <button
            type="button"
            onClick={stopCapture}
            disabled={!status?.active}
          >
            Stop Capture
          </button>
        </div>
      </div>
    </main>
  );
}

export default App;
