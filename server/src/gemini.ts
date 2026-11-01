const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

// Calls Gemini and yields pieces of text as they arrive
export async function* streamGemini(
  system: string,
  prompt: string,
  signal?: AbortSignal
): AsyncGenerator<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set in .env");
  const model = process.env.GEMINI_MODEL ?? "gemini-3.6-flash";

  const res = await fetch(`${BASE}/${model}:streamGenerateContent?alt=sse`, {
    method: "POST",
    headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2 },
    }),
    signal,
  });

  if (!res.ok || !res.body) {
    throw new Error(`Gemini API error ${res.status}: ${await res.text()}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE messages are separated by a blank line
    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop() ?? ""; // the last piece may be incomplete, keep it

    for (const event of events) {
      for (const line of event.split(/\r?\n/)) {
        if (!line.startsWith("data:")) continue;
        const json = JSON.parse(line.slice(5).trim());
        const parts = json.candidates?.[0]?.content?.parts ?? [];
        for (const part of parts) {
          if (typeof part.text === "string" && !part.thought) yield part.text;
        }
      }
    }
  }
}