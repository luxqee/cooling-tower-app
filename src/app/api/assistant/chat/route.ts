import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { requireRole } from "@/lib/auth/clerk";
import { checkRateLimit } from "@/lib/rateLimit";
import { db } from "@/lib/db/client";
import { getAnthropicClient } from "@/lib/ai/client";
import { AI_MODELS } from "@/lib/ai/models";
import { buildAiAuditLogData } from "@/lib/ai/audit";
import { validateChatInput } from "@/lib/assistant/validate";
import { describeDraftAction } from "@/lib/assistant/describeDraftAction";
import { ASSISTANT_TOOLS } from "@/lib/assistant/toolDefinitions";
import { findJobs, findComplianceDocuments, findAssignments, semanticSearchTool } from "@/lib/assistant/tools/read";
import { draftVariation, draftQuote } from "@/lib/assistant/tools/draft";
import type Anthropic from "@anthropic-ai/sdk";
import type { Prisma } from "@prisma/client";

const MODEL = AI_MODELS.COMPANY_ASSISTANT;
const MAX_ROUNDS = 5;
const FALLBACK_MESSAGE = "I'm having trouble right now — please try again in a moment.";

// draftVariation/draftQuote create real records, so they're never executed
// automatically inside the model's own tool-calling loop — the loop pauses
// and asks the human to confirm first (see the confirmAction request path
// below). Read-only tools carry no such risk and run immediately.
const DRAFT_TOOLS = new Set(["draftVariation", "draftQuote"]);

interface CallingUser {
  id: string;
  role: string;
  name: string;
}

async function dispatchTool(name: string, input: Record<string, unknown>, callingUser: CallingUser) {
  switch (name) {
    case "findJobs":
      return findJobs(input as never);
    case "findComplianceDocuments":
      return findComplianceDocuments(input as never);
    case "findAssignments":
      return findAssignments(input as never);
    case "semanticSearchTool":
      return semanticSearchTool(input as never, callingUser);
    case "draftVariation":
      return draftVariation(input as never, callingUser);
    case "draftQuote":
      return draftQuote(input as never, callingUser);
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

export async function POST(req: Request) {
  const user = await requireRole(["director", "service_manager", "admin", "sales_engineer"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!(await checkRateLimit(`chat:${user.id}`))) {
    return NextResponse.json({ error: "Too many requests — please slow down." }, { status: 429 });
  }

  const body = await req.json();
  const parsed = validateChatInput(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  // Confirming a previously-proposed draft action skips the model entirely —
  // the human already decided; we just execute the exact tool call that was
  // shown to them and report the result.
  if (parsed.data.confirmAction) {
    const session = await db.chatSession.findFirst({
      where: { id: parsed.data.sessionId, userId: user.id },
    });
    if (!session) {
      return NextResponse.json({ error: "Chat session not found" }, { status: 404 });
    }

    const { tool, input } = parsed.data.confirmAction;
    const result = await dispatchTool(tool, input, user);
    const success = !(result && typeof result === "object" && "ok" in result && result.ok === false);
    const reply = success
      ? "Done — created and sent for review."
      : `Couldn't complete that: ${(result as { error?: string }).error ?? "unknown error"}`;

    const toolCallsJson = [{ tool, input, confirmed: true }] as unknown as Prisma.InputJsonValue;
    await db.aiAuditLog.create({
      data: buildAiAuditLogData({
        userId: user.id,
        feature: "company_assistant",
        model: MODEL,
        promptTokens: 0,
        outputTokens: 0,
        toolCalls: toolCallsJson,
      }),
    });
    await db.chatMessage.create({
      data: { sessionId: session.id, role: "assistant", content: reply, toolCalls: toolCallsJson },
    });

    return NextResponse.json({ sessionId: session.id, reply, pendingAction: null });
  }

  const message = parsed.data.message!;

  const session = parsed.data.sessionId
    ? await db.chatSession.findFirst({ where: { id: parsed.data.sessionId, userId: user.id } })
    : await db.chatSession.create({ data: { userId: user.id, title: message.slice(0, 80) } });

  if (!session) {
    return NextResponse.json({ error: "Chat session not found" }, { status: 404 });
  }

  // Capped to the most recent messages, not the session's full history — an
  // uncapped fetch here would mean token cost (and DB read size) grows with
  // every message added to a long-running session, forever. Fetched newest
  // first so the cap keeps the *most recent* messages, then reversed back to
  // chronological order for the prompt.
  const CHAT_HISTORY_LIMIT = 20;
  const recentHistory = await db.chatMessage.findMany({
    where: { sessionId: session.id },
    orderBy: { createdAt: "desc" },
    take: CHAT_HISTORY_LIMIT,
    select: { role: true, content: true },
  });
  const history = recentHistory.reverse();

  const messages: Anthropic.MessageParam[] = [
    ...history.map((h) => ({ role: h.role as "user" | "assistant", content: h.content })),
    { role: "user" as const, content: message },
  ];

  await db.chatMessage.create({ data: { sessionId: session.id, role: "user", content: message } });

  const businessProfile = await db.businessProfile.findFirst();
  const industryDescription = businessProfile?.industryDescription ?? "field service maintenance";
  const systemPrompt = `You are an assistant for a ${industryDescription} field-ops company. Answer questions using the tools available to you. For semantic search, use it when the user asks to find or search notes/communications by topic rather than exact match.`;

  let totalPromptTokens = 0;
  let totalOutputTokens = 0;
  const toolCallLog: { tool: string; input: unknown }[] = [];
  let finalText = FALLBACK_MESSAGE;
  let pendingAction: { tool: string; input: Record<string, unknown> } | null = null;

  try {
    const client = getAnthropicClient();

    for (let round = 0; round < MAX_ROUNDS; round++) {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 2048,
        system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
        tools: ASSISTANT_TOOLS,
        messages,
      });

      totalPromptTokens += response.usage.input_tokens;
      totalOutputTokens += response.usage.output_tokens;

      const textBlock = response.content.find((b) => b.type === "text");
      const claudeText = textBlock && "text" in textBlock ? textBlock.text : null;
      if (claudeText) finalText = claudeText;

      if (response.stop_reason !== "tool_use") {
        break;
      }

      const toolUseBlocks = response.content.filter((b) => b.type === "tool_use");
      const draftCall = toolUseBlocks.find((b) => b.type === "tool_use" && DRAFT_TOOLS.has(b.name));

      if (draftCall && draftCall.type === "tool_use") {
        const input = draftCall.input as Record<string, unknown>;
        pendingAction = { tool: draftCall.name, input };
        finalText = claudeText ?? describeDraftAction(draftCall.name, input);
        break;
      }

      messages.push({ role: "assistant", content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const toolUse of toolUseBlocks) {
        if (toolUse.type !== "tool_use") continue;
        toolCallLog.push({ tool: toolUse.name, input: toolUse.input });
        const result = await dispatchTool(toolUse.name, toolUse.input as Record<string, unknown>, user);
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: JSON.stringify(result),
        });
      }

      messages.push({ role: "user", content: toolResults });
    }

    const toolCallsJson = (
      pendingAction ? [{ tool: pendingAction.tool, input: pendingAction.input, proposed: true }] : toolCallLog
    ) as unknown as Prisma.InputJsonValue;

    await db.aiAuditLog.create({
      data: buildAiAuditLogData({
        userId: user.id,
        feature: "company_assistant",
        model: MODEL,
        promptTokens: totalPromptTokens,
        outputTokens: totalOutputTokens,
        toolCalls: toolCallsJson,
      }),
    });

    await db.chatMessage.create({
      data: { sessionId: session.id, role: "assistant", content: finalText, toolCalls: toolCallsJson },
    });
  } catch (err) {
    console.error("Assistant chat turn failed:", err);
    Sentry.captureException(err);
    finalText = FALLBACK_MESSAGE;
    pendingAction = null;
  }

  return NextResponse.json({ sessionId: session.id, reply: finalText, pendingAction });
}
