// Single source of truth for which Claude model each AI feature uses.
// cost.ts's pricing table and every feature's call site both key off these
// constants instead of duplicating the model-id string, so a model rename
// can't silently desync pricing from what's actually invoked.
export const AI_MODELS = {
  VOICE_NOTE_SUMMARY: "claude-haiku-4-5",
  COMPANY_ASSISTANT: "claude-sonnet-5",
} as const;
