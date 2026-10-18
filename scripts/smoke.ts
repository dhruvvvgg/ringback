import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import { DateTime } from "luxon";
import { mkdir, writeFile } from "node:fs/promises";
const base = process.argv[2] || "http://localhost:3000";
const headers = { "Content-Type": "application/json" };
async function request(path: string, body?: unknown, token?: string) {
  const r = await fetch(base + path, {
    method: body ? "POST" : "GET",
    headers: {
      ...headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) throw Error(`Smoke request failed (${r.status})`);
  return r.json() as Promise<any>;
}
const health = await request("/healthz");
const date = DateTime.now().plus({ weeks: 6 }).startOf("week").toISODate()!;
const slots = await request(
  `/api/businesses/juniper/slots?service=cut&date=${date}`,
);
if (!slots.length) throw Error("No synthetic smoke slot");
const slot = slots[0],
  time = DateTime.fromISO(slot.start)
    .setZone("Europe/London")
    .toFormat("HH:mm");
const call = await request("/api/calls", {
  businessId: "juniper",
  name: "Smoke Demo",
  phone: "demo-smoke",
});
const proposed = await request(
  `/api/calls/${call.id}/turn`,
  { text: `Book a haircut on ${date} at ${time}` },
  call.token,
);
if (!proposed.text.includes("Please confirm"))
  throw Error("Confirmation step missing");
const booked = await request(
  `/api/calls/${call.id}/turn`,
  { text: "yes" },
  call.token,
);
if (booked.outcome !== "booked") throw Error("Booking failed");
let appointment: any;
for (let i = 0; i < 60; i++) {
  const dashboard = await request(
    "/api/owner/juniper/dashboard",
    undefined,
    process.env.ADMIN_TOKEN,
  );
  appointment = dashboard.appointments.find(
    (a: any) => a.callerId === call.callerId,
  );
  if (appointment?.workflowStatus === "confirmed") break;
  await new Promise((r) => setTimeout(r, 500));
}
if (appointment?.workflowStatus !== "confirmed")
  throw Error("Worker confirmation not observed");
const result = {
  at: new Date().toISOString(),
  target: base,
  mode: booked.mode,
  health,
  passed: true,
  checks: {
    textCall: true,
    explicitConfirmation: true,
    booking: true,
    workflowVisible: true,
  },
  workflowId: appointment.workflowId,
};
await mkdir("artifacts/deploy", { recursive: true });
const path = "artifacts/deploy/smoke.json";
await writeFile(path, JSON.stringify(result, null, 2));
console.log(
  JSON.stringify({ passed: true, mode: booked.mode, artifact: path }),
);
