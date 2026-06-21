import { defineConfig } from "@prisma/config";

export default defineConfig({
  earlyAccess: true,
  datasource: {
    url: process.env.DATABASE_URL,
  },
  // biome-ignore lint/suspicious/noExplicitAny: prisma config type mismatch
} as any);
