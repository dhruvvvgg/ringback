import { test, expect, vi } from "vitest";
import { evalStore } from "../eval/run.js";
import { createApp, safeToken } from "../apps/server/src/app.js";
import {
  recordTelemetry,
  scrubAttributes,
} from "../apps/server/src/telemetry.js";
test("owner and caller records require scoped tokens; oversized requests rejected", async () => {
  const s = await evalStore();
  const { app } = createApp(s);
  try {
    expect((await app.request("/api/owner/juniper/dashboard")).status).toBe(
      401,
    );
    const r = await app.request("/api/calls", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessId: "juniper" }),
    });
    const c = await r.json();
    expect(
      (
        await app.request(`/api/calls/${c.id}/turn`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: "price" }),
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await app.request(`/api/calls/${c.id}/turn`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${c.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ text: "x".repeat(4001) }),
        })
      ).status,
    ).toBe(400);
  } finally {
    await s.close();
  }
});
test("PII canary removed from telemetry and numeric allowlist only", () => {
  const canary = "SYNTHETIC_PRIVATE_CANARY";
  const metrics = {
    transcript: canary,
    callerId: canary,
    name: canary,
    tokens_in: 3,
    llm_total_ms: 7,
    stt_ms: canary,
  };
  expect(JSON.stringify(recordTelemetry(metrics))).not.toContain(canary);
  expect(scrubAttributes(metrics)).toEqual({ tokens_in: 3, llm_total_ms: 7 });
  expect(safeToken("a", "b")).toBe(false);
  expect(safeToken("a", "a")).toBe(true);
});

test("actual call, Sentry envelope and application logs exclude planted caller canary",async()=>{
 const Sentry=await import('@sentry/node');const {initTelemetry}=await import('../apps/server/src/telemetry.js');const envelopes:unknown[]=[];const canary='PRIVATE_CALLER_CANARY_2026';const logs:unknown[]=[];
 const spies=[vi.spyOn(console,'log').mockImplementation((...args)=>{logs.push(args);}),vi.spyOn(console,'warn').mockImplementation((...args)=>{logs.push(args);}),vi.spyOn(console,'error').mockImplementation((...args)=>{logs.push(args);})];
 const store=await evalStore();
 try{
 initTelemetry({dsn:'https://public@example.invalid/1',transport:()=>({send:async e=>{envelopes.push(e);return {};},flush:async()=>true})});Sentry.setUser({id:canary,email:canary});Sentry.addBreadcrumb({message:canary});
 const {app}=createApp(store);const start=await app.request('/api/calls',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({businessId:'juniper',name:canary})});const call=await start.json();const turn=await app.request(`/api/calls/${call.id}/turn`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${call.token}`},body:JSON.stringify({text:`Please take a message: ${canary}`})});expect(turn.status).toBe(200);await Sentry.flush(2000);expect(envelopes.length).toBeGreaterThan(0);expect(JSON.stringify(envelopes)).not.toContain(canary);expect(JSON.stringify(logs)).not.toContain(canary);
 }finally{await store.close();await Sentry.close(2000);for(const spy of spies)spy.mockRestore();}
});
