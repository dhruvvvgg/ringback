import { test, expect, vi, afterEach } from "vitest";
import { evalStore } from "../eval/run.js";
import { Voice } from "../apps/server/src/voice.js";
import { mkdir, writeFile } from "node:fs/promises";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
test("mocked voice transport streams sentence chunks, tracks usage and stops at budget", async () => {
  vi.stubEnv("ELEVENLABS_API_KEY", "synthetic-test-only");
  vi.stubEnv("ELEVENLABS_CHAR_BUDGET", "20");
  let synth = 0;
  vi.stubGlobal("fetch", async (url: string) => {
    if (url.endsWith("/models"))
      return Response.json([
        { model_id: "test-tts", can_do_text_to_speech: true },
        { model_id: "test-stt", can_do_speech_to_text: true },
      ]);
    if (url.endsWith("/voices"))
      return Response.json({
        voices: [{ voice_id: "test-library", category: "premade" }],
      });
    if (url.endsWith("/speech-to-text"))
      return Response.json({ text: "Hello" });
    synth++;
    return new Response(new Uint8Array([1, 2, 3]));
  });
  const store = await evalStore();
  try {
    const voice = new Voice(store);
    let bytes = 0;
    for await (const b of voice.speak("Hello. Welcome.")) bytes += b.length;
    expect(synth).toBe(2);
    expect(bytes).toBe(6);
    const stt = await voice.transcribe(new Blob([new Uint8Array([0])]), 1);
    expect(stt.text).toBe("Hello");
    await expect(async () => {
      for await (const _ of voice.speak("This exceeds the remaining budget.")) {
        void _;
      }
    }).rejects.toThrow("budget");
    const usage = await store.db.collection("usage").findOne({ kind: "voice" });
    expect(usage?.characters).toBe(15);
    expect(usage?.seconds).toBe(1);
    await mkdir("artifacts/latency", { recursive: true });
    await writeFile(
      "artifacts/latency/mock-contract.json",
      JSON.stringify(
        {
          mode: "mock",
          transport: "stubbed provider, not playable or live audio",
          sentenceRequests: synth,
          bytes,
          characters: usage?.characters,
          budgetEnforced: true,
          liveLatencyMs: null,
        },
        null,
        2,
      ),
    );
  } finally {
    await store.close();
  }
});
