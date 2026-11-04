import { z } from "zod";
import { DateTime } from "luxon";
import type { Reservation } from "./reservation-store";

const text = z.string().trim().min(1).max(200);
const timestamp = z.number().int().nonnegative().max(8640000000000000);
const item = z.object({ name: text, items: z.array(z.unknown()).max(200).optional() });
const schema = z.object({
  reference: text,
  namespace: text,
  event: z.enum(["reservation.create", "reservation.update"]),
  data: z.object({
    reference: text,
    stage: text,
    status: text,
    draft: z.boolean(),
    customer_first_name: z.string().trim().max(100),
    customer_last_name: z.string().trim().max(100),
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    start_time: z.string().regex(/^\d{2}:\d{2}$/),
    items: z.array(item).max(200),
    created_ts: timestamp,
    updated_ts: timestamp.nullable(),
  }),
});

export class PayloadError extends Error {
  constructor(public code: string) { super(code); }
}

export function normalizeBrm(input: unknown, namespace: string, zone: string): Reservation {
  const result = schema.safeParse(input);
  if (!result.success) throw new PayloadError("invalid_payload");
  const { data, ...envelope } = result.data;
  if (envelope.namespace !== namespace) throw new PayloadError("wrong_namespace");
  if (envelope.reference !== data.reference) throw new PayloadError("reference_mismatch");
  if (envelope.event === "reservation.update" && data.updated_ts === null) {
    throw new PayloadError("missing_update_timestamp");
  }
  const local = `${data.start_date}T${data.start_time}`;
  const start = DateTime.fromISO(local, { zone });
  if (!start.isValid || start.toFormat("yyyy-MM-dd'T'HH:mm") !== local || start.getPossibleOffsets().length !== 1) {
    throw new PayloadError("invalid_or_ambiguous_start_time");
  }
  const customerName = `${data.customer_first_name} ${data.customer_last_name}`.trim();
  if (!customerName) throw new PayloadError("missing_customer_name");
  // Each documented top-level item is one rented inventory item. Do not infer
  // quantities from undocumented fields or double-count nested item contents.
  const grouped = new Map<string, number>();
  for (const entry of data.items) grouped.set(entry.name, (grouped.get(entry.name) ?? 0) + 1);
  return {
    sourceId: JSON.stringify([envelope.namespace, envelope.reference]),
    customerName,
    startsAt: start.toUTC().toISO()!,
    // No cancellation enum is documented. Fail closed: only the documented
    // status "ok" and stages provisional/confirmed can reach the real board.
    cancelled: data.draft || data.status !== "ok" || !["provisional", "confirmed"].includes(data.stage),
    status: data.status,
    stage: data.stage,
    products: [...grouped].sort(([a], [b]) => a.localeCompare(b)).map(([name, quantity]) => ({ name, quantity })),
    sourceUpdatedAt: data.updated_ts ?? data.created_ts,
  };
}

export function todayBounds(zone: string, now: DateTime = DateTime.now()) {
  const start = now.setZone(zone).startOf("day");
  if (!start.isValid) throw new Error("Invalid BRM_TIME_ZONE");
  return { from: start.toJSDate(), until: start.plus({ days: 1 }).toJSDate() };
}
