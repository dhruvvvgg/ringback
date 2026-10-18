# Decisions

- 2026-10-17: Use the existing empty ringback checkout as the new project; preserves the selected remote.
- 2026-10-17: Node 24 available; require Node 22.13+ for current Mastra dependencies.
- 2026-10-17: Partner MCP servers are not exposed in this session; use documented credential-free fallbacks and deploy-ready files. No paid resources.
- 2026-10-17: MongoDB binary host is blocked (403). Three alternatives checked: memory-server download, direct vendor download, installed binaries. Use SQLite JSON records with actual unique indexes as an additional explicit offline fallback; retain official MongoDB driver, Atlas indexes and optional LOCAL_DB=mongo-memory path. This is not claimed as Atlas or in-memory MongoDB verification.
- 2026-10-17: Single FIFO LLM queue has concurrency one (a conservative cap), rolling request/token budget, bounded retries and Gemma-only validation. System instructions are folded into the user prompt for Gemma compatibility.
- 2026-10-18: Use a digest-pinned official MongoDB Docker image to obtain the local test binary after vendor downloads failed. Real MongoDB concurrency testing supplements the offline SQLite fallback; Atlas remains unprovisioned.
- 2026-10-18: Prebundle Temporal workflows during build to reduce production worker startup memory. All Temporal packages remain on the same locked SDK version.
- 2026-10-18: Keep Sentry on static trace lifecycle so the tested transaction whitelist applies. Capture outbound envelopes in tests; no real DSN is needed for this test.
- 2026-10-18: Mastra Agent now wraps the guarded LLM transport, inside the existing typed turn workflow. Intent JSON still passes schema validation and confirmation checks before tools execute; no native tool-call capability is assumed.
- 2026-10-18: Provider-unreachable runtime calls fail over to explicitly marked safe MockLLM responses; live evaluation uses the raw Gemma client and checkpoints failures instead of silently substituting mock results.
- 2026-10-18: Official documentation consulted: Google cookbook `quickstarts/Get_started_OpenAI_Compatibility.ipynb` confirms the compatible base URL and models list; Temporal documentation Git repository supplied current testing/message-passing Markdown; ElevenLabs Python SDK speech_to_text/text_to_speech clients supplied HTTP/model references. ElevenLabs STT fallback `scribe_v2` is sourced from that SDK, not guessed from memory; runtime catalog/override take precedence.
- 2026-10-18: Embedding config/tokenizer files downloaded from pinned Xenova revision 751bff37182d3f1213fa05d7196b954e230abad9, but ONNX weights were unavailable through the network path. Native fetch also failed DNS. No embedding result or vector benchmark is claimed.
- 2026-10-18: Official Google Gemma local-weight request returned HTTP 401 without license authentication. Self-hosting remains designed-to, not demonstrated. No paid GPU or substitute Gemini model was used.
- 2026-10-18: Skip ElevenLabs hosted-agent-platform stretch evaluation because core live voice credentials are absent. The primary architecture remains our own Gemma turn loop.
