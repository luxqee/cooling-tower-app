import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/clerk", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/db/client", () => ({
  db: {
    chatSession: { create: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn() },
    chatMessage: { create: vi.fn(), findMany: vi.fn() },
    aiAuditLog: { create: vi.fn() },
  },
}));
vi.mock("@/lib/ai/client", () => ({ getAnthropicClient: vi.fn() }));
vi.mock("@/lib/assistant/tools/read", () => ({
  findJobs: vi.fn(),
  findComplianceDocuments: vi.fn(),
  findAssignments: vi.fn(),
  semanticSearchTool: vi.fn(),
}));
vi.mock("@/lib/assistant/tools/draft", () => ({
  draftVariation: vi.fn(),
  draftQuote: vi.fn(),
}));

import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { getAnthropicClient } from "@/lib/ai/client";
import { findJobs } from "@/lib/assistant/tools/read";
import { POST } from "../route";

const mockDirector = { id: "u1", role: "director" as const, name: "Dana", clerkId: "c1", email: "d@t.com", isActive: true };

function makeReq(body: unknown) {
  return new Request("http://localhost/api/assistant/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(db.chatSession.create).mockResolvedValue({ id: "sess1", userId: "u1" } as any);
  vi.mocked(db.chatMessage.findMany).mockResolvedValue([]);
  vi.mocked(db.chatMessage.create).mockResolvedValue({} as any);
  vi.mocked(db.aiAuditLog.create).mockResolvedValue({} as any);
});

describe("POST /api/assistant/chat", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Unauthorized"));
    const res = await POST(makeReq({ message: "hi" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 for an empty message", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockDirector as any);
    const res = await POST(makeReq({ message: "" }));
    expect(res.status).toBe(400);
  });

  it("returns Claude's direct text response when no tool call is needed", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockDirector as any);
    const mockCreate = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "Hello! How can I help?" }],
      stop_reason: "end_turn",
      usage: { input_tokens: 50, output_tokens: 10 },
    });
    vi.mocked(getAnthropicClient).mockReturnValue({ messages: { create: mockCreate } } as any);

    const res = await POST(makeReq({ message: "hi" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.reply).toBe("Hello! How can I help?");
    expect(db.aiAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ feature: "company_assistant", promptTokens: 50, outputTokens: 10 }),
      })
    );
  });

  it("executes a tool call, feeds the result back, and returns the follow-up text — one AiAuditLog row for the whole turn", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockDirector as any);
    vi.mocked(findJobs).mockResolvedValue([{ id: "j1", customerName: "Rio Tinto", siteName: "Weipa", status: "active" }] as any);

    const mockCreate = vi.fn()
      .mockResolvedValueOnce({
        content: [{ type: "tool_use", id: "tool1", name: "findJobs", input: { customerName: "Rio Tinto" } }],
        stop_reason: "tool_use",
        usage: { input_tokens: 100, output_tokens: 20 },
      })
      .mockResolvedValueOnce({
        content: [{ type: "text", text: "Rio Tinto has one active job at Weipa." }],
        stop_reason: "end_turn",
        usage: { input_tokens: 150, output_tokens: 15 },
      });
    vi.mocked(getAnthropicClient).mockReturnValue({ messages: { create: mockCreate } } as any);

    const res = await POST(makeReq({ message: "What jobs does Rio Tinto have?" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.reply).toBe("Rio Tinto has one active job at Weipa.");
    expect(findJobs).toHaveBeenCalledWith({ customerName: "Rio Tinto" });
    expect(mockCreate).toHaveBeenCalledTimes(2);
    // One AiAuditLog row for the whole turn, tokens summed across both rounds
    expect(db.aiAuditLog.create).toHaveBeenCalledTimes(1);
    expect(db.aiAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ promptTokens: 250, outputTokens: 35 }),
      })
    );
  });

  it("returns a graceful message instead of a 500 when the Claude API call throws", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockDirector as any);
    const mockCreate = vi.fn().mockRejectedValue(new Error("Claude API error"));
    vi.mocked(getAnthropicClient).mockReturnValue({ messages: { create: mockCreate } } as any);

    const res = await POST(makeReq({ message: "hi" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.reply).toMatch(/trouble/i);
  });

  it("returns 404 (not another user's session) when sessionId belongs to a different user", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockDirector as any);
    vi.mocked(db.chatSession.findFirst).mockResolvedValue(null);

    const res = await POST(makeReq({ message: "hi", sessionId: "someone-elses-session" }));

    expect(res.status).toBe(404);
    expect(db.chatSession.findFirst).toHaveBeenCalledWith({
      where: { id: "someone-elses-session", userId: mockDirector.id },
    });
  });
});
