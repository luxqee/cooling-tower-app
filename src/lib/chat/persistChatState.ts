const STORAGE_KEY = "assistant-chat-state";

export interface PersistedChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface PersistedChatState {
  sessionId: string | null;
  messages: PersistedChatMessage[];
}

function isPersistedChatState(value: unknown): value is PersistedChatState {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return Array.isArray(v.messages) && (v.sessionId === null || typeof v.sessionId === "string");
}

// sessionStorage (not localStorage) is deliberate: the chat should survive
// navigating between pages in the same tab, but not linger forever across
// browser sessions on a shared/kiosk device.
export function loadChatState(): PersistedChatState | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isPersistedChatState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveChatState(state: PersistedChatState): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage unavailable (private browsing, quota exceeded) — chat still
    // works for the current page load, it just won't survive navigation.
  }
}

export function clearChatState(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
