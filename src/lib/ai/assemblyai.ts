const ASSEMBLYAI_BASE_URL = "https://api.assemblyai.com/v2";

function apiKey(): string {
  const key = process.env.ASSEMBLYAI_API_KEY;
  if (!key) throw new Error("ASSEMBLYAI_API_KEY is not set");
  return key;
}

export async function uploadAudioToAssemblyAI(audio: Buffer): Promise<string> {
  const res = await fetch(`${ASSEMBLYAI_BASE_URL}/upload`, {
    method: "POST",
    headers: { Authorization: apiKey() },
    body: new Uint8Array(audio),
  });
  if (!res.ok) throw new Error(`AssemblyAI upload failed: ${res.status}`);
  const data = (await res.json()) as { upload_url: string };
  return data.upload_url;
}

export async function submitTranscription(
  audioUrl: string,
  webhookUrl: string,
  webhookSecret: string
): Promise<{ id: string }> {
  const res = await fetch(`${ASSEMBLYAI_BASE_URL}/transcript`, {
    method: "POST",
    headers: { Authorization: apiKey(), "Content-Type": "application/json" },
    body: JSON.stringify({
      audio_url: audioUrl,
      webhook_url: webhookUrl,
      webhook_auth_header_name: "x-webhook-secret",
      webhook_auth_header_value: webhookSecret,
    }),
  });
  if (!res.ok) throw new Error(`AssemblyAI transcript submission failed: ${res.status}`);
  const data = (await res.json()) as { id: string };
  return { id: data.id };
}

export interface AssemblyAiTranscriptResult {
  status: "queued" | "processing" | "completed" | "error";
  text: string | null;
  error: string | null;
}

export async function fetchTranscript(id: string): Promise<AssemblyAiTranscriptResult> {
  const res = await fetch(`${ASSEMBLYAI_BASE_URL}/transcript/${id}`, {
    headers: { Authorization: apiKey() },
  });
  if (!res.ok) throw new Error(`AssemblyAI fetch transcript failed: ${res.status}`);
  const data = (await res.json()) as { status: string; text: string | null; error: string | null };
  return { status: data.status as AssemblyAiTranscriptResult["status"], text: data.text, error: data.error };
}
