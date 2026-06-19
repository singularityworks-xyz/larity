import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

export function useNotifications(userId?: string, token?: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!(userId && token)) {
      return;
    }
    const controlUrl =
      import.meta.env.VITE_CONTROL_URL ?? "http://localhost:3000";
    const wsControlUrl = controlUrl.replace("http", "ws");

    const ws = new WebSocket(
      `${wsControlUrl}/api/notifications?token=${token}`
    );

    ws.onopen = () => {
      console.log("Connected to user notifications");
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "PRE_MEETING_BRIEF_READY") {
          queryClient.invalidateQueries({
            queryKey: ["meetings", data.meetingId, "brief"],
          });

          if (
            "Notification" in window &&
            Notification.permission === "granted"
          ) {
            new Notification("Meeting Brief Ready", {
              body: data.message || "Your AI pre-meeting brief is ready.",
            });
          }
        }
      } catch (err) {
        console.error("Failed to parse notification", err);
      }
    };

    return () => {
      ws.close();
    };
  }, [queryClient, userId, token]);
}
