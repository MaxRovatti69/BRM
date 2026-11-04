import { test } from "node:test";
import assert from "node:assert/strict";
import { DateTime } from "luxon";
import { normalizeBrm, todayBounds } from "../src/lib/brm";
import { ReservationStore } from "../src/lib/reservation-store";
import { fixture } from "./fixtures/brm";

test("official envelope, Italian time, grouping, and minimization", () => {
  const r = normalizeBrm(fixture(), "test-store", "Europe/Rome");
  assert.equal(r.customerName, "CLIENTE SIMULATO");
  assert.equal(r.startsAt, "2026-11-04T08:30:00.000Z");
  assert.deepEqual(r.products, [{ name: "CASCO", quantity: 1 }, { name: "E-BIKE", quantity: 2 }]);
  assert.equal(JSON.stringify(r).includes("do-not-store"), false);
  assert.equal(JSON.stringify(r).includes("DO-NOT-STORE"), false);
  assert.equal(r.cancelled, false);
});

test("unknown statuses, draft and undocumented stages stay off the board", () => {
  for (const patch of [{ status: "UNVERIFIED-CANCEL-EXAMPLE" }, { draft: true }, { stage: "unknown" }]) {
    const f = fixture(); Object.assign(f.data, patch);
    assert.equal(normalizeBrm(f, "test-store", "Europe/Rome").cancelled, true);
  }
});

test("rejects wrong namespace, mismatched reference, malformed data and other events", () => {
  for (const patch of [{ namespace: "other" }, { reference: "other" }, { event: "customer.create" }, { data: {} }]) {
    assert.throws(() => normalizeBrm({ ...fixture(), ...patch }, "test-store", "Europe/Rome"));
  }
});

test("rejects ambiguous and nonexistent DST times, invalid calendar dates", () => {
  for (const [start_date, start_time] of [["2026-03-29", "02:30"], ["2026-10-25", "02:30"], ["2026-02-30", "09:00"]]) {
    const f = fixture(); Object.assign(f.data, { start_date, start_time });
    assert.throws(() => normalizeBrm(f, "test-store", "Europe/Rome"));
  }
});

test("local day ranges respect 23 and 25 hour DST days", () => {
  for (const [date, hours] of [["2026-03-29", 23], ["2026-10-25", 25]] as const) {
    const bounds = todayBounds("Europe/Rome", DateTime.fromISO(date, { zone: "Europe/Rome" }));
    assert.equal((+bounds.until - +bounds.from) / 3600000, hours);
  }
});

test("out-of-order events, conflicting versions, duplicate retries and update-before-create", () => {
  const store = new ReservationStore(":memory:");
  try {
    const original = normalizeBrm(fixture(), "test-store", "Europe/Rome");
    assert.equal(store.save(original), "inserted");
    const updated = { ...original, sourceUpdatedAt: original.sourceUpdatedAt! + 1000, customerName: "CLIENTE MODIFICATO" };
    assert.equal(store.save(updated), "updated");
    assert.equal(store.save(original), "stale");
    assert.equal(store.save(updated), "duplicate");
    assert.equal(store.save({ ...updated, customerName: "CONFLITTO" }), "conflict");
    assert.equal(store.listBetween(new Date("2026-11-04"), new Date("2026-11-05"))[0].customerName, updated.customerName);
    const firstUpdate = { ...updated, sourceId: "another-reservation" };
    assert.equal(store.save(firstUpdate), "inserted");
  } finally { store.close(); }
});

test("newer no-op events advance version and block older conflicting updates", () => {
  const store = new ReservationStore(":memory:");
  try {
    const r = normalizeBrm(fixture(), "test-store", "Europe/Rome");
    store.save(r);
    assert.equal(store.save({ ...r, sourceUpdatedAt: r.sourceUpdatedAt! + 2000 }), "duplicate");
    assert.equal(store.save({ ...r, customerName: "VECCHIO", sourceUpdatedAt: r.sourceUpdatedAt! + 1000 }), "stale");
  } finally { store.close(); }
});
