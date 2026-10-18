import { test, expect, vi, afterEach } from "vitest";
import { GemmaClient, RateQueue } from "../packages/llm/src/index.js";
afterEach(() => vi.unstubAllGlobals());
test("catalog filters proprietary models; streaming preserves tokens and usage", async () => {
  const requests: string[] = [];
  vi.stubGlobal("fetch", async (url: string) => {
    requests.push(url);
    if (url.endsWith("/models"))
      return Response.json({
        data: [{ id: "gemini-pro" }, { id: "gemma-test" }],
      });
    const bytes = new TextEncoder().encode(
      'data: {"choices":[{"delta":{"content":"hello"}}]}\n\ndata: {"choices":[],"usage":{"prompt_tokens":9,"completion_tokens":2}}\n\ndata: [DONE]\n',
    );
    return new Response(
      new ReadableStream({
        start(c) {
          c.enqueue(bytes.slice(0, 23));
          c.enqueue(bytes.slice(23));
          c.close();
        },
      }),
    );
  });
  const client = new GemmaClient(
    "synthetic",
    "",
    "https://provider.invalid/v1",
  );
  expect(await client.discover()).toEqual(["gemma-test"]);
  const tokens: string[] = [];
  const result = await client.complete("greet", (s) => tokens.push(s));
  expect(tokens).toEqual(["hello"]);
  expect(result.tokensIn).toBe(9);
  expect(result.tokensOut).toBe(2);
  expect(requests).toHaveLength(2);
});
test("rate queue serializes concurrent work and rejects oversized budget", async () => {
  const q = new RateQueue(100, 1000);
  let active = 0,
    max = 0;
  await Promise.all(
    Array.from({ length: 6 }, () =>
      q.run(1, async () => {
        active++;
        max = Math.max(max, active);
        await new Promise((r) => setTimeout(r, 1));
        active--;
      }),
    ),
  );
  expect(max).toBe(1);
  await expect(q.run(1001, async () => true)).rejects.toThrow("budget");
});
test("retry honors transient failures and does not emit provider error body", async () => {
  let n = 0;
  vi.stubGlobal("fetch", async () =>
    ++n === 1
      ? new Response("PRIVATE_PROVIDER_ERROR", {
          status: 429,
          headers: { "Retry-After": "0" },
        })
      : new Response(
          'data: {"choices":[{"delta":{"content":"ok"}}]}\n\ndata: [DONE]\n',
        ),
  );
  const c = new GemmaClient(
    "synthetic",
    "gemma-test",
    "https://provider.invalid",
  );
  expect((await c.complete("test")).text).toBe("ok");
  expect(n).toBe(2);
});
