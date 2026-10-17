import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import {
  NativeConnection,
  Worker,
  Runtime,
  DefaultLogger,
} from "@temporalio/worker";
import { fileURLToPath } from "node:url";
import * as activities from "./activities.js";
Runtime.install({ logger: new DefaultLogger("ERROR") });
const connection = await NativeConnection.connect({
  address: process.env.TEMPORAL_ADDRESS || "localhost:7233",
  ...(process.env.TEMPORAL_API_KEY
    ? { apiKey: process.env.TEMPORAL_API_KEY, tls: true }
    : {}),
});
const worker = await Worker.create({
  connection,
  namespace: process.env.TEMPORAL_NAMESPACE || "default",
  taskQueue: process.env.TEMPORAL_TASK_QUEUE || "ringback",
  ...(process.env.NODE_ENV === "production" ? { workflowBundle: { codePath: fileURLToPath(new URL("../dist/workflows.cjs", import.meta.url)) } } : { workflowsPath: fileURLToPath(new URL("./workflows.ts", import.meta.url)) }),
  activities,
  bundlerOptions: {
    webpackConfigHook: (config) => ({ ...config, stats: "errors-only" }),
  },
});
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.on(signal, () => worker.shutdown());
await worker.run();
await connection.close();
