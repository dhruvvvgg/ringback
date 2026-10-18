import { DateTime } from "luxon";
import { randomUUID } from "node:crypto";
import type { Store } from "./store.js";
import type { Business } from "./config.js";
export type Slot = { start: string; end: string; resourceId: string };
export function candidateSlots(
  b: Business,
  serviceId: string,
  date: string,
  now = Date.now(),
): Slot[] {
  const service = b.services.find((s) => s.id === serviceId);
  if (!service || b.holidays.includes(date)) return [];
  const day = DateTime.fromISO(date, { zone: b.timezone });
  if (!day.isValid) return [];
  const slots: Slot[] = [];
  for (const h of b.hours[String(day.weekday)] || []) {
    const start = DateTime.fromISO(`${date}T${h.open}`, { zone: b.timezone });
    const close = DateTime.fromISO(`${date}T${h.close}`, { zone: b.timezone });
    // Iterate real instants, not wall-clock strings, so repeated DST hours remain distinct.
    for (
      let t = start;
      t.plus({ minutes: service.duration + b.bufferMinutes }) <= close;
      t = t.plus({ minutes: 15 })
    ) {
      if (t.toMillis() <= now) continue;
      for (const r of b.resources)
        slots.push({
          start: t.toUTC().toISO()!,
          end: t.plus({ minutes: service.duration }).toUTC().toISO()!,
          resourceId: r.id,
        });
    }
  }
  return slots;
}
export async function availability(
  store: Store,
  b: Business,
  serviceId: string,
  date: string,
  now = Date.now(),
) {
  const slots = candidateSlots(b, serviceId, date, now);
  const locks = await store.db
    .collection("locks")
    .find({ businessId: b.id })
    .toArray();
  return slots.filter(
    (s) =>
      !locks.some(
        (l) =>
          l.resourceId === s.resourceId &&
          l.minute >= Date.parse(s.start) / 60000 &&
          l.minute < Date.parse(s.end) / 60000 + b.bufferMinutes,
      ),
  );
}
export type BookingInput = {
  businessId: string;
  serviceId: string;
  start: string;
  resourceId: string;
  callerId: string;
  name: string;
  phone: string;
  address?: string;
  key: string;
};
export async function book(store: Store, input: BookingInput) {
  const b = await store.business(input.businessId);
  if (!b) throw new Error("Business not found");
  const existing = await store.db
    .collection("appointments")
    .findOne({ businessId: b.id, key: input.key });
  if (existing) return existing;
  const service = b.services.find((s) => s.id === input.serviceId);
  if (!service) throw new Error("Unknown service");
  if (service.requiresAddress && !input.address)
    throw new Error("Address required");
  const date = DateTime.fromISO(input.start).setZone(b.timezone).toISODate()!;
  const slot = candidateSlots(b, service.id, date).find(
    (s) =>
      Date.parse(s.start) === Date.parse(input.start) &&
      s.resourceId === input.resourceId,
  );
  if (!slot) throw new Error("Invalid slot");
  const id = randomUUID();
  const locks = [];
  for (
    let minute = Date.parse(slot.start) / 60000;
    minute < Date.parse(slot.end) / 60000 + b.bufferMinutes;
    minute++
  )
    locks.push({
      businessId: b.id,
      resourceId: slot.resourceId,
      minute,
      appointmentId: id,
    });
  try {
    // Ordered insertion fails closed: partial locks are removed only for this reservation.
    await store.db.collection("locks").insertMany(locks, { ordered: true });
    const a = {
      ...input,
      ...slot,
      id,
      status: "booked",
      workflowId: `booking-${id}`,
      createdAt: new Date().toISOString(),
    };
    await store.db.collection("appointments").insertOne(a);
    return a;
  } catch {
    await store.db.collection("locks").deleteMany({ appointmentId: id });
    const retry = await store.db
      .collection("appointments")
      .findOne({ businessId: b.id, key: input.key });
    if (retry) return retry;
    throw new Error("Slot unavailable");
  }
}
export async function cancel(store: Store, id: string, callerId: string) {
  const a = await store.db.collection("appointments").findOne({ id, callerId });
  if (!a) throw new Error("Appointment not found");
  await store.db
    .collection("appointments")
    .updateOne({ id, callerId }, { $set: { status: "cancelled" } });
  await store.db.collection("locks").deleteMany({ appointmentId: id });
  return { id, status: "cancelled" };
}
export async function reschedule(
  store: Store,
  id: string,
  input: BookingInput,
) {
  const old = await store.db.collection("appointments").findOne({
    id,
    callerId: input.callerId,
    businessId: input.businessId,
    status: "booked",
  });
  if (!old) throw new Error("Appointment not found");
  const next = await book(store, input);
  await cancel(store, id, input.callerId);
  return next;
}
