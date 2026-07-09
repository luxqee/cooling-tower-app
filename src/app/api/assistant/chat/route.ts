import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { getAnthropicClient } from "@/lib/ai/client";
import { calculateCostUsd } from "@/lib/ai/cost";
import { validateChatInput } from "@/lib/assistant/validate";
import { ASSISTANT_TOOLS } from "@/lib/assistant/toolDefinitions";
import { findJobs, findComplianceDocuments, findAssignments, semanticSearchTool } from "@/lib/assistant/tools/read";
import { draftVariation, draftQuote } from "@/lib/assistant/tools/draft";
import type Anthropic from "@anthropic-ai/sdk";
import type { Prisma } from "@prisma/client";

const MODEL = "claude-sonnet-5";
const MAX_ROUNDS = 5;
const FALLBACK_MESSAGE = "I'm having trouble right now — please try again in a moment.";

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
      return semanticSearchTool(input as never);
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

  const body = await req.json();
  const parsed = validateChatInput(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }
  const { message } = parsed.data;

  const session = parsed.data.sessionId
    ? await db.chatSession.findUnique({ where: { id: parsed.data.sessionId } })
    : await db.chatSession.create({ data: { userId: user.id, title: message.slice(0, 80) } });

  if (!session) {
    return NextResponse.json({ error: "Chat session not found" }, { status: 404 });
  }

  const history = await db.chatMessage.findMany({
    where: { sessionId: session.id },
    orderBy: { createdAt: "asc" },
    select: { role: true, content: true },
  });

  const messages: Anthropic.MessageParam[] = [
    ...history.map((h) => ({ role: h.role as "user" | "assistant", content: h.content })),
    { role: "user" as const, content: message },
  ];

  await db.chatMessage.create({ data: { sessionId: session.id, role: "user", content: message } });

  let totalPromptTokens = 0;
  let totalOutputTokens = 0;
  const toolCallLog: { tool: string; input: unknown }[] = [];
  let finalText = FALLBACK_MESSAGE;

  try {
    const client = getAnthropicClient();

    for (let round = 0; round < MAX_ROUNDS; round++) {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 2048,
        system:
          "You are an assistant for a cooling tower maintenance field-ops company. Answer questions using the tools available to you. For semantic search, use it when the user asks to find or search notes/communications by topic rather than exact match.",
        tools: ASSISTANT_TOOLS,
        messages,
      });

      totalPromptTokens += response.usage.input_tokens;
      totalOutputTokens += response.usage.output_tokens;

      const textBlock = response.content.find((b) => b.type === "text");
      if (textBlock && "text" in textBlock) finalText = textBlock.text;

      if (response.stop_reason !== "tool_use") {
        break;
      }

      messages.push({ role: "assistant", content: response.content });

      const toolUseBlocks = response.content.filter((b) => b.type === "tool_use");
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

    const costUsd = calculateCostUsd(MODEL, totalPromptTokens, totalOutputTokens);
    const toolCallsJson = toolCallLog as unknown as Prisma.InputJsonValue;
    await db.aiAuditLog.create({
      data: {
        userId: user.id,
        feature: "company_assistant",
        toolCalls: toolCallsJson,
        promptTokens: totalPromptTokens,
        outputTokens: totalOutputTokens,
        costUsd,
      },
    });

    await db.chatMessage.create({
      data: { sessionId: session.id, role: "assistant", content: finalText, toolCalls: toolCallsJson },
    });
  } catch (err) {
    console.error("Assistant chat turn failed:", err);
    finalText = FALLBACK_MESSAGE;
  }

  return NextResponse.json({ sessionId: session.id, reply: finalText });
}
