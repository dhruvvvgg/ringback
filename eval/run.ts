import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import { mkdir, writeFile, readFile, rename } from "node:fs/promises";
import { MongoClient, type Db } from "mongodb";
import { DateTime } from "luxon";
import { LocalDb } from "../packages/core/src/local-db.js";
import { Store } from "../packages/core/src/store.js";
import { Receptionist, groundingViolations } from "../apps/server/src/agent.js";
import { GemmaClient, MockLLM, type LLM } from "../packages/llm/src/index.js";
import { candidateSlots, book } from "../packages/core/src/booking.js";
import { scenarios } from "./scenarios.js";
export function wilson(success: number, total: number) {
  if (!total) return null;
  const z = 1.96,
    p = success / total,
    d = 1 + (z * z) / total,
    c = (p + (z * z) / (2 * total)) / d,
    h = (z * Math.sqrt((p * (1 - p) + (z * z) / (4 * total)) / total)) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}
export function quantile(a: number[], q: number) {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * q))] : null;
}
export async function evalStore() {
  const db = new LocalDb(":memory:");
  const s = new Store(
    { close: async () => db.connection.close() } as MongoClient,
    db as unknown as Db,
    "sqlite-degraded",
  );
  await s.init();
  return s;
}
export async function runEval(
  options: {
    smoke?: boolean;
    llm?: LLM;
    model?: string;
    repair?: boolean;
    retrieval?: boolean;
    resume?: boolean;
  } = {},
) {
  const llm =
    options.llm ||
    (process.env.LLM_API_KEY ? new GemmaClient() : new MockLLM());
  const mode = llm instanceof MockLLM ? "mock" : "live";
  const label = `${mode}-${(options.model || (llm instanceof GemmaClient ? llm.model : "MockLLM") || "discovery").replace(/[^a-z0-9-]/gi, "_")}-${options.retrieval === false ? "no-retrieval" : options.repair === false ? "no-repair" : "baseline"}${options.smoke ? "-smoke" : ""}`;
  await mkdir("artifacts/eval", { recursive: true });
  const path = `artifacts/eval/${label}.json`;
  let rows: any[] = [];
  if (options.resume)
    try {
      rows = JSON.parse(await readFile(path, "utf8")).scenarios || [];
    } catch {
      /* First run. */
    }
  const selected = scenarios().filter((_, i) => !options.smoke || i < 12);
  await writeFile(
    "eval/scenarios.generated.json",
    JSON.stringify(selected, null, 2),
  );
  const started = Date.now();
  let blocked: string | null = null;
  for (const scenario of selected) {
    if (rows.some((r) => r.id === scenario.id)) continue;
    if (
      rows.reduce((n, r) => n + (r.tokensIn || 0) + (r.tokensOut || 0), 0) >
      Number(process.env.EVAL_TOKEN_BUDGET || 100000)
    ) {
      blocked =
        "LLM token budget reached; resume with a deliberate larger budget";
      break;
    }
    const store = await evalStore();
    try {
      const b = (await store.business(scenario.businessId))!;
      const receptionist = new Receptionist(store, {
        llm,
        repair: options.repair,
        retrieval: options.retrieval,
      });
      if (scenario.prefill) {
        const date = scenario.turns[0].match(/\d{4}-\d{2}-\d{2}/)![0];
        for (const slot of candidateSlots(b, b.services[0].id, date)) {
          try {
            await book(store, {
              ...slot,
              businessId: b.id,
              serviceId: b.services[0].id,
              callerId: "other",
              name: "Other Demo",
              phone: "demo-other",
              key: slot.start,
            });
          } catch {
            /* Overlapping slot rejected. */
          }
        }
      }
      const callerId = `eval-${scenario.id}`;
      if (scenario.returning) {
        const first = await receptionist.start(
          b.id,
          callerId,
          "Returning Demo",
          "demo-return",
        );
        await receptionist.turn(first, "What is the price?");
      }
      const call = await receptionist.start(
        b.id,
        callerId,
        "Avery Demo",
        "demo-eval",
      );
      const turns: any[] = [];
      let error = false;
      try {
        for (const turn of scenario.turns)
          turns.push(await receptionist.turn(call, turn));
      } catch {
        error = true;
        blocked =
          mode === "live"
            ? "Live request failed; checkpoint saved, retry later"
            : null;
      }
      const bookings = await store.db
        .collection("appointments")
        .find({ callerId, status: "booked" })
        .toArray();
      const cancelled = await store.db
        .collection("appointments")
        .countDocuments({ callerId, status: "cancelled" });
      const urgent = await store.db
        .collection("messages")
        .countDocuments({ callId: call.id, urgent: true });
      const last = turns.at(-1)?.text || "";
      const checks = {
        bookingCount: bookings.length === scenario.expected.bookings,
        urgent:
          scenario.expected.urgent === undefined ||
          urgent === scenario.expected.urgent,
        answer:
          !scenario.expected.contains ||
          last.toLowerCase().includes(scenario.expected.contains.toLowerCase()),
        slot:
          scenario.expected.slotHour === undefined ||
          bookings.every(
            (a) =>
              DateTime.fromISO(a.start).setZone(b.timezone).hour ===
              scenario.expected.slotHour,
          ),
        cancelled:
          scenario.expected.cancelled === undefined ||
          cancelled === scenario.expected.cancelled,
        memory:
          !scenario.expected.memory ||
          call.turns[0].text.includes("Welcome back"),
      };
      const violations = turns.reduce(
        (n, t) => n + groundingViolations(t.text, b, t.sources),
        0,
      );
      const record = {
        id: scenario.id,
        category: scenario.category,
        mode,
        passed:
          !error && Object.values(checks).every(Boolean) && violations === 0,
        checks,
        error,
        groundingViolations: violations,
        turns: turns.length,
        repairs: turns.reduce((n, t) => n + t.repairs, 0),
        fallbacks: turns.filter((t) => t.fallback).length,
        tokensIn: turns.reduce((n, t) => n + t.metrics.tokens_in, 0),
        tokensOut: turns.reduce((n, t) => n + t.metrics.tokens_out, 0),
        latency: turns.map((t) => t.metrics),
        failureExample: !Object.values(checks).every(Boolean)
          ? { caller: scenario.turns, lastResponse: last }
          : null,
      };
      if (!error) rows.push(record);
      const report = summarize(
        rows,
        selected.length,
        mode,
        label,
        started,
        blocked,
      );
      await writeFile(path + ".tmp", JSON.stringify(report, null, 2));
      await rename(path + ".tmp", path);
      if (error && mode === "live") break;
    } finally {
      await store.close();
    }
  }
  const report = summarize(
    rows,
    selected.length,
    mode,
    label,
    started,
    blocked,
  );
  await writeFile(path, JSON.stringify(report, null, 2));
  await writeFile(
    "artifacts/usage.json",
    JSON.stringify(
      {
        mode,
        source: path,
        tokensIn: report.tokensIn,
        tokensOut: report.tokensOut,
        voice: "See artifacts/latency/live-voice.json when available",
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      path,
      mode,
      completed: rows.length,
      passed: report.passed,
      total: selected.length,
      blocked,
    }),
  );
  return { ...report, path };
}
function summarize(
  rows: any[],
  total: number,
  mode: string,
  label: string,
  start: number,
  blocked: string | null,
) {
  const passed = rows.filter((r) => r.passed).length,
    turns = rows.reduce((n, r) => n + r.turns, 0),
    latency = rows.flatMap((r) => r.latency.map((m: any) => m.total_ms));
  return {
    at: new Date().toISOString(),
    mode,
    label,
    total,
    completed: rows.length,
    passed,
    successRate: rows.length ? passed / rows.length : null,
    wilson95: wilson(passed, rows.length),
    durationMs: Date.now() - start,
    blocked,
    turns,
    repairs: rows.reduce((n, r) => n + r.repairs, 0),
    fallbacks: rows.reduce((n, r) => n + r.fallbacks, 0),
    tokensIn: rows.reduce((n, r) => n + r.tokensIn, 0),
    tokensOut: rows.reduce((n, r) => n + r.tokensOut, 0),
    latency: { p50Ms: quantile(latency, 0.5), p95Ms: quantile(latency, 0.95) },
    categories: Object.fromEntries(
      [...new Set(rows.map((r) => r.category))].map((c) => {
        const selected = rows.filter((r) => r.category === c),
          pass = selected.filter((r) => r.passed).length;
        return [
          c,
          {
            passed: pass,
            total: selected.length,
            wilson95: wilson(pass, selected.length),
          },
        ];
      }),
    ),
    scenarios: rows,
  };
}
if (process.argv[1]?.endsWith("/eval/run.ts"))
  await runEval({
    smoke: process.argv.includes("--smoke"),
    resume: process.argv.includes("--resume"),
  });
