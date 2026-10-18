# Known issues and final repro notes

## Live model and voice evidence — external prerequisite

Repro: `npm run doctor`; `npm run live:verify` without provider bindings. `LLM_API_KEY` and `ELEVENLABS_API_KEY` are absent, as expected from the keys-later brief. No live text, voice, model-selection or latency result is claimed. The protected dashboard live-verification action and CLI exist for after the owner supplies keys. A real spoken booking remains unmet. Mock baseline/ablations and voice transport tests exercise application behavior only.

## Partner provisioning and Render URL — unavailable connections

Repro: `codex mcp list` and tool discovery in the session. No Render, DigitalOcean, Atlas-management or ElevenLabs MCP server was exposed. Therefore no Atlas cluster/database user, DO inference key or Render service was created. Checked tool catalog, Codex MCP registration and existing environment binding names; no relevant raw credentials were found or requested. Use `render.yaml` and DEPLOY.md. There is no verified deployed URL. Prize categories are limited accordingly.

## Embedding model / Atlas Vector Search — degraded retrieval

Repro: `npm run seed` with the default embedding attempt. In-process Transformers.js cannot fetch model weights here. Native fetch failed DNS; curl retrieved the pinned config/tokenizers but could not retrieve the ONNX weight object; no DO inference connection exists for the next ladder rung. Keyword mode is labeled in the UI. Atlas vector index/query code is present but unverified. Local official MongoDB indexes and concurrency are tested; that is not Atlas Vector Search evidence. A future model/dimension change must re-index before vector queries are trusted.

## Self-hosted Gemma proof — authenticated weights unavailable

The official Google Gemma weight request returned HTTP 401 without accepted-license authentication. No model was downloaded, no paid hardware was provisioned, and no alternate proprietary model was substituted. `artifacts/eval/local-model-smoke.json` records this. README uses “designed to”, not “demonstrated”. See GEMMA_SELF_HOSTED.md.

## Temporal and deployment limits

The local worker-kill experiment is real. It proves worker recovery while Temporal's file-backed server survives, with one confirmation outbox entry. Render Free can sleep and lose ephemeral files. Without Atlas, SQLite appointments can also disappear. External webhook delivery is at least once and requires receiver deduplication. The local Temporal dev server is not a production cluster. Time-skipping tests emit an SDK/test-server heartbeat-capability warning; heartbeat recovery is not claimed.

## Product limits to retain in the submission

- Browser microphone console only; no phone-network number, payment collection, real SMS/email adapter, or emergency dispatch.
- Hindi/Hinglish evaluation covers a narrow price-question subset, not unrestricted multilingual fluency.
- Grounding checks detect unlisted prices and selected unsupported facts, not all semantic hallucinations.
- Owner authorization is one shared admin token; this is not a multi-tenant account/RBAC platform.
- Voice endpointing and barge-in code have browser/contract coverage only; real-device/provider voice acceptance remains pending keys.
- Onboarding's form exposes the main business fields. Full advanced config (all FAQ/emergency/resource fields) is accepted through the protected configuration API; the form is not a complete editor for every schema field.
- No first-user trial, domain claim, public video hosting or final DEV publication was performed. The post marks those placeholders explicitly.

## Resolved during this run

The npm cache location, Mastra stdio invocation, native SWC compatibility, price-question routing, React effect cleanup, accessible contrast/labels/landmarks, Sentry envelope PII, proxy CA trust, container memory overhead and disk exhaustion were diagnosed and fixed. Repros and verification are in BUILD_LOG.md. They are not left as setup blockers.
