import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import { mkdir, writeFile } from "node:fs/promises";
import { GemmaClient, assertGemma } from "../packages/llm/src/index.js";
import { runEval, evalStore } from "../eval/run.js";
import { Voice } from "../apps/server/src/voice.js";
import { costModel } from "./cost-model.js";
export async function liveVerify() {
  await mkdir("artifacts", { recursive: true });
  const status: any = {
    at: new Date().toISOString(),
    mode: "live-requested",
    status: "running",
    steps: [],
    missing: [],
  };
  const save = () =>
    writeFile("artifacts/live-verify.json", JSON.stringify(status, null, 2));
  await save();
  if (
    !process.env.LLM_API_KEY &&
    !process.env.DO_INFERENCE_KEY &&
    !process.env.LLM_BASE_URL
  ) {
    status.status = "blocked";
    status.missing = ["LLM_API_KEY"];
    status.reason = "Valid Gemma access needed. No live results produced.";
    await save();
    return status;
  }
  try {
    const discovery = new GemmaClient();
    const ids = await discovery.discover();
    status.steps.push({
      step: "model-discovery",
      status: "passed",
      gemmaModels: ids,
    });
    await save();
    const sorted = [...ids].sort(
      (a, b) =>
        Number(b.match(/(\d+)b/i)?.[1] || 0) -
        Number(a.match(/(\d+)b/i)?.[1] || 0),
    );
    const candidates = [...new Set([sorted[0], sorted.at(-1)!])],
      measurements: any[] = [];
    for (const id of candidates) {
      assertGemma(id);
      const client = new GemmaClient(undefined, id);
      const sample = await client.complete(
        "Reply in one short sentence: disclose that you are an automated assistant.",
      );
      measurements.push({
        model: id,
        ttftMs: sample.ttftMs,
        totalMs: sample.totalMs,
        tokensIn: sample.tokensIn,
        tokensOut: sample.tokensOut,
        response: sample.text,
      });
    }
    const maxMs = Number(process.env.LLM_MAX_TTFT_MS || 4000);
    const size = (id: string) => Number(id.match(/(\d+)b/i)?.[1] || 0);
    const acceptable = measurements
      .filter((m) => m.ttftMs <= maxMs)
      .sort((a, b) => size(b.model) - size(a.model));
    const chosen =
      acceptable[0] || [...measurements].sort((a, b) => a.ttftMs - b.ttftMs)[0];
    process.env.LLM_MODEL = chosen.model;
    await writeFile(
      "artifacts/model-selection.json",
      JSON.stringify(
        {
          mode: "live",
          provider: discovery.base,
          chosen: chosen.model,
          maxTtftMs: maxMs,
          acceptable: !!acceptable.length,
          measurements,
          systemRole: "instructions folded into first user message",
        },
        null,
        2,
      ),
    );
    const client = new GemmaClient(undefined, chosen.model);
    const smoke = await runEval({
      smoke: true,
      llm: client,
      model: chosen.model,
      resume: true,
    });
    status.steps.push({
      step: "text-smoke",
      artifact: smoke.path,
      passed: smoke.passed,
      total: smoke.total,
    });
    await save();
    if (process.env.ELEVENLABS_API_KEY) {
      const store = await evalStore();
      try {
        const voice = new Voice(store);
        const catalog = await voice.discover();
        const start = performance.now();
        const chunks: Uint8Array[] = [];
        let first = 0;
        for await (const chunk of voice.speak(
          "This is an automated assistant. I can help book a fictional haircut.",
        )) {
          if (!first) first = performance.now() - start;
          chunks.push(chunk);
        }
        const audio = Buffer.concat(chunks);
        const stt = await voice.transcribe(
          new Blob([audio], { type: "audio/mpeg" }),
          0,
        );
        await mkdir("artifacts/latency", { recursive: true });
        await writeFile(
          "artifacts/latency/live-voice.json",
          JSON.stringify(
            {
              mode: "live",
              catalog,
              ttsFirstAudioMs: first,
              roundTripMs: performance.now() - start,
              sttMs: stt.ms,
              transcript: stt.text,
              audioStored: false,
              sampleCalls: 1,
              transcribedSeconds: "duration not measured",
            },
            null,
            2,
          ),
        );
        status.steps.push({ step: "voice", status: "passed" });
      } catch {
        status.steps.push({
          step: "voice",
          status: "unreachable",
          reason: "Check ElevenLabs key, models and quota",
        });
      } finally {
        await store.close();
      }
    } else status.missing.push("ELEVENLABS_API_KEY");
    const report = await runEval({
      llm: client,
      model: chosen.model,
      resume: true,
    });
    status.steps.push({
      step: "full-eval",
      artifact: report.path,
      completed: report.completed,
      total: report.total,
      passed: report.passed,
    });
    await costModel(report);
    await save();
    const comparisons: any[] = [report];
    for (const variant of [{ retrieval: false }, { repair: false }]) {
      const r = await runEval({
        llm: client,
        model: chosen.model,
        resume: true,
        ...variant,
      });
      comparisons.push(r);
      status.steps.push({
        step: "ablation",
        artifact: r.path,
        completed: r.completed,
      });
      await save();
    }
    const alternate =
      process.env.LLM_MODEL_ALT ||
      measurements.find((m) => m.model !== chosen.model)?.model;
    if (alternate) {
      assertGemma(alternate);
      const r = await runEval({
        llm: new GemmaClient(undefined, alternate),
        model: alternate,
        resume: true,
      });
      comparisons.push(r);
      status.steps.push({ step: "alternate", artifact: r.path });
    }
    status.status =
      report.completed === report.total ? "completed" : "checkpointed";
    const table = comparisons
      .map(
        (r) =>
          `| ${r.label} | ${r.passed}/${r.completed} of ${r.total} | ${JSON.stringify(r.wilson95)} | ${r.path} |`,
      )
      .join("\n");
    const failures = comparisons.flatMap((r) =>
      r.scenarios
        .filter((s: any) => !s.passed)
        .slice(0, 3)
        .map((s: any) => ({
          run: r.label,
          id: s.id,
          checks: s.checks,
          example: s.failureExample,
        })),
    );
    await writeFile(
      "docs/EVAL.md",
      `# Evaluation\n\nLive verification ran at ${status.at}. Model: ${chosen.model}; provider: ${discovery.base}. Every completed scenario uses the real Gemma transport; no silent mock substitution occurs in live evaluation.\n\n| Run | Passed / executed / planned | Wilson 95% | Artifact |\n|---|---|---|---|\n${table}\n\nIntervals describe correlated synthetic scenario templates, not independent real-world samples. Scenario JSON contains named booking, slot, information, escalation and injection metrics and per-stage latency percentiles.\n\n## Failures and incomplete work\n\n${JSON.stringify(failures, null, 2)}\n\nBlocked runs retain completed checkpoints; missing scenarios are unrun, not successes. Overall status: ${status.status}.\n\n## Voice and model selection\n\nModel selection: artifacts/model-selection.json. Candidates compare observed TTFT among measured Gemma sizes; the largest acceptable measured candidate is selected. Voice: ${status.missing.includes("ELEVENLABS_API_KEY") ? "not measured (key missing)" : "see the actual voice step status in artifacts/live-verify.json and artifacts/latency/live-voice.json if it succeeded"}. A TTS/STT provider loop alone does not prove an end-to-end spoken booking.\n\n## Cost and durability\n\nCost: artifacts/cost/cost-model.json. No cost number is produced without reported live token usage. Closed-API prices are hypothetical assumptions. Voice costs are identical under either model and may dominate. Real local worker-kill evidence remains in artifacts/chaos/ and time-skipping tests in artifacts/temporal/tests.json. This proves local worker recovery with one outbox confirmation, not exactly-once webhook delivery or Render ephemeral-disk persistence.\n\nEvaluation uses isolated local SQLite, not Atlas Vector Search. Grounding checks cover sourced prices and selected facts, not every semantic claim. Hindi/Hinglish coverage is a limited subset. Hosted inference sends text to its provider. No first-user result is claimed.\n`,
    );
  } catch {
    status.status = "blocked";
    status.reason =
      "Provider request failed; inspect doctor and saved checkpoints. Secrets and provider error bodies suppressed.";
  }
  await save();
  console.log(
    JSON.stringify({
      status: status.status,
      report: "artifacts/live-verify.json",
      missing: status.missing,
    }),
  );
  return status;
}
if (process.argv[1]?.endsWith("live-verify.ts")) await liveVerify();
