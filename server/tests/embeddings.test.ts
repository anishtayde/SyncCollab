import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { embedText, toVectorLiteral } from "../src/embeddings";

function fakeFetch(values: number[]) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ embedding: { values } }),
  });
}

describe("embedText", () => {
  const originalKey = process.env.GEMINI_API_KEY;

  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-key";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
  });

  it("normalizes the vector to length 1", async () => {
    vi.stubGlobal("fetch", fakeFetch([3, 4]));
    const v = await embedText("hello", "RETRIEVAL_DOCUMENT");
    expect(v[0]).toBeCloseTo(0.6);
    expect(v[1]).toBeCloseTo(0.8);
  });

  it("sends the key in a header, the task type and 768 dimensions", async () => {
    const fetchMock = fakeFetch([1, 0]);
    vi.stubGlobal("fetch", fetchMock);
    await embedText("hello", "RETRIEVAL_QUERY");

    const [url, options] = fetchMock.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(options.headers["x-goog-api-key"]).toBe("test-key");
    expect(String(url)).not.toContain("test-key");
    expect(body.taskType).toBe("RETRIEVAL_QUERY");
    expect(body.outputDimensionality).toBe(768);
  });

  it("cuts very long text to 8000 characters", async () => {
    const fetchMock = fakeFetch([1, 0]);
    vi.stubGlobal("fetch", fetchMock);
    await embedText("a".repeat(9000), "RETRIEVAL_DOCUMENT");
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.content.parts[0].text).toHaveLength(8000);
  });

  it("throws when the API answers with an error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 429, text: async () => "quota" })
    );
    await expect(embedText("hello", "RETRIEVAL_DOCUMENT")).rejects.toThrow("429");
  });

  it("throws a clear error when the key is missing", async () => {
    delete process.env.GEMINI_API_KEY;
    await expect(embedText("hello", "RETRIEVAL_DOCUMENT")).rejects.toThrow("GEMINI_API_KEY");
  });
});

describe("toVectorLiteral", () => {
  it("formats numbers the way pgvector expects", () => {
    expect(toVectorLiteral([0.1, 0.2, 0.3])).toBe("[0.1,0.2,0.3]");
  });
});