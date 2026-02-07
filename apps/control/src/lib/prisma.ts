import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../../../packages/infra/prisma/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set");
}

const adapter = new PrismaPg({ connectionString });

export const prisma = new PrismaClient({ adapter });
