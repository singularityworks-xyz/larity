import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

let prismaSingleton: PrismaClient | null = null;

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    if (!prismaSingleton) {
      const connectionString = process.env.DATABASE_URL;
      if (!connectionString) {
        throw new Error("DATABASE_URL environment variable is not set");
      }
      const adapter = new PrismaPg({ connectionString });
      prismaSingleton = new PrismaClient({ adapter });
    }
    return Reflect.get(prismaSingleton, prop);
  },
});
