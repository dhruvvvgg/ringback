import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import { spawn, type ChildProcess } from "node:child_process";
import { Connection } from "@temporalio/client";
import { mkdir } from "node:fs/promises";
await mkdir(".data", { recursive: true });
const children: ChildProcess[] = [];
let closing = false;
function launch(command: string, args: string[]) {
  const child = spawn(command, args, { stdio: "inherit", env: process.env });
  children.push(child);
  child.on("exit", (code) => {
    if (!closing && code !== 0) {
      console.error("A required service exited; shutting down siblings.");
      shutdown();
      process.exitCode = 1;
    }
  });
  return child;
}
function shutdown() {
  closing = true;
  for (const c of children) c.kill("SIGTERM");
  setTimeout(() => {
    for (const c of children) c.kill("SIGKILL");
  }, 10000).unref();
}
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, shutdown);
if (!process.env.TEMPORAL_ADDRESS)
  launch(process.env.TEMPORAL_CLI || ".data/bin/temporal", [
    "server",
    "start-dev",
    "--headless",
    "--db-filename",
    ".data/temporal.db",
    "--ip",
    "127.0.0.1",
  ]);
let ready = false;
for (let i = 0; i < 60; i++) {
  try {
    const c = await Connection.connect({
      address: process.env.TEMPORAL_ADDRESS || "localhost:7233",
      connectTimeout: 500,
      ...(process.env.TEMPORAL_API_KEY
        ? { apiKey: process.env.TEMPORAL_API_KEY, tls: true }
        : {}),
    });
    await c.close();
    ready = true;
    break;
  } catch {
    await new Promise((r) => setTimeout(r, 500));
  }
}
if (!ready) {
  shutdown();
  throw Error("Temporal unavailable after startup deadline");
}
launch(process.execPath, ["--import", "tsx", "apps/worker/src/index.ts"]);
launch(process.execPath, ["--import", "tsx", "apps/server/src/index.ts"]);
