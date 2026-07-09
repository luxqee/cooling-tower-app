import type { Prisma } from "@prisma/client";
import { calculateCostUsd } from "./cost";

interface AiUsage {
  userId: string;
  feature: "validation" | "voice_note" | "company_assistant";
  model: string;
  promptTokens: number;
  outputTokens: number;
  toolCalls?: Prisma.InputJsonValue;
}

// Every AI feature's audit-log write goes through this one place, so cost
// calculation can't drift between call sites and the row shape stays
// consistent. Returns plain `data` (not an executed `db.aiAuditLog.create`
// call) so callers can use it standalone OR as one element of a
// `db.$transaction([...])` array — both existing usages need to keep working.
export function buildAiAuditLogData(usage: AiUsage): Prisma.AiAuditLogCreateArgs["data"] {
  const costUsd = calculateCostUsd(usage.model, usage.promptTokens, usage.outputTokens);
  return {
    userId: usage.userId,
    feature: usage.feature,
    promptTokens: usage.promptTokens,
    outputTokens: usage.outputTokens,
    costUsd,
    ...(usage.toolCalls !== undefined ? { toolCalls: usage.toolCalls } : {}),
  };
}
