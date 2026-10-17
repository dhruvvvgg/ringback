import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import { serve } from "@hono/node-server";
import { connectStore } from "../../../packages/core/src/store.js";
import { runtimeClient } from "../../../packages/llm/src/index.js";
import { createApp } from "./app.js";
import { initTelemetry } from "./telemetry.js";
runtimeClient();
initTelemetry();
const store = await connectStore();
const service = createApp(store);
const server = serve({
  fetch: service.app.fetch,
  port: Number(process.env.PORT || 3000),
  hostname: "0.0.0.0",
});
void service.reconcile();
const timer = setInterval(() => void service.reconcile(), 60000);
console.log("Ringback listening; see /healthz for capability status.");
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    clearInterval(timer);
    server.close(() => {
      void store.close().then(() => process.exit(0));
    });
  });
