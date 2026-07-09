import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { summarizeTranscript } from "@/lib/ai/voice-note";
import { calculateCostUsd } from "@/lib/ai/cost";

// Called hourly by Vercel Cron (see vercel.json). Safety net: if a technician
// never reviews/sends a transcript within 24h of recording it, finalize it
// automatically using the original, unedited AssemblyAI transcript — so it's
// never lost or stuck in "awaiting review" forever.
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = new Date();
  cutoff.setHours(cutoff.getHours() - 24);

  const staleNotes = await db.voiceNote.findMany({
    where: { status: "awaiting_review", createdAt: { lt: cutoff } },
  });

  let finalized = 0;
  for (const note of staleNotes) {
    try {
      const { summary, promptTokens, outputTokens } = await summarizeTranscript(note.transcript!);
      const costUsd = calculateCostUsd("claude-haiku-4-5", promptTokens, outputTokens);

      await db.$transaction([
        db.voiceNote.update({
          where: { id: note.id },
          data: { summary: summary.summary, actionItems: summary.actionItems, status: "transcribed" },
        }),
        db.aiAuditLog.create({
          data: { userId: note.technicianId, feature: "voice_note", promptTokens, outputTokens, costUsd },
        }),
      ]);
    } catch (err) {
      console.error(`Failed to auto-finalize voice note ${note.id}:`, err);
      await db.voiceNote.update({ where: { id: note.id }, data: { status: "transcribed" } });
    }
    finalized++;
  }

  return NextResponse.json({ finalized, checked: staleNotes.length });
}
