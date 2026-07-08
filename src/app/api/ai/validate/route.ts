import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { getAnthropicClient } from "@/lib/ai/client";
import { calculateCostUsd } from "@/lib/ai/cost";
import { validateAiValidateInput, aiFlagsResponseSchema, type AiFlag } from "@/lib/ai/validate-job";

const MODEL = "claude-haiku-4-5";

export async function POST(req: Request) {
  const user = await requireRole(["admin", "director", "service_manager"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = validateAiValidateInput(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }
  const input = parsed.data;

  // Rule layer — free, instant, runs first.
  const duplicate = await db.job.findFirst({
    where: {
      siteName: { equals: input.siteName, mode: "insensitive" },
      NOT: { customerName: { equals: input.customerName, mode: "insensitive" } },
    },
  });
  if (duplicate) {
    const flags: AiFlag[] = [{
      field: "siteName",
      severity: "warning",
      message: `A job at "${input.siteName}" already exists under a different customer name. Check this isn't a duplicate or a typo.`,
      suggestion: null,
    }];
    return NextResponse.json({ flags });
  }

  // AI layer — only reached when the rule layer finds nothing.
  try {
    const client = getAnthropicClient();
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: "You review cooling-tower maintenance job forms for implausible values before they're saved. Flag only genuinely unusual values — do not flag normal variation. Respond with JSON matching the schema exactly.",
      messages: [{
        role: "user",
        content: `Review this job form for implausible values:\n${JSON.stringify(input, null, 2)}`,
      }],
      output_config: {
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            properties: {
              flags: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    field: { type: "string" },
                    severity: { type: "string", enum: ["warning", "info"] },
                    message: { type: "string" },
                    suggestion: { type: ["string", "null"] },
                  },
                  required: ["field", "severity", "message", "suggestion"],
                  additionalProperties: false,
                },
              },
            },
            required: ["flags"],
            additionalProperties: false,
          },
        },
      },
    });

    const textBlock = response.content.find((b) => b.type === "text");
    const rawJson = textBlock && "text" in textBlock ? textBlock.text : "{}";
    const resultParsed = aiFlagsResponseSchema.safeParse(JSON.parse(rawJson));
    const flags = resultParsed.success ? resultParsed.data.flags : [];

    const costUsd = calculateCostUsd(MODEL, response.usage.input_tokens, response.usage.output_tokens);
    await db.aiAuditLog.create({
      data: {
        userId: user.id,
        feature: "validation",
        promptTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        costUsd,
      },
    });

    return NextResponse.json({ flags });
  } catch {
    // A validation aid going briefly offline must never block saving a job.
    return NextResponse.json({ flags: [] });
  }
}
