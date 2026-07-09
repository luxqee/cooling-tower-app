import { describe, it, expect, vi, beforeEach } from "vitest";
import { loadChatState, saveChatState, clearChatState } from "../persistChatState";

function mockSessionStorage() {
  const store = new Map<string, string>();
  const mock = {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { store.set(key, value); }),
    removeItem: vi.fn((key: string) => { store.delete(key); }),
  };
  vi.stubGlobal("sessionStorage", mock);
  return mock;
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("loadChatState", () => {
  it("returns null when nothing is stored", () => {
    mockSessionStorage();
    expect(loadChatState()).toBeNull();
  });

  it("returns the parsed state when valid JSON is stored", () => {
    const storage = mockSessionStorage();
    storage.setItem("assistant-chat-state", JSON.stringify({
      sessionId: "sess1",
      messages: [{ role: "user", content: "hi" }],
    }));

    const state = loadChatState();

    expect(state).toEqual({ sessionId: "sess1", messages: [{ role: "user", content: "hi" }] });
  });

  it("returns null for corrupted JSON instead of throwing", () => {
    const storage = mockSessionStorage();
    storage.setItem("assistant-chat-state", "{not valid json");

    expect(loadChatState()).toBeNull();
  });

  it("returns null when the stored shape is missing messages", () => {
    const storage = mockSessionStorage();
    storage.setItem("assistant-chat-state", JSON.stringify({ sessionId: "sess1" }));

    expect(loadChatState()).toBeNull();
  });

  it("returns null when sessionStorage itself is unavailable", () => {
    vi.stubGlobal("sessionStorage", undefined);
    expect(loadChatState()).toBeNull();
  });
});

describe("saveChatState", () => {
  it("writes the state as JSON under the storage key", () => {
    const storage = mockSessionStorage();
    saveChatState({ sessionId: "sess1", messages: [{ role: "assistant", content: "hello" }] });

    expect(storage.setItem).toHaveBeenCalledWith(
      "assistant-chat-state",
      JSON.stringify({ sessionId: "sess1", messages: [{ role: "assistant", content: "hello" }] })
    );
  });

  it("does not throw when sessionStorage.setItem throws (quota exceeded, private browsing)", () => {
    const storage = mockSessionStorage();
    storage.setItem.mockImplementation(() => { throw new Error("QuotaExceededError"); });

    expect(() => saveChatState({ sessionId: null, messages: [] })).not.toThrow();
  });
});

describe("clearChatState", () => {
  it("removes the storage key", () => {
    const storage = mockSessionStorage();
    clearChatState();
    expect(storage.removeItem).toHaveBeenCalledWith("assistant-chat-state");
  });
});
