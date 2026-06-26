/*
  Warnings:

  - You are about to drop the column `orgId` on the `decisions` table. All the data in the column will be lost.
  - You are about to drop the column `orgId` on the `meetings` table. All the data in the column will be lost.
  - You are about to drop the column `orgId` on the `tasks` table. All the data in the column will be lost.
  - You are about to drop the `account` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `session` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `user` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `verification` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[slug]` on the table `orgs` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `clientId` to the `decisions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `clientId` to the `meetings` table without a default value. This is not possible if the table is not empty.
  - Added the required column `slug` to the `orgs` table without a default value. This is not possible if the table is not empty.
  - Added the required column `clientId` to the `tasks` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ClientStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ClientMemberRole" AS ENUM ('LEAD', 'MEMBER', 'OBSERVER');

-- CreateEnum
CREATE TYPE "MeetingParticipantRole" AS ENUM ('HOST', 'PARTICIPANT', 'OBSERVER');

-- CreateEnum
CREATE TYPE "TranscriptFormat" AS ENUM ('RAW', 'NORMALIZED', 'STRUCTURED');

-- CreateEnum
CREATE TYPE "DecisionStatus" AS ENUM ('ACTIVE', 'SUPERSEDED', 'REVOKED');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "OpenQuestionStatus" AS ENUM ('OPEN', 'RESOLVED', 'DEFERRED');

-- CreateEnum
CREATE TYPE "ImportantPointCategory" AS ENUM ('COMMITMENT', 'CONSTRAINT', 'INSIGHT', 'WARNING', 'RISK', 'OPPORTUNITY');

-- CreateEnum
CREATE TYPE "GuardrailRuleType" AS ENUM ('NDA', 'LEGAL', 'TERMINOLOGY', 'INTERNAL', 'CUSTOM');

-- CreateEnum
CREATE TYPE "GuardrailSeverity" AS ENUM ('INFO', 'WARNING', 'BLOCK');

-- CreateEnum
CREATE TYPE "GuardrailSourceType" AS ENUM ('DECISION', 'IMPORTANT_POINT', 'MANUAL');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('NOTE', 'CONTRACT', 'PROPOSAL', 'SOW', 'BRIEF', 'TEMPLATE', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ReminderStatus" AS ENUM ('PENDING', 'TRIGGERED', 'DISMISSED', 'SNOOZED');

-- CreateEnum
CREATE TYPE "ReminderEntityType" AS ENUM ('TASK', 'MEETING', 'DECISION', 'OPEN_QUESTION');

-- AlterEnum
ALTER TYPE "MeetingStatus" ADD VALUE 'CANCELLED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TaskStatus" ADD VALUE 'IN_PROGRESS';
ALTER TYPE "TaskStatus" ADD VALUE 'BLOCKED';
ALTER TYPE "TaskStatus" ADD VALUE 'CANCELLED';

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'ADMIN';

-- DropForeignKey
ALTER TABLE "account" DROP CONSTRAINT "account_userId_fkey";

-- DropForeignKey
ALTER TABLE "decisions" DROP CONSTRAINT "decisions_authorId_fkey";

-- DropForeignKey
ALTER TABLE "decisions" DROP CONSTRAINT "decisions_orgId_fkey";

-- DropForeignKey
ALTER TABLE "meetings" DROP CONSTRAINT "meetings_orgId_fkey";

-- DropForeignKey
ALTER TABLE "session" DROP CONSTRAINT "session_userId_fkey";

-- DropForeignKey
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_assigneeId_fkey";

-- DropForeignKey
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_creatorId_fkey";

-- DropForeignKey
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_orgId_fkey";

-- DropForeignKey
ALTER TABLE "user" DROP CONSTRAINT "user_orgId_fkey";

-- DropIndex
DROP INDEX "decisions_orgId_idx";

-- DropIndex
DROP INDEX "meetings_orgId_idx";

-- DropIndex
DROP INDEX "tasks_orgId_idx";

-- AlterTable
ALTER TABLE "decisions" DROP COLUMN "orgId",
ADD COLUMN     "clientId" TEXT NOT NULL,
ADD COLUMN     "status" "DecisionStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "tags" TEXT[];

-- AlterTable
ALTER TABLE "meetings" DROP COLUMN "orgId",
ADD COLUMN     "agenda" TEXT,
ADD COLUMN     "calendarEventId" TEXT,
ADD COLUMN     "clientId" TEXT NOT NULL,
ADD COLUMN     "summary" TEXT;

-- AlterTable
ALTER TABLE "orgs" ADD COLUMN     "settings" JSONB,
ADD COLUMN     "slug" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "tasks" DROP COLUMN "orgId",
ADD COLUMN     "clientId" TEXT NOT NULL,
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "decisionId" TEXT,
ADD COLUMN     "externalRef" TEXT,
ADD COLUMN     "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM';

-- DropTable
DROP TABLE "account";

-- DropTable
DROP TABLE "session";

-- DropTable
DROP TABLE "user";

-- DropTable
DROP TABLE "verification";

-- CreateTable
CREATE TABLE "clients" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "status" "ClientStatus" NOT NULL DEFAULT 'ACTIVE',
    "industry" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'MEMBER',
    "timezone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_members" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ClientMemberRole" NOT NULL DEFAULT 'MEMBER',
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verifications" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_participants" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "userId" TEXT,
    "externalName" TEXT,
    "externalEmail" TEXT,
    "role" "MeetingParticipantRole" NOT NULL DEFAULT 'PARTICIPANT',
    "attendedAt" TIMESTAMP(3),

    CONSTRAINT "meeting_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transcripts" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "format" "TranscriptFormat" NOT NULL DEFAULT 'RAW',
    "duration" INTEGER,
    "wordCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transcripts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "open_questions" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "meetingId" TEXT,
    "assigneeId" TEXT,
    "resolvedByDecisionId" TEXT,
    "question" TEXT NOT NULL,
    "context" TEXT,
    "status" "OpenQuestionStatus" NOT NULL DEFAULT 'OPEN',
    "dueAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "open_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "important_points" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "meetingId" TEXT,
    "speakerId" TEXT,
    "content" TEXT NOT NULL,
    "category" "ImportantPointCategory" NOT NULL DEFAULT 'INSIGHT',
    "transcriptEvidence" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "important_points_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policy_guardrails" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "clientId" TEXT,
    "createdById" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "ruleType" "GuardrailRuleType" NOT NULL,
    "pattern" TEXT,
    "keywords" TEXT[],
    "severity" "GuardrailSeverity" NOT NULL DEFAULT 'WARNING',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sourceType" "GuardrailSourceType",
    "sourceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "policy_guardrails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "createdById" TEXT,
    "parentId" TEXT,
    "type" "DocumentType" NOT NULL DEFAULT 'NOTE',
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "mimeType" TEXT,
    "fileUrl" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reminders" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "status" "ReminderStatus" NOT NULL DEFAULT 'PENDING',
    "linkedEntityType" "ReminderEntityType",
    "linkedEntityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reminders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "clients_orgId_idx" ON "clients"("orgId");

-- CreateIndex
CREATE INDEX "clients_status_idx" ON "clients"("status");

-- CreateIndex
CREATE UNIQUE INDEX "clients_orgId_slug_key" ON "clients"("orgId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_orgId_idx" ON "users"("orgId");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "client_members_clientId_idx" ON "client_members"("clientId");

-- CreateIndex
CREATE INDEX "client_members_userId_idx" ON "client_members"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "client_members_clientId_userId_key" ON "client_members"("clientId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");

-- CreateIndex
CREATE INDEX "meeting_participants_meetingId_idx" ON "meeting_participants"("meetingId");

-- CreateIndex
CREATE INDEX "meeting_participants_userId_idx" ON "meeting_participants"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "meeting_participants_meetingId_userId_key" ON "meeting_participants"("meetingId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "transcripts_meetingId_key" ON "transcripts"("meetingId");

-- CreateIndex
CREATE INDEX "transcripts_meetingId_idx" ON "transcripts"("meetingId");

-- CreateIndex
CREATE INDEX "open_questions_clientId_idx" ON "open_questions"("clientId");

-- CreateIndex
CREATE INDEX "open_questions_meetingId_idx" ON "open_questions"("meetingId");

-- CreateIndex
CREATE INDEX "open_questions_status_idx" ON "open_questions"("status");

-- CreateIndex
CREATE INDEX "important_points_clientId_idx" ON "important_points"("clientId");

-- CreateIndex
CREATE INDEX "important_points_meetingId_idx" ON "important_points"("meetingId");

-- CreateIndex
CREATE INDEX "important_points_category_idx" ON "important_points"("category");

-- CreateIndex
CREATE INDEX "policy_guardrails_orgId_idx" ON "policy_guardrails"("orgId");

-- CreateIndex
CREATE INDEX "policy_guardrails_clientId_idx" ON "policy_guardrails"("clientId");

-- CreateIndex
CREATE INDEX "policy_guardrails_ruleType_idx" ON "policy_guardrails"("ruleType");

-- CreateIndex
CREATE INDEX "policy_guardrails_isActive_idx" ON "policy_guardrails"("isActive");

-- CreateIndex
CREATE INDEX "documents_clientId_idx" ON "documents"("clientId");

-- CreateIndex
CREATE INDEX "documents_type_idx" ON "documents"("type");

-- CreateIndex
CREATE INDEX "documents_status_idx" ON "documents"("status");

-- CreateIndex
CREATE INDEX "documents_parentId_idx" ON "documents"("parentId");

-- CreateIndex
CREATE INDEX "reminders_userId_idx" ON "reminders"("userId");

-- CreateIndex
CREATE INDEX "reminders_clientId_idx" ON "reminders"("clientId");

-- CreateIndex
CREATE INDEX "reminders_status_idx" ON "reminders"("status");

-- CreateIndex
CREATE INDEX "reminders_dueAt_idx" ON "reminders"("dueAt");

-- CreateIndex
CREATE INDEX "decisions_clientId_idx" ON "decisions"("clientId");

-- CreateIndex
CREATE INDEX "decisions_status_idx" ON "decisions"("status");

-- CreateIndex
CREATE INDEX "meetings_clientId_idx" ON "meetings"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "orgs_slug_key" ON "orgs"("slug");

-- CreateIndex
CREATE INDEX "tasks_clientId_idx" ON "tasks"("clientId");

-- CreateIndex
CREATE INDEX "tasks_decisionId_idx" ON "tasks"("decisionId");

-- CreateIndex
CREATE INDEX "tasks_priority_idx" ON "tasks"("priority");

-- CreateIndex
CREATE INDEX "tasks_dueAt_idx" ON "tasks"("dueAt");

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_members" ADD CONSTRAINT "client_members_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_members" ADD CONSTRAINT "client_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_participants" ADD CONSTRAINT "meeting_participants_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_participants" ADD CONSTRAINT "meeting_participants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "decisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "open_questions" ADD CONSTRAINT "open_questions_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "open_questions" ADD CONSTRAINT "open_questions_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "meetings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "open_questions" ADD CONSTRAINT "open_questions_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "open_questions" ADD CONSTRAINT "open_questions_resolvedByDecisionId_fkey" FOREIGN KEY ("resolvedByDecisionId") REFERENCES "decisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "important_points" ADD CONSTRAINT "important_points_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "important_points" ADD CONSTRAINT "important_points_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "meetings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "important_points" ADD CONSTRAINT "important_points_speakerId_fkey" FOREIGN KEY ("speakerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_guardrails" ADD CONSTRAINT "policy_guardrails_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_guardrails" ADD CONSTRAINT "policy_guardrails_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_guardrails" ADD CONSTRAINT "policy_guardrails_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
