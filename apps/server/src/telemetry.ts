import * as Sentry from "@sentry/node";
const allowed = new Set([
  "stt_ms",
  "retrieval_ms",
  "llm_ttft_ms",
  "llm_total_ms",
  "tts_ttfa_ms",
  "time_to_first_audio_ms",
  "tokens_in",
  "tokens_out",
  "tts_chars",
  "total_ms",
]);
export function scrubAttributes(
  input: Record<string, unknown>,
): Record<string, number> {
  return Object.fromEntries(
    Object.entries(input).filter(
      ([k, v]) => allowed.has(k) && typeof v === "number" && Number.isFinite(v),
    ),
  ) as Record<string, number>;
}
type TransactionEvent = Parameters<
  NonNullable<Sentry.NodeOptions["beforeSendTransaction"]>
>[0];
export function sanitizeTransaction(event: TransactionEvent): TransactionEvent {
  return {
    type: "transaction",
    event_id: event.event_id,
    timestamp: event.timestamp,
    start_timestamp: event.start_timestamp,
    transaction: "receptionist.turn",
    contexts: {
      trace: event.contexts?.trace
        ? {
            trace_id: event.contexts.trace.trace_id,
            span_id: event.contexts.trace.span_id,
            op: "ai.turn",
          }
        : undefined,
    },
    spans: event.spans?.map((s) => ({
      trace_id: s.trace_id,
      span_id: s.span_id,
      parent_span_id: s.parent_span_id,
      start_timestamp: s.start_timestamp,
      timestamp: s.timestamp,
      status: s.status,
      op: ["ai.stt", "ai.retrieval", "ai.llm", "ai.tts"].includes(s.op || "")
        ? s.op
        : "ai.stage",
      description: "stage",
      data: scrubAttributes(s.data || {}),
    })),
  };
}
export function initTelemetry(options: Partial<Sentry.NodeOptions> = {}) {
  if (process.env.SENTRY_DSN || options.dsn)
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      ...options,
      tracesSampleRate: 1,
      traceLifecycle: "static",
      defaultIntegrations: false,
      beforeSend: () => null,
      beforeSendTransaction: sanitizeTransaction,
    });
}
export function recordTelemetry(metrics: Record<string, unknown>) {
  const safe = scrubAttributes(metrics);
  if (Sentry.getClient())
    Sentry.startSpan(
      { name: "receptionist.turn", op: "ai.turn", attributes: safe },
      () => {
        for (const stage of ["stt", "retrieval", "llm", "tts"])
          Sentry.startSpan(
            { name: stage, op: `ai.${stage}`, attributes: safe },
            () => {},
          );
      },
    );
  return safe;
}
