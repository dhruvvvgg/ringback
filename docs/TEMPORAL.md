# Temporal lifecycle and persistence

Ringback uses the TypeScript SDK, all packages locked to the same version. Workflows import activity types only and contain deterministic timers, conditions, signals and queries. Network, database and notification effects live in activities. Production workflows are prebundled during `npm run build`.

`BookingLifecycleWorkflow(appointmentId, scale)` verifies the already-reserved appointment, sends an idempotent confirmation, waits until the reminder point, handles confirm/cancel/reschedule signals, and records completion/no-show with optional follow-up. Failed confirmation retries lead to `needs_attention` and an owner-attention notification. `LeadRecoveryWorkflow` waits and then checks for a new booking or later call before creating a follow-up preview. These checks also protect a delayed signal race. The `status` query exposes current workflow state.

The outbox has a unique idempotency key. That makes the confirmation record exactly once under retried activities. HTTP webhook delivery is at least once: a crash after remote acceptance but before local acknowledgement can cause another request. The receiver should honor `Idempotency-Key`. No exactly-once SMS claim is made; this app has no SMS transport.

The supervisor starts a loopback-only Temporal dev server with `.data/temporal.db`, then a worker and API. The dev server is for this demonstration, not a production cluster. Local history survives worker kills and local process restarts while that file remains. Render Free may discard the file on redeploy/restart and can suspend the service; timers do not imply delivery while the whole service is asleep.

Atlas is intended as the persistent booking source of truth. Reconciliation starts missing nonterminal booking workflows with a stable workflow ID, rejects duplicate histories, resumes eligible lead workflows and retries cancellation signals. It cannot reconstruct an exact lost history, guarantee notification timing during downtime, or persist SQLite data after ephemeral disk loss. No paid disk or keep-alive workaround was created.

Run:

```sh
npm start
# In another terminal:
npm run demo:chaos
```

The chaos command uses a separate task queue and kills only the worker it spawned. It waits for a confirmation record, sends SIGKILL, restarts the worker, signals confirmation and asserts completion plus one confirmation. `artifacts/chaos/` contains timeline and event-count evidence. It is not a proof of container-wide crash recovery.

`tests/temporal.test.ts` uses Temporal's time-skipping test environment to exercise timers, retry exhaustion, compensation and lead cancellation. If that server cannot download, it explicitly records a fallback to an existing local dev server with compressed timers. The artifact's `timeSkipping` field states what actually ran. The test server emits a heartbeat-capability warning with this SDK; tested activities do not use heartbeat details. Do not suppress or reinterpret it as a tested heartbeat guarantee.

For production, connect a real Temporal cluster/Cloud namespace using the environment variables in DEPLOY.md. Deployment of a production cluster is outside the free demo topology and was not attempted.
