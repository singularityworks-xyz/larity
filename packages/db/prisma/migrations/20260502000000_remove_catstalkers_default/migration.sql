-- AlterTable: Remove hardcoded catstalkers.com default image URL
ALTER TABLE "users" ALTER COLUMN "image" DROP DEFAULT;
