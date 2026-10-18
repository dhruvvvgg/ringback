# Ringback implementation and verification report

This report covers the work performed in this repository: environment setup, implementation, troubleshooting, verification, documentation, and the work that still requires external services or owner action. It summarizes the completed implementation and evidence committed through `8dcc189`; the final audited source revision was `dd8f19728b0843bf7fadba73f7924cdedc847fd7`. This report is a later documentation addition.

The result is a locally verified browser receptionist demo with booking, business onboarding, an owner dashboard, and Temporal workflows. It currently uses **MockLLM, text/browser-speech fallbacks, and SQLite**. Real MongoDB integration and Temporal recovery were tested separately. **No external deployment, real Gemma call, or real ElevenLabs spoken booking was completed.**

## 1. Starting point and working process

- Inspected the selected `dhruvvvgg/ringback` checkout, environment, installed tools, and available service integrations. The remote was initially empty.
- Preserved the supplied brief in [HANDOFF.md](HANDOFF.md) and committed it before implementation. The attachment supplied project requirements; the user's messages supplied authorization and working instructions.
- Used the cloud-environment-onboarding setup workflow to investigate dependencies, prepare repeatable setup/start instructions, and save a reusable cloud configuration draft.
- Created [PROGRESS.md](PROGRESS.md) for phase and acceptance tracking, [docs/DECISIONS.md](docs/DECISIONS.md) for implementation choices, and [docs/BUILD_LOG.md](docs/BUILD_LOG.md) for the development and debugging record.
- Committed working increments throughout. Credentials were kept outside tracked files and were not printed in reports.
- Used documented fallbacks when credentials, downloads, or management integrations were unavailable. Recorded external acceptance gaps instead of presenting fallback results as live-service results.

## 2. Work by phase

| Phase | Delivered |
|---|---|
| 0 — Bootstrap | npm workspaces, strict TypeScript, development scripts, environment example, lint/test/build tooling, seed data, and repository documentation. |
| 1 — Core domain | Validated business configuration, availability calculation, resource and buffer rules, booking locks, idempotency, cancellation, and reserve-first rescheduling. |
| 2 — LLM layer | Gemma-only compatible client, model discovery, streaming, bounded request/token usage, retries, JSON validation and repair, and labeled MockLLM. |
| 3 — Agent and retrieval | Mastra agent/typed turn workflow, grounded answers, explicit booking confirmation, caller memory, escalation, messages, and sourced retrieval with fallback. |
| 4 — Voice | ElevenLabs STT/TTS adapters and discovery, streaming sentence playback, browser recording/endpointing controls, and text/browser-speech fallbacks. Live-provider acceptance remains unverified. |
| 5 — Temporal | Booking and lead workflows, retry/compensation, reminders, signals, reconciliation, time-skipping tests, and real worker-kill recovery. |
| 6 — Web UI | Landing page, caller console, protected owner dashboard, business onboarding/editor, feedback, synthetic-day action, responsive themes, and accessibility fixes. |
| 7 — Observability | Stage timing and evidence views, privacy-constrained Sentry integration, outbox previews, diagnostics, and protected verification/export endpoints. |
| 8 — Evaluation | 96 objective scenarios, smoke/full modes, category metrics, confidence intervals, ablations, checkpoints, cost assumptions, and explicit mock/live labels. |
| 9 — Deployment | Docker image, free Render blueprint, supervised API/worker/Temporal process, production memory reductions, capped local smoke, and fresh-clone instructions. No Render deployment occurred. |
| 10 — Documentation/assets | Operational guides, demo script, first-user kit, submission draft, screenshots, silent mock browser recording, and self-hosting notes. |
| 11 — Audit | Full verification, browser tests, regression evaluations, Mongo concurrency, Temporal chaos, privacy/secret checks, fresh-clone audit, consolidated evidence, and final committed STATUS. |

The checked phases in PROGRESS include documented fallback completion. They do not mean the external live criteria were met; those are listed explicitly below and in [STATUS.md](STATUS.md).

## 3. Repository and architecture

| Location | Responsibility |
|---|---|
| [apps/server/src](apps/server/src) | Hono API, Mastra conversation flow, LLM integration, retrieval, voice, telemetry, notifications, and Temporal client integration. |
| [apps/worker/src](apps/worker/src) | Temporal workflows, activities, and worker startup. |
| [apps/web/src](apps/web/src) | React caller, owner, and onboarding interfaces and styling. |
| [packages/core/src](packages/core/src) | Business schema, booking rules, Mongo storage, and explicit SQLite fallback. |
| [packages/llm/src](packages/llm/src) | Guarded Gemma transport, retries/rate limits, structured output handling, and MockLLM. |
| [eval](eval) | Scenario generation, evaluation execution, assertions, and reports. |
| [scripts](scripts) | Setup, supervision, diagnostics, builds, audits, chaos tests, live verification, and reporting. |
| [tests](tests) | Domain, integration, workflow, security, and browser checks. |
| [artifacts](artifacts) | Committed machine-readable verification evidence and explicit blocked/unmeasured outcomes. |

The development environment used Node 24. The package engine requirement is Node 22.13 or newer. The stack includes React/Vite, Hono, Zod, Mastra, the official MongoDB driver, Temporal, Sentry, Vitest, Playwright, and axe.

### Business domain and storage

- Created three fictional businesses: Copper & Cloud Plumbing, Juniper Moon Salon, and Little Orbit Maths.
- Defined validated services, prices, durations, opening hours, languages, holidays, buffers, resources, FAQs, policies, tone, and emergency/escalation configuration.
- Implemented availability in the business timezone, including daylight-saving transitions, holiday closures, service duration, buffers, and resource occupancy.
- Used unique per-minute resource locks to arbitrate concurrent bookings. Added idempotent request replay, cancellation, and rescheduling that reserves the replacement before releasing the original slot.
- Retained official MongoDB storage and indexes. Implemented a clearly labeled SQLite JSON-record fallback with actual unique indexes for credential-free local use.
- Tested MongoDB against an actual local MongoDB process; did not equate this with an Atlas deployment.

### Agent, model, and retrieval

- Built the conversation flow around a real Mastra Agent adapter and typed workflow/tools. Model intent JSON passes validation and business rules before an action executes.
- Added FAQ/price answers, availability offers, explicit booking confirmation, pending-booking updates, caller memory, service history, preferences, notes, message taking, emergency escalation, and call completion.
- Added a Gemma-only model guard that rejects Gemini, compatible endpoint discovery, streamed responses, a serialized queue, request/token limits, bounded retries, backoff and Retry-After handling.
- Added JSON extraction, Zod validation, one repair retry with validation feedback, and a safe fallback.
- Kept runtime provider-failure fallback visibly labeled as MockLLM. Live evaluations use the raw provider client and checkpoint failures rather than silently reporting mock successes.
- Implemented configuration-grounded retrieval, an in-process embedding attempt, and Atlas Vector Search adapters. Since embedding weights could not be downloaded, the demonstrated retrieval mode is keyword-only. Atlas vector queries remain unverified.

### Voice and caller interface

- Added ElevenLabs voice/model discovery, STT requests, sentence-chunked streamed TTS, and character/usage limits.
- Added caller consent and AI disclosure, transcripts, text entry, hold-to-talk controls, endpointing logic, browser speech, and playback cancellation/barge-in code.
- Missing ElevenLabs credentials select fallback behavior. Real microphone/provider playback, endpointing quality, barge-in, and spoken booking still need acceptance testing.
- The product is a browser console. No PSTN/phone-network integration was built.

### Temporal durability and notifications

- Implemented `BookingLifecycleWorkflow` with reserved-row verification, confirmation retries, compensation, reminder timers, confirm/cancel/reschedule signals, no-show handling, and follow-up.
- Implemented `LeadRecoveryWorkflow` with delayed follow-up, cancellation, and source-state rechecks.
- Added stable workflow IDs, duplicate rejection, status queries, and reconciliation of missing nonterminal workflows from source records.
- Added a unique-key notification outbox, dashboard previews, optional owner webhook, and a failure switch for chaos exercises.
- Distinguished a single idempotent outbox record from external webhook delivery, which remains at least once.
- Verified recovery after killing a worker while the Temporal server/history survived. This does not establish persistence after Render loses ephemeral storage.

### Owner workspace and onboarding

- Built an owner-token-protected dashboard with appointments, workflow states, transcripts, timing, messages, outbox previews, caller records, deletion, and dashboard updates through SSE.
- Added after-hours, escalation, booking-value, cost, durability, and evaluation views with measured/unmeasured labels.
- Added free-text onboarding draft extraction and review/edit/save controls for the complete business configuration.
- Added feedback and a synthetic-day action that creates five fictional calls, including a synthetic booking, with explicit mock labeling.
- Added protected live-verification controls, status refresh, and evidence download. The dashboard uses the same implementation as the CLI verification runner.
- Built responsive cream/green styling, serif headings, dark/light themes, keyboard support, accessible controls, and mobile layouts.

### Security and observability

- Added owner/admin bearer authentication, caller-scoped session tokens, CORS controls, rate and request-size limits, and caller deletion.
- Restricted Sentry output to static trace lifecycle and whitelisted numeric telemetry. Tested actual outgoing envelopes and logs using canary data and a fake transport.
- Verified anonymous rejection and authenticated access to administrative verification routes; checked evidence export for owner-token leakage.
- Audited tracked source, history, built client output, environment-file ignores, and known credential values without printing those values.
- Security checks cover specific tested cases; they are not a comprehensive penetration test or a guarantee against every prompt injection.

## 4. Environment setup and saved cloud configuration

- Set up writable npm caching after the default protected home cache failed.
- Installed project dependencies and prepared reproducible setup, build, supervision, seed, readiness, and doctor commands.
- Prepared a local Temporal CLI dev server with checksum verification and file-backed development history.
- Tried MongoMemoryServer/vendor downloads and inspected alternatives. After download restrictions, retained the SQLite fallback and later obtained an actual MongoDB test binary from an official digest-pinned Docker image.
- Consulted current Mastra documentation through its installed MCP documentation server after normal registration/launch routes failed. Also consulted Temporal documentation, Google's compatible API cookbook, and ElevenLabs SDK references.
- Saved tested `install_script` and `start_skill` configuration and necessary domain allowlist additions using the onboarding tools. Evidence: [environment-config.json](artifacts/audit/environment-config.json).

Saving cloud configuration did **not** execute, apply, or publish it. Commands in this workspace were run separately. The owner still needs to review/save and publish the environment draft for reuse. No restored fresh-task environment snapshot was demonstrated.

No service-management integration for Render, DigitalOcean, Atlas, or ElevenLabs was exposed. No paid resource, GPU, disk, domain, or external service was purchased or provisioned. Source was not pushed to the remote.

## 5. Problems diagnosed and fixed

| Issue | Resolution or recorded fallback |
|---|---|
| Protected npm home cache | Configured a writable relative cache. |
| MongoDB vendor download returned 403 | Kept an honest SQLite fallback; later used the official digest-pinned Docker image binary for real Mongo tests. |
| SWC native cache validation rejected sandbox ancestor ownership | Pinned compatible `@swc/core` 1.11.24; did not disable integrity checks. |
| Optional ONNX CUDA dependency download failed | Documented install skip for that optional download while retaining bundled CPU runtime. Model-weight downloads remained blocked, so retrieval stayed keyword-only. |
| Price questions mentioning a haircut were treated as booking requests | Reordered intent matching and reran the scenario set, including the covered Hindi/Hinglish price cases. |
| React effect accidentally returned `scrollIntoView`'s result | Changed the effect to return nothing, avoiding invalid cleanup behavior. |
| Accessibility failures | Fixed contrast, voice-control labels, transcript keyboard focus, and named navigation landmarks. |
| Sentry streaming spans bypassed the intended transaction scrubber | Used a static lifecycle and strict outbound whitelist; verified actual envelopes and logs. |
| Docker dependency install failed proxy TLS trust | Added an optional BuildKit trusted-CA secret mount without disabling TLS verification or retaining the CA in the image. |
| Initial 512 MiB container ran out of memory | Compiled the production runtime, removed npm/tsx wrappers from production processes, prebundled workflows, bounded worker resources, and tuned Go memory. Rebuilt and retested under the cap. |
| Repeated Docker layers exhausted disk | Removed only obsolete task images/build cache and generated outputs, preserved source/evidence, and reran affected checks. |
| Reconciliation could restart completed workflow histories | Added duplicate rejection, terminal-state skipping, and lead source rechecks/cancellation signals. |
| Delimited configuration fields were difficult to type | Deferred normalization to blur so commas/newlines remain editable. |
| Concurrent browser runs conflicted on fixture ports/traces | Reran the browser suite serially and retained the clean passing result. |
| A textarea locator relied on an overly exact accessible label | Used a prefix locator matching the intended field. |
| An address-only response failed to update a pending plumbing booking | Preserved the proposed slot while accepting the address; added a regression check for booking and retained service history. |
| Official Gemma weights required license authentication and returned 401 | Documented self-hosting as designed-to, not demonstrated. No substitute Gemini or paid GPU was used. |

The detailed chronological record is in [BUILD_LOG.md](docs/BUILD_LOG.md); the durable choices are in [DECISIONS.md](docs/DECISIONS.md).

## 6. Verification performed and evidence

These are the results retained from the final implementation audit. Application tests were not rerun solely to add this report.

| Check | Recorded result | Evidence |
|---|---|---|
| `npm run verify` | Strict typecheck, lint, **20 tests passed**, production web/runtime/workflow build passed; zero failed/skipped tests | [Test results](artifacts/tests/results.json) |
| `npm run e2e` | **3 passed**; caller booking, owner views, extended onboarding, saved languages, keyboard, axe, themes, mobile captures | [Browser results](artifacts/e2e/results.json) |
| `npm run eval:smoke` | **12/12 mock** | [Evaluation artifacts](artifacts/eval) |
| `npm run eval:full` | **96/96 mock** | [Baseline](artifacts/eval/mock-MockLLM-baseline.json) |
| No-retrieval and no-repair ablations | Both **96/96 mock**; not evidence of live-model quality or improvement | [No retrieval](artifacts/eval/mock-MockLLM-no-retrieval.json), [no repair](artifacts/eval/mock-MockLLM-no-repair.json) |
| Real Mongo concurrency | MongoDB 7.0.45; **one winner among 40 attempts**, idempotent replay | [Concurrency](artifacts/mongo/concurrency.json) |
| Availability/storage tests | SQLite concurrency, timezone, spring/fall DST boundaries, and holidays covered | [Test results](artifacts/tests/results.json) |
| Temporal time-skipping | Actual test server used; timers, retries, compensation, and lead cancellation covered | [Temporal tests](artifacts/temporal/tests.json) |
| Real worker SIGKILL | Restarted workflow completed with **one confirmation** | [Chaos run](artifacts/chaos/run-1792295915458.json) |
| Separate fresh clone | README install/setup/build/start plus booking/worker smoke passed without copied dependencies or secrets | [Fresh-clone audit](artifacts/audit/fresh-clone.json) |
| Local deployment image | Build and container smoke passed | [Image](artifacts/deploy/image.json), [smoke](artifacts/deploy/smoke.json) |
| Memory-capped container | Passed under **512 MiB**; sampled peak **338.2 MiB** during short synthetic observation | [Memory observation](artifacts/deploy/container-memory.json) |
| Admin verification/export | Anonymous 401, authenticated 202, correct blocked missing-key outcome, token-free evidence export | [Route checks](artifacts/security/admin-route.json) |
| Privacy and secrets | Actual Sentry-envelope/log canary test and source/history/client-bundle audit passed | [Security audit](artifacts/security/audit.json) |
| Consolidated audit | Final evidence ledger retained | [Final audit](artifacts/audit/final.json) |

The release image recorded in the audit is `sha256:ca12cb763b790977109b0f23f4015dc4c7744a71019e96595aac62c2f9eaf2bb`. Its local smoke is not a Render deployment or sustained-load capacity result.

### Explicitly blocked or unmeasured evidence

- [Live verification](artifacts/live-verify.json): blocked by absent LLM credentials; no live success asserted.
- [Model selection](artifacts/model-selection.json): real candidates unmeasured; active demo uses MockLLM.
- [Voice latency](artifacts/latency/status.json): live voice unmeasured. [Mock transport contract](artifacts/latency/mock-contract.json) is not playable/live audio evidence.
- [Local-model smoke](artifacts/eval/local-model-smoke.json): not run successfully; official weight access returned 401.
- [Cost model](artifacts/cost/cost-model.json): live costs remain null; comparison prices are labeled assumptions. Voice costs apply under either LLM and can dominate.
- [Usage](artifacts/usage.json): labeled mock; no invented live token counts.

## 7. Final service availability recorded

The final [doctor report](artifacts/doctor.json) recorded:

| Binding/service | Result |
|---|---|
| `LLM_API_KEY` | Missing; Gemma unverified |
| `ELEVENLABS_API_KEY` | Missing; live voice unverified |
| `MONGODB_URI` | Missing; application used SQLite |
| Temporal | Reachable locally |
| `SENTRY_DSN` | Missing; outbound privacy test used a fake transport |
| `OWNER_WEBHOOK_URL` | Missing; notifications remained outbox previews |
| `DO_INFERENCE_KEY` | Missing; no DigitalOcean inference deployment |
| Owner access | Local token present; no external deployment verification |

This table describes the recorded audit, not a promise that local processes survive workspace resets. It intentionally lists variable names only.

## 8. Documentation and assets delivered

| File/location | Contents |
|---|---|
| [README.md](README.md) | Product overview, setup, architecture, evidence, limits, assistance disclosure, and post-deadline section. |
| [STATUS.md](STATUS.md) | Final audited outcome, owner procedure, passed checks, and unmet live criteria. |
| [PROGRESS.md](PROGRESS.md) | Phase and Definition of Done checklist with fallback notes. |
| [HANDOFF.md](HANDOFF.md) | Preserved project brief. |
| [DECISIONS.md](docs/DECISIONS.md), [BUILD_LOG.md](docs/BUILD_LOG.md) | Decisions and development/troubleshooting history. |
| [KNOWN_ISSUES.md](docs/KNOWN_ISSUES.md) | Remaining constraints and reproductions. |
| [EVAL.md](docs/EVAL.md) | Scenario methodology, measured results, and limits. |
| [DEPLOY.md](docs/DEPLOY.md) | Free Render deployment and configuration instructions. |
| [TEMPORAL.md](docs/TEMPORAL.md) | Workflow design, durability semantics, and demonstrations. |
| [GEMMA_SELF_HOSTED.md](docs/GEMMA_SELF_HOSTED.md) | Proposed self-hosting path and unverified weight-access limit. |
| [DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md) | Demonstration sequence with honest mock/live distinctions. |
| [FIRST_USER_KIT.md](docs/FIRST_USER_KIT.md) | Consent and first-user trial materials; no actual trial claimed. |
| [DOMAIN.md](docs/DOMAIN.md) | Optional domain steps; no domain purchase claimed. |
| [POST_DRAFT.md](docs/POST_DRAFT.md) | Submission draft with required headings/tags, verified categories, and explicit placeholders. |
| [docs/img](docs/img) | Caller-mobile, dashboard, calendar, evidence, onboarding, home, dark-home screenshots, and `demo.webm`. The recording is silent automated mock footage. |
| [LICENSE](LICENSE), [.env.example](.env.example) | MIT license and configuration template without credentials. |
| [Dockerfile](Dockerfile), [render.yaml](render.yaml) | Production packaging and free-tier service blueprint. |
| [CI workflow](.github/workflows/verify.yml) | Install/setup, real Mongo testing, verification, Temporal chaos, browser checks, and full evaluation configuration. No remote CI run is claimed here. |

Operational scripts cover setup/Mongo setup, doctor/seed, process supervision, workflow/runtime bundling, smoke/chaos checks, live verification, evaluation/cost reporting, documentation access, fresh-clone testing, container observation, and security auditing.

## 9. Reproduction and activation

Follow the current [README quickstart](README.md) for prerequisites and environment configuration. The main commands supplied are:

```sh
npm ci
npm run setup
npm run build
npm start
```

Useful verification entry points:

```sh
npm run doctor
npm run verify
npm run e2e
npm run eval:smoke
npm run eval:full
npm run demo:chaos
npm run audit:security
```

Use `npm run setup:mongo` when preparing the real local Mongo integration path; its documented Docker/network prerequisites apply. Some checks create or refresh files in `artifacts/`. The live path is `npm run live:verify` or the protected owner-dashboard control after supplying real runtime credentials. Checkpointing allows resumption after provider quota failures.

To activate an external demo:

1. Review and push the committed repository, then follow DEPLOY.md to deploy the free Render blueprint. No deployed URL currently exists.
2. Supply Gemma-capable `LLM_API_KEY`, optionally `ELEVENLABS_API_KEY`, and a valid `MONGODB_URI` for persistent source records. Keep `ADMIN_TOKEN` private.
3. Open the protected owner dashboard, run live verification, refresh and download the evidence, and review actual completed counts, model selection, voice results, and costs. Save evidence outside ephemeral storage.
4. Perform a consented first-user trial, host/review the demo video, add the real agent-session embed, and finalize the submission draft using verified results. Optional domain work remains optional.

No public posting, real user outreach, deployment, or source push was performed during this work.

## 10. Limits and unfinished external acceptance

- A spoken booking with real Gemma and ElevenLabs is **unmet**.
- Two-model live comparison, live ablations, provider latency, actual token/cost accounting, Atlas vector retrieval, Render smoke, and self-hosted Gemma execution are **unmet**.
- Free Render sleeping and ephemeral storage can discard local SQLite/Temporal history. The worker-kill proof preserves the server; it does not prove recovery from total history loss. Atlas source reconciliation is implemented but not live-Atlas-verified.
- Hosted LLM/voice providers receive the caller text/audio needed for their APIs. No blanket local-processing privacy claim is made.
- There is no real SMS adapter, payment processor, emergency dispatch, phone network, or multi-tenant account/RBAC system. Owner access uses one admin token.
- Hindi/Hinglish evaluation covers a narrow price-question subset. Grounding and injection checks cover selected cases, not all language or security behavior.
- Real-device voice, endpointing, and barge-in still require provider/device testing. Temporal heartbeat recovery was not tested; the local test server emitted a heartbeat-capability warning.
- The first-user trial, public video hosting, actual agent-session embed, optional domain, and final public submission remain owner work.

These limitations were documented rather than hidden behind passing deterministic tests.

## 11. Commit record

| Commit | Work preserved |
|---|---|
| `aaa1329` | Record project brief |
| `b4925bb` | Bootstrap workspaces and implement validated booking domain |
| `299b9cf` | Add grounded call workflow, voice adapters, durable lifecycle and web workspace |
| `95bddcd` | Verify browser flows, privacy scrubbing and real MongoDB concurrency |
| `1c79178` | Prepare capped production container and reproducible evidence workflows |
| `92a2165` | Document verified behavior and preserve final audit assets |
| `96bd93d` | Complete owner configuration controls and dashboard acceptance gaps |
| `dd8f197` | Preserve proposed booking when caller supplies a missing address |
| `8dcc189` | Record final verification evidence and project status |

This report was added afterward as requested. It does not change the implementation or the historical final-audit results. Its relative file links were checked against the repository; application tests were not rerun for this documentation-only addition.

## 12. Publication and later connector follow-up

After this report was created, pushed all implementation/report commits and opened [PR #1](https://github.com/dhruvvvgg/ringback/pull/1). Because the remote was empty, published the original brief as `main` and the implementation as `feat/ringback-implementation`. The PR is unmerged.

On 18 October 2026 (IST), the owner requested Atlas provisioning, free Render deployment, real Gemma/ElevenLabs testing, and DigitalOcean inference discovery after reporting newly connected accounts. Enumerated the actual tool registry and local MCP servers: none of the four requested service connector toolsets is exposed here, so harmless connector calls cannot be issued. Checked process and local dotenv binding presence without printing values; no provider, Atlas, Render or DigitalOcean credentials were available. Refreshed the secret/history/client-bundle audit before pushing and committed each requested step's recorded outcome.

Retried in-process embeddings; no vector was returned. Atlas creation/user/access-list/concurrency/vector work and Render deployment/health/booking/workflow smoke are blocked. No cloud resource, database password, new platform token, or real URL was created. Re-ran `npm run live:verify`; it stopped at the missing-key guard with zero live scenarios. Real STT/TTS is unrun and first-audio latency remains null. DigitalOcean does not apply, and its README/post integration references were removed.

Corrected cost attribution so the 96 mock scenarios are `evaluatedScenarios`, with zero `measuredCalls`, no live token sample, unmeasured billing and null live cost fields. Three synthetic-fixture regression tests, typecheck and lint passed. Updated README, STATUS, EVAL, POST_DRAFT, decisions, build log and progress; added per-service evidence under `artifacts/connectors/`. These follow-up checks do not rerun or supersede the original application/browser/Mongo/Temporal/container audit. STATUS now begins with the exact outstanding owner work and links to current access evidence.
