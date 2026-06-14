import { Elysia } from "elysia";
import { systemEvents } from "../lib/events";
import { requireAuth } from "../middleware/auth";

export const notificationsRoutes = new Elysia({ prefix: "/notifications" })
  .use(requireAuth)
  .ws("/", {
    open(ws) {
      if (!ws.data.user?.id) {
        ws.close();
        return;
      }

      const userId = ws.data.user.id;

      const listener = (data: unknown) => {
        ws.send(data);
      };

      systemEvents.on(`user_notification:${userId}`, listener);

      // Store listener to clean up later
      ws.data = Object.assign(ws.data, { _notificationListener: listener });
    },
    close(ws) {
      if (!ws.data.user?.id) {
        return;
      }
      const userId = ws.data.user.id;
      const data = ws.data as unknown as {
        _notificationListener?: (data: unknown) => void;
      };
      const listener = data._notificationListener;
      if (listener) {
        systemEvents.off(`user_notification:${userId}`, listener);
      }
    },
  });
