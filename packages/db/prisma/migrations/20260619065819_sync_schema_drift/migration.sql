



-- AlterTable
ALTER TABLE "client_members" ADD COLUMN     "image" TEXT,
ADD COLUMN     "persona" JSONB;

-- AlterTable
ALTER TABLE "meetings" ADD COLUMN     "speakerMappings" JSONB;
