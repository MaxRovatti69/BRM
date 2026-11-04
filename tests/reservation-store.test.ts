import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ReservationStore, type Reservation } from "../src/lib/reservation-store";

const sample: Reservation = { sourceId: "synthetic-1", customerName: "CLIENTE DI TEST",
  startsAt: "2026-11-04T08:00:00.000Z", cancelled: false, status: "TEST",
  products: [{ name: "BICI TEST", quantity: 2 }, { name: "CASCO TEST", quantity: 1 }] };
const from = new Date("2026-11-03T23:00:00Z");
const until = new Date("2026-11-04T23:00:00Z");

test("persistence, retries, updates and multiple products", () => {
  const dir = mkdtempSync(join(tmpdir(), "brm-store-"));
  let store = new ReservationStore(join(dir, "test.sqlite"));
  try {
    assert.equal(store.save(sample), "inserted");
    assert.equal(store.save(sample), "duplicate");
    assert.equal(store.listBetween(from, until).length, 1);
    store.close();
    store = new ReservationStore(join(dir, "test.sqlite"));
    assert.deepEqual(store.listBetween(from, until), [sample]);
    const changed = { ...sample, products: [{ name: "GRAVEL TEST", quantity: 3 }] };
    assert.equal(store.save(changed), "updated");
    assert.deepEqual(store.listBetween(from, until), [changed]);
    assert.equal(store.save({ ...changed, cancelled: true }), "updated");
    assert.deepEqual(store.listBetween(from, until), []);
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test("day boundaries, time sorting and independent reservation identities", () => {
  const store = new ReservationStore(":memory:");
  try {
    store.save(sample);
    store.save({ ...sample, sourceId: "earlier", startsAt: from.toISOString() });
    store.save({ ...sample, sourceId: "tomorrow", startsAt: until.toISOString() });
    assert.deepEqual(store.listBetween(from, until).map(r => r.sourceId), ["earlier", sample.sourceId]);
  } finally { store.close(); }
});

test("rejects invalid normalized inputs without storing them", () => {
  const store = new ReservationStore(":memory:");
  try {
    for (const patch of [{ sourceId: "" }, { startsAt: "invalid" }, { products: [] },
      { products: [{ name: "BICI", quantity: -1 }] }]) {
      assert.throws(() => store.save({ ...sample, ...patch }));
    }
    assert.deepEqual(store.listBetween(from, until), []);
  } finally { store.close(); }
});
