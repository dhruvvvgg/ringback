import type { Store } from "../../../packages/core/src/store.js";
export async function notify(
  store: Store,
  key: string,
  message: string,
  urgent = false,
) {
  if (process.env.NOTIFIER_CHAOS === "1" && Math.random() < 0.5)
    throw new Error("Synthetic notifier failure");
  await store.db
    .collection("outbox")
    .updateOne(
      { key },
      {
        $setOnInsert: {
          key,
          message,
          urgent,
          status: "preview",
          createdAt: new Date().toISOString(),
        },
      },
      { upsert: true },
    );
  const prior = await store.db.collection("outbox").findOne({ key });
  if (process.env.OWNER_WEBHOOK_URL && prior?.status !== "sent") {
    // At-least-once webhook transport; receivers should honor this idempotency key.
    const r = await fetch(process.env.OWNER_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": key },
      body: JSON.stringify({ content: message }),
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) throw new Error("Owner webhook unavailable");
    await store.db
      .collection("outbox")
      .updateOne({ key }, { $set: { status: "sent" } });
  }
  return {
    queued: true,
    transport: process.env.OWNER_WEBHOOK_URL ? "webhook" : "outbox-preview",
  };
}
