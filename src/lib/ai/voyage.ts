const VOYAGE_EMBEDDINGS_URL = "https://api.voyageai.com/v1/embeddings";
const MODEL = "voyage-3.5";

function apiKey(): string {
  const key = process.env.VOYAGE_API_KEY;
  if (!key) throw new Error("VOYAGE_API_KEY is not set");
  return key;
}

export async function embedText(text: string): Promise<number[]> {
  const res = await fetch(VOYAGE_EMBEDDINGS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ input: [text], model: MODEL }),
  });
  if (!res.ok) throw new Error(`Voyage embeddings request failed: ${res.status}`);
  const data = (await res.json()) as { data: { embedding: number[] }[] };
  return data.data[0].embedding;
}
