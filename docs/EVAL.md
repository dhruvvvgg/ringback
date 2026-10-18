# Evaluation

No live model or voice benchmark exists yet. The current receptionist uses **MockLLM**. These results test deterministic application behavior, not Gemma quality, natural conversation or voice latency.

## Measured application tests (mock model)

Source: [baseline](../artifacts/eval/mock-MockLLM-baseline.json), recorded 2026-10-18T03:54:45.731Z. 96/96 scenarios executed, 96 passed. Overall Wilson 95% interval: 96.15%–100.00%. Template variants are correlated; this interval is descriptive and is not evidence of real-world model accuracy.

| Category | Passed/executed | Wilson 95% |
|---|---:|---:|
| simple-booking | 8/8 | 67.6%–100.0% |
| constraints | 8/8 | 67.6%–100.0% |
| fully-booked | 8/8 | 67.6%–100.0% |
| faq | 8/8 | 67.6%–100.0% |
| out-of-scope | 8/8 | 67.6%–100.0% |
| emergency | 8/8 | 67.6%–100.0% |
| cancel | 8/8 | 67.6%–100.0% |
| reschedule | 8/8 | 67.6%–100.0% |
| returning-memory | 8/8 | 67.6%–100.0% |
| adversarial | 8/8 | 67.6%–100.0% |
| asr-noise | 8/8 | 67.6%–100.0% |
| hinglish | 8/8 | 67.6%–100.0% |

End-state assertions inspect appointments, cancellation counts, slot hours, urgent records and returning-caller greetings. Grounding checks detect unlisted prices and selected unsupported factual claims; they are **not a complete semantic grounding proof**. Injection coverage is finite and intentionally adversarial, not a security guarantee. Hindi/Hinglish cases cover price questions only.

Mock per-turn p50/p95: 6.07/12.21 ms; these are local orchestration timings and **must not be used as voice-performance claims**. 0 repairs and 0 structured fallbacks in this run. Unit tests separately force malformed outputs and provider failures.

## Ablations and live runs

The no-retrieval and no-repair runs are also mock when keys are absent. Their results are saved separately; they cannot establish model improvements. Run `npm run live:verify` after configuring Gemma access for real model selection, baseline, ablations and optional alternate Gemma. The runner checkpoints each completed scenario and reports blocked/incomplete runs. See [deployment](DEPLOY.md).

## Durability

[run-1792295243380.json](../artifacts/chaos/run-1792295243380.json): a real local Temporal workflow survived SIGKILL of its worker and completed after restart. Confirmation outbox count: **1**. History events: 52. This proves local worker recovery and outbox idempotency, not exactly-once external webhook delivery or persistence through Render's ephemeral-disk loss. Time-skipping tests cover retries, compensation, timers and lead cancellation ([artifact](../artifacts/temporal/tests.json)).

## Concurrency

[MongoDB concurrency](../artifacts/mongo/concurrency.json): an official MongoDB process, started by MongoMemoryServer, accepted one reservation among concurrent attempts. SQLite fallback has a separate concurrency test. Atlas Vector Search has not been verified.

## Costs

| Component | Per 1,000 calls | Basis |
|---|---|---|
| Hosted open-model LLM | Not measured | No live token sample |
| Hypothetical closed API | Not measured | Assumed input/output rates in eval/prices.json; no live token sample |
| ElevenLabs voice | Not measured | Owner's actual plan rates needed |

[Cost artifact](../artifacts/cost/cost-model.json). Voice cost is identical under either LLM and may dominate. Open-model savings apply only to the LLM portion. Google free-tier eligibility is an explicit assumption, not a guaranteed permanent price.

## Limits and reproducibility

The scenario set is generated from templates plus safety cases. Mock full-pass results establish regression behavior only. Live voice is unmeasured ([status](../artifacts/latency/status.json)); self-hosted Gemma remains unproven ([attempt](../artifacts/eval/local-model-smoke.json)). No first-user outcome is claimed. Run `npm run eval:smoke`, `npm run eval:full`, `npm run demo:chaos` and `npm run live:verify` to refresh the corresponding evidence.
