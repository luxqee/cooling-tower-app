"use client";

import { useState, useRef, useEffect } from "react";
import { MessageCircle, X, Send } from "lucide-react";
import { renderFormattedMessage } from "@/lib/chat/formatMessage";
import { loadChatState, saveChatState } from "@/lib/chat/persistChatState";

interface ChatMessageDisplay {
  role: "user" | "assistant";
  content: string;
}

interface PendingAction {
  tool: string;
  input: Record<string, unknown>;
}

interface ChatWidgetProps {
  inline?: boolean;
}

export function ChatWidget({ inline = false }: ChatWidgetProps) {
  const [open, setOpen] = useState(inline);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessageDisplay[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Not persisted across navigation, unlike messages/sessionId — if the user
  // navigates away before confirming, the proposal is simply dropped rather
  // than silently executed later; they can ask again.
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Real state (not a ref) so the "hydration finished" flag lands in the
  // SAME render as the restored sessionId/messages — a ref would flip
  // synchronously before that render committed, letting the persistence
  // effect below fire once with the pre-hydration empty state and
  // overwrite the very data hydration just loaded.
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from the previous page's conversation, if any — otherwise the
  // widget remounting on every navigation would silently wipe the chat.
  useEffect(() => {
    const saved = loadChatState();
    if (saved) {
      setSessionId(saved.sessionId);
      setMessages(saved.messages);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveChatState({ sessionId, messages });
  }, [hydrated, sessionId, messages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  async function send() {
    const trimmed = input.trim();
    if (!trimmed || sending) return;
    setError(null);
    setPendingAction(null);
    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setInput("");
    setSending(true);
    try {
      const res = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sessionId ?? undefined, message: trimmed }),
      });
      if (!res.ok) throw new Error("Request failed");
      const data = await res.json();
      setSessionId(data.sessionId);
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
      setPendingAction(data.pendingAction ?? null);
    } catch {
      // Roll the failed message back into the input rather than losing it —
      // the user can retry without retyping.
      setMessages((prev) => prev.slice(0, -1));
      setInput(trimmed);
      setError("Failed to send. Try again.");
    } finally {
      setSending(false);
    }
  }

  async function confirmPendingAction() {
    if (!pendingAction || sending) return;
    setError(null);
    setSending(true);
    try {
      const res = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sessionId ?? undefined, confirmAction: pendingAction }),
      });
      if (!res.ok) throw new Error("Request failed");
      const data = await res.json();
      setSessionId(data.sessionId);
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
    } catch {
      setError("Failed to complete that action. Try again.");
    } finally {
      setPendingAction(null);
      setSending(false);
    }
  }

  async function sendQuickAction(action: "activeJobs" | "weekAssignments" | "overdueJobs" | "pendingVariations" | "unpaidInvoices") {
    if (sending) return;
    setError(null);
    setSending(true);
    try {
      const res = await fetch("/api/assistant/quick-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error("Request failed");
      const data = await res.json();
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
    } catch {
      setError("Failed to load. Try again.");
    } finally {
      setSending(false);
    }
  }

  function discardPendingAction() {
    setPendingAction(null);
  }

  const panel = (
    <div className={inline ? "rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 flex flex-col h-[420px] max-h-[80vh]" : "w-80 sm:w-96 h-[480px] max-h-[80vh] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-xl flex flex-col"}>
      {!inline && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-300 dark:border-slate-700">
          <p className="text-sm font-semibold">Assistant</p>
          <button onClick={() => setOpen(false)} className="h-11 w-11 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <p className="text-sm text-slate-500">Ask about jobs, compliance, assignments, or draft a variation/quote.</p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`text-sm ${m.role === "user" ? "text-right" : "text-left"}`}>
            <span className={`inline-block px-3 py-2 rounded-lg max-w-[85%] ${m.role === "user" ? "bg-amber-600 text-white" : "bg-slate-100 dark:bg-slate-700"}`}>
              {m.role === "assistant" ? renderFormattedMessage(m.content) : m.content}
            </span>
          </div>
        ))}
        {sending && <p className="text-xs text-slate-500">Thinking…</p>}
        {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
        {pendingAction && (
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={discardPendingAction}
              disabled={sending}
              className="min-h-[36px] px-3 rounded-lg border border-slate-300 dark:border-slate-600 text-sm font-medium disabled:opacity-40"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={confirmPendingAction}
              disabled={sending}
              className="min-h-[36px] px-3 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold disabled:opacity-40"
            >
              Confirm
            </button>
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 px-3 pt-2">
        <button
          type="button"
          onClick={() => sendQuickAction("activeJobs")}
          disabled={sending || !!pendingAction}
          className="min-h-[32px] rounded-lg border border-slate-300 dark:border-slate-600 text-xs font-medium disabled:opacity-40"
        >
          Active jobs
        </button>
        <button
          type="button"
          onClick={() => sendQuickAction("weekAssignments")}
          disabled={sending || !!pendingAction}
          className="min-h-[32px] rounded-lg border border-slate-300 dark:border-slate-600 text-xs font-medium disabled:opacity-40"
        >
          This week&apos;s assignments
        </button>
        <button
          type="button"
          onClick={() => sendQuickAction("overdueJobs")}
          disabled={sending || !!pendingAction}
          className="min-h-[32px] rounded-lg border border-slate-300 dark:border-slate-600 text-xs font-medium disabled:opacity-40"
        >
          Overdue jobs
        </button>
        <button
          type="button"
          onClick={() => sendQuickAction("pendingVariations")}
          disabled={sending || !!pendingAction}
          className="min-h-[32px] rounded-lg border border-slate-300 dark:border-slate-600 text-xs font-medium disabled:opacity-40"
        >
          Pending variations
        </button>
        <button
          type="button"
          onClick={() => sendQuickAction("unpaidInvoices")}
          disabled={sending || !!pendingAction}
          className="col-span-2 min-h-[32px] rounded-lg border border-slate-300 dark:border-slate-600 text-xs font-medium disabled:opacity-40"
        >
          Unpaid invoices
        </button>
      </div>
      <div className="flex gap-2 p-3 border-t border-slate-300 dark:border-slate-700">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") send(); }}
          disabled={!!pendingAction}
          placeholder={pendingAction ? "Confirm or discard the action above…" : "Ask a question…"}
          className="flex-1 min-h-[40px] rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 text-sm disabled:opacity-50"
        />
        <button
          onClick={send}
          disabled={sending || !!pendingAction}
          aria-label="Send"
          className="min-h-[40px] px-3 rounded-lg bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-40"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );

  if (inline) return panel;

  return (
    <div className="fixed bottom-4 right-4 z-40">
      {open ? panel : (
        <button
          onClick={() => setOpen(true)}
          aria-label="Open assistant"
          className="w-14 h-14 rounded-full bg-amber-600 hover:bg-amber-700 text-white shadow-lg flex items-center justify-center"
        >
          <MessageCircle className="w-6 h-6" />
        </button>
      )}
    </div>
  );
}
