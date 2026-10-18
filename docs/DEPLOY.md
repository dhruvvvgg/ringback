# Deploy and enable live providers

## Verified scope

The Dockerfile and local single-container smoke exercise the web app, worker and Temporal dev server together. This is **not a Render deployment**. Render/MongoDB Atlas/DigitalOcean MCP management tools were absent; no external resource was created and no plan was upgraded. The final STATUS records the capped-container result and any remaining limits.

## Render, free tier only

1. Push the reviewed repository to your own GitHub repository (`git push origin HEAD:main` if this selected repository is still empty). In Render, create a Blueprint from that repository and select `render.yaml`. Confirm the web service plan is **Free**. Do not add disks or paid add-ons.
2. The blueprint generates `ADMIN_TOKEN`. Keep it only in Render settings and your private password manager/session. The `sync: false` entries ask for provider values. If no keys exist yet, leave those entries empty/absent; the service starts in mock/degraded mode. Set `ALLOWED_ORIGIN` to the exact HTTPS origin Render assigns. No guessed URL is supplied here.
3. Open `/healthz`; expect explicit `mock`, `degraded-browser-speech`, `sqlite-degraded` and missing names until bindings are supplied. Open the owner workspace using `ADMIN_TOKEN`. Make a fictional text call, confirm a future weekday appointment, and verify its workflow status changes to confirmed. Run `npm run smoke -- https://YOUR-SERVICE.onrender.com` with the token securely in your local environment if you want the automated equivalent.

No persistent disk was provisioned. Both SQLite and the local Temporal database are ephemeral on Render Free. For real appointment persistence, supply a valid `MONGODB_URI`. The owner is responsible for Atlas credentials because no Atlas management connection was exposed here. Use a free M0 cluster, a dedicated database user and narrow network access where possible. If dynamic Render egress requires `0.0.0.0/0`, that broad network access is a deliberate trade-off: use a strong unique password, minimum database roles, TLS, and rotate credentials. This run did **not** create that access rule.

## Keys-later: no application code changes

Add `LLM_API_KEY` (Google AI Studio, Gemma access only) and optionally `ELEVENLABS_API_KEY` to Render. Its environment update restarts the app. Leave `LLM_MODEL` empty for discovery, or select a Gemma ID from the verification report. The client rejects Gemini. The default compatible base URL is Google's documented endpoint. A DO key additionally requires its actual compatible endpoint in `LLM_BASE_URL`.

Open the owner dashboard's **Durability & evidence** tab and run live verification, or send:

```sh
curl --fail -X POST "$RINGBACK_URL/admin/live-verify" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
curl --fail "$RINGBACK_URL/admin/live-verify" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

These commands reference existing environment variables; do not substitute literal secrets in shared terminals or documents. The endpoint uses the same `liveVerify()` as `npm run live:verify`. It lists Gemma models, measures available candidates, runs text smoke, an optional voice round trip, checkpointed full evaluation and ablations, a configured alternate Gemma, and a cost report. It reports unavailable keys and incomplete quota-limited work honestly. Re-running resumes completed scenario checkpoints. Download artifacts before an ephemeral restart.

`LLM_RPM` and `LLM_TPM` default conservatively; concurrency is deliberately one. `EVAL_TOKEN_BUDGET` is a per-evaluation cap, not a promise about provider billing. Use free/per-use access only. `ELEVENLABS_CHAR_BUDGET` bounds synthesized text reservations and defaults to the brief's budget. Failed synth requests may still reserve characters conservatively. The optional `ELEVENLABS_STT_MODEL` overrides catalog selection; the sourced SDK fallback is documented in DECISIONS.

## Local Docker

```sh
docker build -t ringback .
docker run --rm --env-file .env.local -p 3000:10000 --memory=512m ringback
```

When the build environment has an intercepting proxy with an installed trusted CA, use the optional BuildKit mount:

```sh
docker build --secret id=proxy_ca,src="$NODE_EXTRA_CA_CERTS" -t ringback .
```

The CA is mounted only during install/setup, never baked into the image. TLS verification stays enabled. The production build compiles the app/worker/supervisor and prebundles workflows; it does not run three extra TypeScript loader processes. Go memory and worker cache limits are tuned for a small demo. A short local capped-container test is not a production capacity guarantee.

## External Temporal

Set `TEMPORAL_ADDRESS`, `TEMPORAL_NAMESPACE`, `TEMPORAL_API_KEY` as appropriate. The supervisor skips its local Temporal server when an external address is supplied; both client and worker enable TLS when an API key is supplied. Run doctor and a synthetic booking to verify the actual binding. See TEMPORAL.md for history and reconciliation limits.
