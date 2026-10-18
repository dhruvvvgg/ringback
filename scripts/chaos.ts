import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { Client, Connection } from "@temporalio/client";
import { connectStore } from "../packages/core/src/store.js";
import { randomUUID } from "node:crypto";
const delay = (n: number) => new Promise((r) => setTimeout(r, n));
export async function chaos() {
  const id = `chaos-${randomUUID()}`,
    workflowId = `booking-${id}`,
    taskQueue = `chaos-${id}`;
  const store = await connectStore();
  const connection = await Connection.connect({
    address: process.env.TEMPORAL_ADDRESS || "localhost:7233",
    connectTimeout: 5000,
  });
  const client = new Client({ connection });
  const timeline: any[] = [];
  let worker: ChildProcess | undefined;
  const event = (name: string) =>
    timeline.push({ event: name, at: new Date().toISOString() });
  const launch = () => {
    worker = spawn(
      process.execPath,
      ["--import", "tsx", "apps/worker/src/index.ts"],
      {
        env: { ...process.env, TEMPORAL_TASK_QUEUE: taskQueue },
        stdio: "ignore",
      },
    );
    event("worker_started");
  };
  try {
    await store.db.collection("appointments").insertOne({
      id,
      workflowId,
      businessId: "juniper",
      key: id,
      callerId: "synthetic-chaos",
      status: "booked",
      start: new Date(Date.now() + 86400000 + 1000).toISOString(),
    });
    launch();
    const handle = await client.workflow.start("BookingLifecycleWorkflow", {
      workflowId,
      taskQueue,
      args: [id, 10000],
    });
    event("workflow_started");
    let found = false;
    for (let i = 0; i < 200; i++) {
      if (
        await store.db
          .collection("outbox")
          .findOne({ key: `${id}:confirmation` })
      ) {
        found = true;
        break;
      }
      await delay(100);
    }
    if (!found) throw Error("Confirmation not observed before kill");
    event("confirmation_recorded");
    worker!.kill("SIGKILL");
    event("worker_killed");
    await delay(1000);
    launch();
    await handle.signal("bookingAction", "confirm");
    const result = await Promise.race([
      handle.result(),
      delay(45000).then(() => {
        throw Error("Workflow did not recover");
      }),
    ]);
    event("workflow_completed");
    const confirmations = await store.db
      .collection("outbox")
      .countDocuments({ key: `${id}:confirmation` });
    if (confirmations !== 1 || result !== "completed")
      throw Error("Durability invariant failed");
    const history = await handle.fetchHistory();
    const report = {
      mode: "real-temporal-local",
      passed: true,
      workflowId,
      result,
      confirmations,
      historyEvents: history.events?.length,
      timeline,
      scope:
        "Worker process kill with persistent Temporal server; outbox exactly once. Not proof of exactly-once webhook delivery or Render restart persistence.",
    };
    await mkdir("artifacts/chaos", { recursive: true });
    const path = `artifacts/chaos/run-${Date.now()}.json`;
    await writeFile(path, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ passed: true, path, confirmations }));
    return report;
  } finally {
    worker?.kill("SIGTERM");
    await store.close();
    await connection.close();
  }
}
if (process.argv[1]?.endsWith("chaos.ts")) await chaos();
