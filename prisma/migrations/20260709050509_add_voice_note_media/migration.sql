-- CreateEnum
CREATE TYPE "VoiceNoteMediaType" AS ENUM ('audio', 'video');

-- AlterTable
ALTER TABLE "VoiceNote" ADD COLUMN     "mediaType" "VoiceNoteMediaType" NOT NULL DEFAULT 'audio';

-- CreateTable
CREATE TABLE "VoiceNotePhoto" (
    "id" TEXT NOT NULL,
    "voiceNoteId" TEXT NOT NULL,
    "photoUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VoiceNotePhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VoiceNotePhoto_voiceNoteId_idx" ON "VoiceNotePhoto"("voiceNoteId");

-- AddForeignKey
ALTER TABLE "VoiceNotePhoto" ADD CONSTRAINT "VoiceNotePhoto_voiceNoteId_fkey" FOREIGN KEY ("voiceNoteId") REFERENCES "VoiceNote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
