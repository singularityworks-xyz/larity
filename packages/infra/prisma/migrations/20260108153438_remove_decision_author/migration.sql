/*
  Warnings:

  - You are about to drop the column `authorId` on the `decisions` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "decisions" DROP CONSTRAINT "decisions_authorId_fkey";

-- AlterTable
ALTER TABLE "decisions" DROP COLUMN "authorId";
