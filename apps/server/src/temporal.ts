import {
  Client,
  Connection,
  WorkflowExecutionAlreadyStartedError,
} from "@temporalio/client";
import type { Store } from "../../../packages/core/src/store.js";
let client: Client | undefined;
export async function temporal() {
  if (client) return client;
  const connection = await Connection.connect({
    address: process.env.TEMPORAL_ADDRESS || "localhost:7233",
    connectTimeout: 2000,
    ...(process.env.TEMPORAL_API_KEY
      ? { apiKey: process.env.TEMPORAL_API_KEY, tls: true }
      : {}),
  });
  return (client = new Client({
    connection,
    namespace: process.env.TEMPORAL_NAMESPACE || "default",
  }));
}
export async function startBooking(a: any) {
  const c = await temporal();
  try {
    await c.workflow.start("BookingLifecycleWorkflow", {
      workflowId: a.workflowId,
      workflowIdReusePolicy: "REJECT_DUPLICATE",
      taskQueue: process.env.TEMPORAL_TASK_QUEUE || "ringback",
      args: [a.id, Number(process.env.DEMO_TIME_SCALE || 1)],
    });
  } catch (e) {
    if (!(e instanceof WorkflowExecutionAlreadyStartedError)) throw e;
  }
}
export async function startLead(call: any) {
  if (!call.followUpNeeded) return;
  const c = await temporal();
  try {
    await c.workflow.start("LeadRecoveryWorkflow", {
      workflowId: `lead-${call.id}`,
      workflowIdReusePolicy: "REJECT_DUPLICATE",
      taskQueue: process.env.TEMPORAL_TASK_QUEUE || "ringback",
      args: [call.id, 3600000 / Number(process.env.DEMO_TIME_SCALE || 1)],
    });
  } catch (e) {
    if (!(e instanceof WorkflowExecutionAlreadyStartedError)) throw e;
  }
}
export async function reconcile(store: Store) {
  const list = await store.db
    .collection("appointments")
    .find({ status: "booked" })
    .toArray();
  for (const a of list) {
    if (
      !["completed", "no_show", "cancelled", "rescheduled"].includes(
        a.workflowStatus,
      )
    )
      await startBooking(a);
  }
  const calls = await store.db
    .collection("calls")
    .find({ followUpNeeded: true })
    .toArray();
  for (const call of calls) await startLead(call);
  const cancelled = await store.db
    .collection("appointments")
    .find({ status: "cancelled" })
    .toArray();
  for (const a of cancelled) {
    try {
      await signalBooking(a.id, "cancel");
    } catch {
      /* Closed or absent workflows require no signal. */
    }
  }
  return list.length;
}
export async function signalBooking(id: string, action: string) {
  const c = await temporal();
  await c.workflow.getHandle(`booking-${id}`).signal("bookingAction", action);
}

export async function stopCallerLeads(
  store: Store,
  businessId: string,
  callerId: string,
  exceptId?: string,
) {
  const calls = await store.db
    .collection("calls")
    .find({ businessId, callerId, followUpNeeded: true })
    .toArray();
  const c = await temporal();
  for (const call of calls) {
    if (call.id === exceptId) continue;
    await store.db
      .collection("calls")
      .updateOne({ id: call.id }, { $set: { followUpNeeded: false } });
    try {
      await c.workflow.getHandle(`lead-${call.id}`).signal("stopLead");
    } catch {
      /* No running workflow; persisted eligibility still cleared. */
    }
  }
}
