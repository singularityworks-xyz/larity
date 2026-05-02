// biome-ignore lint/performance/noBarrelFile: re-export prisma singleton with env validation
export { prisma } from "@larity/infra/prisma/client";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is not set");
}
