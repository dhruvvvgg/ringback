import { test, expect } from "vitest";
import { BusinessConfig, demos } from "../packages/core/src/config.js";
import { assertGemma, structured, MockLLM } from "../packages/llm/src/index.js";
import { z } from "zod";
test("demo configs validate", () => {
  expect(demos.map((x) => BusinessConfig.parse(x))).toHaveLength(3);
});
test("proprietary models refused", () => {
  expect(() => assertGemma("gemini-2.5-pro")).toThrow();
  expect(() => assertGemma("gemma-3-4b-it")).not.toThrow();
});
test("repairs malformed output and safe fallback", async () => {
  const s = z.object({ ok: z.boolean() });
  expect(
    (
      await structured(
        new MockLLM(["bad", '```json\n{"ok":true}\n```']),
        "",
        s,
        { ok: false },
      )
    ).value.ok,
  ).toBe(true);
  expect(
    (await structured(new MockLLM(["bad", "bad"]), "", s, { ok: false }))
      .fallback,
  ).toBe(true);
});

test("repair prompt includes validation detail and never calls a proprietary model", async () => {
  const prompts: string[] = [];
  const model = new MockLLM(['{"ok":"wrong"}', '{"ok":true}']);
  const client = {
    complete: async (p: string) => {
      prompts.push(p);
      return model.complete(p);
    },
  };
  const result = await structured(
    client,
    "test",
    z.object({ ok: z.boolean() }),
    { ok: false },
  );
  expect(result.value.ok).toBe(true);
  expect(prompts[1]).toContain("Validation error: ok:");
});
