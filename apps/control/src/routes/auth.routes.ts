import { Elysia } from "elysia";
import { auth } from "../lib/auth";

export const authRoutes = new Elysia({ prefix: "/auth" }).all(
  "/*",
  ({ request }) => auth.handler(request)
);
