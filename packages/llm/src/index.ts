import { z } from "zod";
export const DEFAULT_BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta/openai";
export function assertGemma(model: string) {
  if (!/(^|[\/:_-])gemma([\d:_/.-]|$)/i.test(model) || /gemini/i.test(model))
    throw new Error(
      "LLM_MODEL must identify a Gemma open-weight model; Gemini is prohibited",
    );
}
export type Completion = {
  text: string;
  mode: "mock" | "live";
  model: string;
  tokensIn: number;
  tokensOut: number;
  ttftMs: number;
  totalMs: number;
};
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
export class RateQueue {
  private tail = Promise.resolve();
  private requests: { at: number; tokens: number }[] = [];
  constructor(
    private rpm = Number(process.env.LLM_RPM || 10),
    private tpm = Number(process.env.LLM_TPM || 15000),
  ) {}
  async run<T>(tokens: number, fn: () => Promise<T>): Promise<T> {
    const prior = this.tail;
    let release!: () => void;
    this.tail = new Promise((r) => (release = r));
    await prior;
    try {
      if (tokens > this.tpm) throw new Error("Request exceeds LLM_TPM budget");
      for (;;) {
        this.requests = this.requests.filter((x) => Date.now() - x.at < 60000);
        if (
          this.requests.length < this.rpm &&
          this.requests.reduce((s, x) => s + x.tokens, 0) + tokens <= this.tpm
        )
          break;
        await pause(Math.max(10, 60000 - (Date.now() - this.requests[0].at)));
      }
      this.requests.push({ at: Date.now(), tokens });
      return await fn();
    } finally {
      release();
    }
  }
}
const globalQueue = new RateQueue();
export class GemmaClient {
  public model: string;
  public base: string;
  constructor(
    private key = process.env.LLM_API_KEY || process.env.DO_INFERENCE_KEY || "",
    model = process.env.LLM_MODEL || "",
    base = process.env.LLM_BASE_URL || DEFAULT_BASE_URL,
  ) {
    this.model = model;
    this.base = base.replace(/\/$/, "");
    if (model) assertGemma(model);
  }
  async discover() {
    const r = await fetch(`${this.base}/models`, {
      headers: { Authorization: `Bearer ${this.key}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) throw new Error(`Model discovery failed (${r.status})`);
    const body = (await r.json()) as {
      data?: { id: string }[];
      models?: { name: string }[];
    };
    const ids = (
      body.data?.map((x) => x.id) ||
      body.models?.map((x) => x.name.replace(/^models\//, "")) ||
      []
    ).filter((x) => {
      try {
        assertGemma(x);
        return true;
      } catch {
        return false;
      }
    });
    if (!ids.length) throw new Error("Valid Gemma access needed");
    if (!this.model) this.model = ids[0];
    if (!ids.includes(this.model))
      throw new Error("Configured Gemma model not in provider catalog");
    return ids;
  }
  async complete(
    prompt: string,
    onToken?: (s: string) => void,
  ): Promise<Completion> {
    if (!this.model) await this.discover();
    assertGemma(this.model);
    return globalQueue.run(Math.ceil(prompt.length / 3) + 768, async () => {
      const start = performance.now();
      let response: Response | undefined;
      for (let attempt = 0; attempt < 4; attempt++) {
        response = await fetch(`${this.base}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: this.model,
            messages: [{ role: "user", content: prompt }],
            temperature: 0,
            max_tokens: 768,
            stream: true,
            stream_options: { include_usage: true },
          }),
          signal: AbortSignal.timeout(60000),
        });
        if (response.ok) break;
        if (response.status !== 429 && response.status < 500)
          throw new Error(`Gemma request failed (${response.status})`);
        const retry = response.headers.get("retry-after");
        const ms = retry
          ? Number(retry) * 1000 || Date.parse(retry) - Date.now()
          : 1000 * 2 ** attempt + Math.random() * 250;
        await response.body?.cancel();
        await pause(Math.min(60000, Math.max(0, ms)));
      }
      if (!response?.ok || !response.body)
        throw new Error("Gemma retry budget exhausted");
      const reader = response.body.getReader(),
        decoder = new TextDecoder();
      let buffer = "",
        text = "",
        ttft = 0,
        tokensIn = 0,
        tokensOut = 0;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, idx).trim();
          buffer = buffer.slice(idx + 1);
          if (!line.startsWith("data:") || line === "data: [DONE]") continue;
          const p = JSON.parse(line.slice(5)) as {
            choices?: { delta?: { content?: string } }[];
            usage?: { prompt_tokens: number; completion_tokens: number };
          };
          const t = p.choices?.[0]?.delta?.content || "";
          if (t) {
            if (!ttft) ttft = performance.now() - start;
            text += t;
            onToken?.(t);
          }
          if (p.usage) {
            tokensIn = p.usage.prompt_tokens;
            tokensOut = p.usage.completion_tokens;
          }
        }
      }
      return {
        text,
        mode: "live",
        model: this.model,
        tokensIn,
        tokensOut,
        ttftMs: ttft,
        totalMs: performance.now() - start,
      };
    });
  }
}
export class MockLLM {
  model = "MockLLM";
  constructor(private responses: string[] = []) {}
  async complete(
    prompt: string,
    onToken?: (s: string) => void,
  ): Promise<Completion> {
    const start = performance.now();
    const text =
      this.responses.shift() || JSON.stringify({ intent: "unknown" });
    onToken?.(text);
    return {
      text,
      mode: "mock",
      model: this.model,
      tokensIn: 0,
      tokensOut: 0,
      ttftMs: performance.now() - start,
      totalMs: performance.now() - start,
    };
  }
}
export interface LLM {
  complete(prompt: string, onToken?: (s: string) => void): Promise<Completion>;
}
export async function structured<T>(
  client: LLM,
  prompt: string,
  schema: z.ZodType<T>,
  fallback: T,
  repair = true,
) {
  let repairs = 0;
  const completions: Completion[] = [];
  for (let attempt = 0; attempt < (repair ? 2 : 1); attempt++) {
    const c = await client.complete(
      prompt +
        "\nReturn only minified JSON. Schema: " +
        JSON.stringify(z.toJSONSchema(schema)),
    );
    completions.push(c);
    try {
      const text = c.text.slice(
        c.text.indexOf("{"),
        c.text.lastIndexOf("}") + 1,
      );
      return {
        value: schema.parse(JSON.parse(text)),
        repairs,
        fallback: false,
        completions,
      };
    } catch {
      if (attempt === 0 && repair) {
        repairs++;
        prompt +=
          "\nPrevious response failed JSON/schema validation. Return a valid object matching the schema. Previous: " +
          c.text.slice(0, 1500);
      }
    }
  }
  return { value: fallback, repairs, fallback: true, completions };
}
export function runtimeClient(): LLM {
  if (process.env.LLM_MODEL) assertGemma(process.env.LLM_MODEL);
  return process.env.LLM_API_KEY ||
    process.env.DO_INFERENCE_KEY ||
    process.env.LLM_BASE_URL?.includes("localhost")
    ? new GemmaClient()
    : new MockLLM();
}
