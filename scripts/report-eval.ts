import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { costModel } from "./cost-model.js";
const path = "artifacts/eval/mock-MockLLM-baseline.json";
const r = JSON.parse(await readFile(path, "utf8"));
await costModel({ ...r, path });
const lines = Object.entries(r.categories)
  .map(
    ([name, c]: [string, any]) =>
      `| ${name} | ${c.passed}/${c.total} | ${c.wilson95.map((n: number) => (n * 100).toFixed(1) + "%").join("–")} |`,
  )
  .join("\n");
const chaos = (await readdir("artifacts/chaos"))
  .filter((x) => x.endsWith(".json"))
  .sort()
  .at(-1)!;
const c = JSON.parse(await readFile("artifacts/chaos/" + chaos, "utf8"));
await mkdir("artifacts/latency", { recursive: true });
await writeFile(
  "artifacts/latency/status.json",
  JSON.stringify(
    {
      mode: "not-measured",
      reason:
        "LLM_API_KEY and ELEVENLABS_API_KEY absent. Mock adapter contract tests do not establish live speech latency.",
      liveVoiceCalls: 0,
    },
    null,
    2,
  ),
);
await writeFile(
  "artifacts/model-selection.json",
  JSON.stringify(
    {
      mode: "mock",
      actualModel: "MockLLM",
      provider: "local deterministic scripts",
      liveCandidatesMeasured: [],
      reason:
        "No Gemma key. Google endpoint confirmed from official cookbook; catalog requires credentials. DigitalOcean MCP unavailable.",
    },
    null,
    2,
  ),
);
await writeFile(
  "artifacts/eval/local-model-smoke.json",
  JSON.stringify(
    {
      status: "blocked",
      mode: "not-run",
      reason:
        "Official Google Gemma weights require authenticated license access (HTTP 401). No model downloaded or substituted.",
      designedFor:
        "OpenAI-compatible self-hosted Gemma via LLM_BASE_URL and LLM_MODEL",
    },
    null,
    2,
  ),
);
await writeFile(
  "docs/EVAL.md",
  `# Evaluation\n\nNo live model or voice benchmark exists yet. The current receptionist uses **MockLLM**. These results test deterministic application behavior, not Gemma quality, natural conversation or voice latency.\n\n## Measured application tests (mock model)\n\nSource: [baseline](../${path}), recorded ${r.at}. ${r.completed}/${r.total} scenarios executed, ${r.passed} passed. Overall Wilson 95% interval: ${r.wilson95.map((n: number) => (n * 100).toFixed(2) + "%").join("–")}. Template variants are correlated; this interval is descriptive and is not evidence of real-world model accuracy.\n\n| Category | Passed/executed | Wilson 95% |\n|---|---:|---:|\n${lines}\n\nEnd-state assertions inspect appointments, cancellation counts, slot hours, urgent records and returning-caller greetings. Grounding checks detect unlisted prices and selected unsupported factual claims; they are **not a complete semantic grounding proof**. Injection coverage is finite and intentionally adversarial, not a security guarantee. Hindi/Hinglish cases cover price questions only.\n\nMock per-turn p50/p95: ${r.latency.p50Ms.toFixed(2)}/${r.latency.p95Ms.toFixed(2)} ms; these are local orchestration timings and **must not be used as voice-performance claims**. ${r.repairs} repairs and ${r.fallbacks} structured fallbacks in this run. Unit tests separately force malformed outputs and provider failures.\n\n## Ablations and live runs\n\nThe no-retrieval and no-repair runs are also mock when keys are absent. Their results are saved separately; they cannot establish model improvements. Run \`npm run live:verify\` after configuring Gemma access for real model selection, baseline, ablations and optional alternate Gemma. The runner checkpoints each completed scenario and reports blocked/incomplete runs. See [deployment](DEPLOY.md).\n\n## Durability\n\n[${chaos}](../artifacts/chaos/${chaos}): a real local Temporal workflow survived SIGKILL of its worker and completed after restart. Confirmation outbox count: **${c.confirmations}**. History events: ${c.historyEvents}. This proves local worker recovery and outbox idempotency, not exactly-once external webhook delivery or persistence through Render's ephemeral-disk loss. Time-skipping tests cover retries, compensation, timers and lead cancellation ([artifact](../artifacts/temporal/tests.json)).\n\n## Concurrency\n\n[MongoDB concurrency](../artifacts/mongo/concurrency.json): an official MongoDB process, started by MongoMemoryServer, accepted one reservation among concurrent attempts. SQLite fallback has a separate concurrency test. Atlas Vector Search has not been verified.\n\n## Costs\n\n| Component | Per 1,000 calls | Basis |\n|---|---|---|\n| Hosted open-model LLM | Not measured | No live token sample |\n| Hypothetical closed API | Not measured | Assumed input/output rates in eval/prices.json; no live token sample |\n| ElevenLabs voice | Not measured | Owner's actual plan rates needed |\n\n[Cost artifact](../artifacts/cost/cost-model.json). Voice cost is identical under either LLM and may dominate. Open-model savings apply only to the LLM portion. Google free-tier eligibility is an explicit assumption, not a guaranteed permanent price.\n\n## Limits and reproducibility\n\nThe scenario set is generated from templates plus safety cases. Mock full-pass results establish regression behavior only. Live voice is unmeasured ([status](../artifacts/latency/status.json)); self-hosted Gemma remains unproven ([attempt](../artifacts/eval/local-model-smoke.json)). No first-user outcome is claimed. Run \`npm run eval:smoke\`, \`npm run eval:full\`, \`npm run demo:chaos\` and \`npm run live:verify\` to refresh the corresponding evidence.\n`,
);
console.log(
  "Evaluation report generated from measured artifacts; unavailable evidence labeled.",
);
