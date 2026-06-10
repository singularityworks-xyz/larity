import { Elysia } from "elysia";
import { requireAuth } from "../middleware/auth";
import { HomeService } from "../services/home.service";

export const homeRoutes = new Elysia({ prefix: "/home" })
  .use(requireAuth)
  .get("/", async ({ user, set }) => {
    if (!(user?.id && user?.orgId)) {
      set.status = 400;
      return {
        success: false,
        error: "Missing user or org context",
      };
    }

    const data = await HomeService.getHome(user.id, user.orgId);
    return { success: true, data };
  });
