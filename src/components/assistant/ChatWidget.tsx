"use client";

import { useState, useRef, useEffect } from "react";
import { MessageCircle, X, Send } from "lucide-react";

interface ChatMessageDisplay {
  role: "user" | "assistant";
  content: string;
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
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  async function send() {
    const trimmed = input.trim();
    if (!trimmed || sending) return;
    setError(null);
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
    } catch {
      setError("Failed to send. Try again.");
    } finally {
      setSending(false);
    }
  }

  const panel = (
    <div className={inline ? "rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex flex-col h-[420px]" : "w-80 sm:w-96 h-[480px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-xl flex flex-col"}>
      {!inline && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <p className="text-sm font-semibold">Assistant</p>
          <button onClick={() => setOpen(false)} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <p className="text-sm text-slate-400">Ask about jobs, compliance, assignments, or draft a variation/quote.</p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`text-sm ${m.role === "user" ? "text-right" : "text-left"}`}>
            <span className={`inline-block px-3 py-2 rounded-lg max-w-[85%] ${m.role === "user" ? "bg-amber-600 text-white" : "bg-slate-100 dark:bg-slate-700"}`}>
              {m.content}
            </span>
          </div>
        ))}
        {sending && <p className="text-xs text-slate-400">Thinking…</p>}
        {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      </div>
      <div className="flex gap-2 p-3 border-t border-slate-200 dark:border-slate-700">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") send(); }}
          placeholder="Ask a question…"
          className="flex-1 min-h-[40px] rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 text-sm"
        />
        <button
          onClick={send}
          disabled={sending}
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
