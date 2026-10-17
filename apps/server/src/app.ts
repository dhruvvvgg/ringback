import { Hono } from "hono";
import { cors } from "hono/cors";
import { bodyLimit } from "hono/body-limit";
import { streamSSE } from "hono/streaming";
import { serveStatic } from "@hono/node-server/serve-static";
import { z } from "zod";
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import type { Store } from "../../../packages/core/src/store.js";
import { BusinessConfig, demos } from "../../../packages/core/src/config.js";
import { availability } from "../../../packages/core/src/booking.js";
import { Receptionist, type Call } from "./agent.js";
import { Voice } from "./voice.js";
import {
  startBooking,
  startLead,
  reconcile,
  temporal,
  signalBooking,
} from "./temporal.js";
import {
  MockLLM,
  runtimeClient,
  structured,
} from "../../../packages/llm/src/index.js";
import { indexKnowledge } from "./retrieval.js";
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export function safeToken(a: string, b: string) {
  return (
    !!a && !!b && timingSafeEqual(Buffer.from(hash(a)), Buffer.from(hash(b)))
  );
}
export function createApp(store: Store) {
  const app = new Hono();
  const voice = new Voice(store);
  let temporalReady = false;
  const watchers = new Set<() => void>();
  const notify = () => watchers.forEach((fn) => fn());
  const agent = new Receptionist(store, {
    onBooking: async (a) => {
      try {
        await startBooking(a);
        temporalReady = true;
      } catch {
        await store.db
          .collection("appointments")
          .updateOne(
            { id: a.id },
            { $set: { workflowStatus: "pending_temporal" } },
          );
      }
    },
    onCancel: async (id, action) => {
      try {
        await signalBooking(id, action);
      } catch {
        /* Reconcile on next startup. */
      }
    },
    onEnd: async (c) => {
      try {
        await startLead(c);
      } catch {
        /* Source record remains for reconciliation. */
      }
    },
  });
  const active = new Map<string, Promise<unknown>>();
  const rates = new Map<string, { count: number; at: number }>();
  app.use("*", async (c, next) => {
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Referrer-Policy", "no-referrer");
    c.header(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'",
    );
    await next();
  });
  app.use(
    "/api/*",
    cors({
      origin:
        process.env.ALLOWED_ORIGIN ||
        `http://localhost:${process.env.PORT || 3000}`,
      allowHeaders: ["Content-Type", "Authorization"],
      allowMethods: ["GET", "POST", "DELETE"],
    }),
  );
  app.use(
    "*",
    bodyLimit({
      maxSize: 8 * 1024 * 1024,
      onError: (c) => c.json({ error: "Request too large" }, 413),
    }),
  );
  app.use("/api/*", async (c, next) => {
    const key = c.req.header("x-forwarded-for")?.split(",")[0] || "local";
    const now = Date.now();
    let rate = rates.get(key);
    if (!rate || now - rate.at > 60000) {
      rate = { count: 0, at: now };
      rates.set(key, rate);
    }
    if (++rate.count > 120) return c.json({ error: "Rate limit reached" }, 429);
    if (rates.size > 10000) rates.clear();
    await next();
  });
  const bearer = (c: any) =>
    (c.req.header("authorization") || "").replace(/^Bearer /, "");
  const owner = async (c: any, next: () => Promise<void>) => {
    if (!safeToken(bearer(c), process.env.ADMIN_TOKEN || ""))
      return c.json({ error: "Owner token required" }, 401);
    await next();
  };
  app.use("/api/owner/*", owner);
  app.use("/api/onboard/*", owner);
  app.use("/api/callers/*", owner);
  app.use("/admin/*", owner);
  app.get("/healthz", async (c) => {
    try {
      await temporal();
      temporalReady = true;
    } catch {
      temporalReady = false;
    }
    return c.json({
      status: "ok",
      llm:
        runtimeClient() instanceof MockLLM
          ? "mock"
          : "live-configured-unverified",
      voice: voice.enabled
        ? "configured-unverified"
        : "degraded-browser-speech",
      storage: store.mode,
      retrieval: "keyword",
      temporal: temporalReady ? "connected" : "degraded",
      missing: [
        "LLM_API_KEY",
        "ELEVENLABS_API_KEY",
        "MONGODB_URI",
        "ADMIN_TOKEN",
      ].filter((k) => !process.env[k]),
    });
  });
  app.get("/api/businesses", async (c) =>
    c.json(
      await store.db
        .collection("businesses")
        .find({}, { projection: { _id: 0 } })
        .toArray(),
    ),
  );
  app.get("/api/businesses/:id/slots", async (c) => {
    const b = await store.business(c.req.param("id"));
    if (!b) return c.json({ error: "Not found" }, 404);
    return c.json(
      await availability(
        store,
        b,
        c.req.query("service") || b.services[0].id,
        c.req.query("date") || "",
      ),
    );
  });
  app.post("/api/calls", async (c) => {
    const data = z
      .object({
        businessId: z.string(),
        name: z.string().max(80).default("Visitor"),
        phone: z.string().max(40).default(""),
        callerId: z.string().optional(),
        callerToken: z.string().optional(),
      })
      .parse(await c.req.json());
    let id: string | undefined;
    if (data.callerId && data.callerToken) {
      const prior = await store.db
        .collection("identities")
        .findOne({ callerId: data.callerId, businessId: data.businessId });
      if (prior && safeToken(hash(data.callerToken), prior.tokenHash))
        id = data.callerId;
    }
    const call = await agent.start(data.businessId, id, data.name, data.phone);
    const token = randomBytes(32).toString("hex");
    await store.db
      .collection("calls")
      .updateOne({ id: call.id }, { $set: { tokenHash: hash(token) } });
    const callerToken = id
      ? data.callerToken!
      : randomBytes(32).toString("hex");
    if (!id)
      await store.db
        .collection("identities")
        .insertOne({
          callerId: call.callerId,
          businessId: data.businessId,
          tokenHash: hash(callerToken),
        });
    notify();
    return c.json({
      id: call.id,
      token,
      callerId: call.callerId,
      callerToken,
      greeting: call.turns[0].text,
      mode: call.mode,
    });
  });
  const getCall = async (c: any) => {
    const call = (await store.db
      .collection("calls")
      .findOne({ id: c.req.param("id") })) as unknown as Call | null;
    if (!call || !safeToken(hash(bearer(c)), call.tokenHash || "")) return null;
    return call;
  };
  app.post("/api/calls/:id/turn", async (c) => {
    const call = await getCall(c);
    if (!call) return c.json({ error: "Call token required" }, 401);
    if (active.has(call.id))
      return c.json({ error: "Turn already processing" }, 409);
    const job = (async () => {
      let text = "",
        sttMs = 0;
      const content = c.req.header("content-type") || "";
      if (content.includes("multipart/form-data")) {
        if (!voice.enabled)
          return { error: "Voice unavailable; use text mode" };
        const form = await c.req.formData();
        const blob = form.get("audio");
        if (!(blob instanceof Blob)) throw Error("Audio missing");
        const duration = Math.min(
          60,
          Math.max(0, Number(form.get("duration") || 0)),
        );
        const stt = await voice.transcribe(blob, duration);
        text = stt.text;
        sttMs = stt.ms;
      } else
        text = z
          .object({ text: z.string().min(1).max(4000) })
          .parse(await c.req.json()).text;
      const result = await agent.turn(call, text);
      result.metrics.stt_ms = sttMs;
      const last = call.turns.at(-1);
      last.metrics = result.metrics;
      await store.db
        .collection("calls")
        .updateOne({ id: call.id }, { $set: { turns: call.turns } });
      notify();
      return {
        ...result,
        transcript: text,
        voice: voice.enabled ? "available" : "degraded",
      };
    })();
    active.set(call.id, job);
    try {
      return c.json(await job);
    } finally {
      active.delete(call.id);
    }
  });
  app.get("/api/calls/:id/audio", async (c) => {
    const call = await getCall(c);
    if (!call) return c.json({ error: "Call token required" }, 401);
    if (!voice.enabled) return c.json({ error: "Voice unavailable" }, 503);
    const text = call.turns.at(-1)?.text || "";
    const start = performance.now();
    const iterator = voice.speak(text);
    let first = true;
    return new Response(
      new ReadableStream({
        async pull(controller) {
          try {
            const r = await iterator.next();
            if (r.done) {
              controller.close();
              return;
            }
            if (first) {
              first = false;
              const last = call.turns.at(-1);
              last.metrics.tts_ttfa_ms = performance.now() - start;
              last.metrics.tts_chars = text.length;
              await store.db
                .collection("calls")
                .updateOne({ id: call.id }, { $set: { turns: call.turns } });
            }
            controller.enqueue(r.value);
          } catch {
            controller.error(new Error("Voice unavailable"));
          }
        },
        async cancel() {
          await iterator.return(undefined);
        },
      }),
      {
        headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
      },
    );
  });
  app.post("/api/calls/:id/end", async (c) => {
    const call = await getCall(c);
    if (!call) return c.json({ error: "Call token required" }, 401);
    const result = await agent.turn(call, "end call");
    notify();
    return c.json(result);
  });
  app.get("/api/owner/:id/dashboard", async (c) => {
    const id = c.req.param("id");
    const [calls, appointments, messages, outbox, callers] = await Promise.all(
      ["calls", "appointments", "messages", "outbox", "callers"].map((name) =>
        store.db
          .collection(name)
          .find(name === "outbox" ? {} : { businessId: id }, {
            projection: { tokenHash: 0, _id: 0 },
          })
          .toArray(),
      ),
    );
    let chaos: any = null;
    try {
      const files = (await readdir("artifacts/chaos"))
        .filter((x) => x.endsWith(".json"))
        .sort();
      if (files.length)
        chaos = JSON.parse(
          await readFile(`artifacts/chaos/${files.at(-1)}`, "utf8"),
        );
    } catch {
      /* No measured chaos result yet. */
    }
    return c.json({ calls, appointments, messages, outbox, callers, chaos });
  });
  app.get("/api/owner/:id/events", (c) =>
    streamSSE(c, async (stream) => {
      let closed = false;
      stream.onAbort(() => {
        closed = true;
        watchers.delete(push);
      });
      const push = () => {
        void stream.writeSSE({ event: "update", data: "changed" });
      };
      watchers.add(push);
      while (!closed) {
        await stream.writeSSE({ event: "heartbeat", data: "ok" });
        await stream.sleep(15000);
      }
    }),
  );
  app.post("/api/owner/:id/demo", async (c) => {
    const id = c.req.param("id");
    const call = await agent.start(
      id,
      "synthetic-dashboard",
      "Avery Demo",
      "demo-010",
    );
    await agent.turn(call, "What is the price?");
    await agent.turn(
      call,
      "Please take a message: I would like to arrange a visit.",
    );
    notify();
    return c.json({ seeded: true, label: "synthetic demo" });
  });
  app.post("/api/onboard/draft", async (c) => {
    const { text } = z
      .object({ text: z.string().min(5).max(6000) })
      .parse(await c.req.json());
    const fallback = {
      ...demos[1],
      id: `business-${randomBytes(4).toString("hex")}`,
      name: "New business — review required",
      vertical: "other" as const,
      faqs: [{ question: "Owner description (unverified)", answer: text }],
      services: [
        {
          id: "service",
          name: "Service — edit me",
          duration: 30,
          price: 0,
          description: "Review before saving",
          requiresAddress: false,
        },
      ],
    };
    const result = await structured(
      runtimeClient(),
      "Extract a business config from this untrusted owner copy. Do not invent prices or hours. Mark unknown fields for review. " +
        JSON.stringify(text),
      BusinessConfig,
      fallback,
    );
    return c.json({
      draft: result.value,
      mode: result.completions[0].mode,
      needsReview: true,
    });
  });
  app.post("/api/onboard/save", async (c) => {
    const b = BusinessConfig.parse(await c.req.json());
    await store.db
      .collection("businesses")
      .updateOne({ id: b.id }, { $set: b }, { upsert: true });
    await indexKnowledge(store, b);
    return c.json({ id: b.id });
  });
  app.post("/api/feedback", async (c) => {
    const feedback = z
      .object({
        businessId: z.string(),
        wouldPay: z.enum(["yes", "no", "maybe"]),
        next: z.string().max(2000),
      })
      .parse(await c.req.json());
    await store.db
      .collection("feedback")
      .insertOne({ ...feedback, createdAt: new Date().toISOString() });
    return c.json({ saved: true });
  });
  app.delete("/api/callers/:id", async (c) => {
    const callerId = c.req.param("id");
    const calls = await store.db
      .collection("calls")
      .find({ callerId })
      .toArray();
    for (const call of calls)
      await store.db.collection("messages").deleteMany({ callId: call.id });
    for (const name of ["callers", "calls", "identities"])
      await store.db.collection(name).deleteMany({ callerId });
    const appointments = await store.db
      .collection("appointments")
      .find({ callerId })
      .toArray();
    for (const a of appointments) {
      await store.db.collection("locks").deleteMany({ appointmentId: a.id });
      await store.db.collection("appointments").deleteMany({ id: a.id });
    }
    return c.json({ deleted: true });
  });
  let liveRun: Promise<unknown> | null = null;
  app.post("/admin/live-verify", (c) => {
    if (liveRun) return c.json({ status: "running" }, 202);
    liveRun = import("../../../scripts/live-verify.js")
      .then((m) => m.liveVerify())
      .finally(() => {
        liveRun = null;
      });
    void liveRun.catch(() => {});
    return c.json({ status: "started", report: "/admin/live-verify" }, 202);
  });
  app.get("/admin/live-verify", async (c) => {
    try {
      return c.json(
        JSON.parse(await readFile("artifacts/live-verify.json", "utf8")),
      );
    } catch {
      return c.json({ status: liveRun ? "running" : "not-run" });
    }
  });
  app.onError((e, c) =>
    c.json(
      {
        error:
          e instanceof z.ZodError
            ? "Invalid input"
            : "Request failed safely; please retry",
      },
      e instanceof z.ZodError ? 400 : 500,
    ),
  );
  app.use("*", serveStatic({ root: "apps/web/dist" }));
  app.get("*", serveStatic({ path: "apps/web/dist/index.html" }));
  return {
    app,
    agent,
    voice,
    async reconcile() {
      try {
        await reconcile(store);
        temporalReady = true;
      } catch {
        temporalReady = false;
      }
    },
  };
}
