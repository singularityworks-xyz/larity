/*
  Warnings:

  - The values [LEAD,MEMBER,OBSERVER] on the enum `ClientMemberRole` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `assignedAt` on the `client_members` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `client_members` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[clientId,email]` on the table `client_members` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `name` to the `client_members` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `client_members` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "ClientMemberRole_new" AS ENUM ('PRIMARY_CONTACT', 'CONTACT', 'STAKEHOLDER', 'DECISION_MAKER');
ALTER TABLE "public"."client_members" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "client_members" ALTER COLUMN "role" TYPE "ClientMemberRole_new" USING ("role"::text::"ClientMemberRole_new");
ALTER TYPE "ClientMemberRole" RENAME TO "ClientMemberRole_old";
ALTER TYPE "ClientMemberRole_new" RENAME TO "ClientMemberRole";
DROP TYPE "public"."ClientMemberRole_old";
ALTER TABLE "client_members" ALTER COLUMN "role" SET DEFAULT 'CONTACT';
COMMIT;

-- DropForeignKey
ALTER TABLE "client_members" DROP CONSTRAINT "client_members_userId_fkey";

-- DropIndex
DROP INDEX "client_members_clientId_userId_key";

-- DropIndex
DROP INDEX "client_members_userId_idx";

-- AlterTable
ALTER TABLE "client_members" DROP COLUMN "assignedAt",
DROP COLUMN "userId",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "department" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "name" TEXT NOT NULL,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "title" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "role" SET DEFAULT 'CONTACT';

-- CreateIndex
CREATE INDEX "client_members_email_idx" ON "client_members"("email");

-- CreateIndex
CREATE UNIQUE INDEX "client_members_clientId_email_key" ON "client_members"("clientId", "email");
