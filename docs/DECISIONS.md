# Decisions

- 2026-10-17: Use the existing empty ringback checkout as the new project; preserves the selected remote.
- 2026-10-17: Node 24 available; require Node 22.13+ for current Mastra dependencies.
- 2026-10-17: Partner MCP servers are not exposed in this session; use documented credential-free fallbacks and deploy-ready files. No paid resources.
- 2026-10-17: MongoDB binary host is blocked (403). Three alternatives checked: memory-server download, direct vendor download, installed binaries. Use SQLite JSON records with actual unique indexes as an additional explicit offline fallback; retain official MongoDB driver, Atlas indexes and optional LOCAL_DB=mongo-memory path. This is not claimed as Atlas or in-memory MongoDB verification.
- 2026-10-17: Single FIFO LLM queue has concurrency one (a conservative cap), rolling request/token budget, bounded retries and Gemma-only validation. System instructions are folded into the user prompt for Gemma compatibility.
- 2026-10-18: Use a digest-pinned official MongoDB Docker image to obtain the local test binary after vendor downloads failed. Real MongoDB concurrency testing supplements the offline SQLite fallback; Atlas remains unprovisioned.
- 2026-10-18: Prebundle Temporal workflows during build to reduce production worker startup memory. All Temporal packages remain on the same locked SDK version.
- 2026-10-18: Keep Sentry on static trace lifecycle so the tested transaction whitelist applies. Capture outbound envelopes in tests; no real DSN is needed for this test.
