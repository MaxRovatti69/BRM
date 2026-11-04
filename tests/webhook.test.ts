import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { POST } from "../src/app/api/webhooks/brm/route";
import { GET } from "../src/app/api/board/route";
import { proxy } from "../src/proxy";
import { fixture } from "./fixtures/brm";

test("HTTP handlers: auth, validation, idempotency, updates, day filtering, privacy and board protection", async () => {
  const dir = mkdtempSync(join(tmpdir(), "brm-http-"));
  const previous = { ...process.env };
  const logs: string[] = [];
  const log = console.info;
  console.info = value => { logs.push(String(value)); };
  Object.assign(process.env, { DATABASE_PATH: join(dir, "db.sqlite"), BRM_NAMESPACE: "test-store",
    WEBHOOK_URL_TOKEN: "a".repeat(64), BOARD_MODE: "live", BOARD_USERNAME: "board", BOARD_PASSWORD: "b".repeat(32) });
  const send = (body: string, key = "a".repeat(64), type = "application/json") => POST(new NextRequest(
    `http://localhost/api/webhooks/brm?key=${key}`, { method: "POST", headers: { "Content-Type": type }, body }));
  try {
    assert.equal((await send("{}", "wrong")).status, 401);
    assert.equal((await send("{}", undefined, "text/plain")).status, 415);
    assert.equal((await send("{" )).status, 400);
    assert.equal((await send("x".repeat(262145))).status, 413);
    assert.equal((await send("{}" )).status, 400);
    const f = fixture();
    f.data.start_date = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    assert.equal((await (await send(JSON.stringify(f))).json()).outcome, "inserted");
    assert.equal((await (await send(JSON.stringify(f))).json()).outcome, "duplicate");
    let board = await (await GET()).json();
    assert.equal(board.reservations.length, 1);
    assert.equal(board.reservations[0].products.length, 2);
    f.event = "reservation.update"; f.data.updated_ts += 1000;
    f.data.start_time = "10:30";
    await send(JSON.stringify(f));
    board = await (await GET()).json();
    assert.equal(board.reservations[0].time, "10:30");
    f.data.status = "UNVERIFIED-CANCEL-EXAMPLE"; f.data.updated_ts += 1000;
    await send(JSON.stringify(f));
    assert.equal((await (await GET()).json()).reservations.length, 0);
    f.data.status = "ok"; f.data.start_date = "2020-01-01"; f.data.updated_ts += 1000;
    await send(JSON.stringify(f));
    assert.equal((await (await GET()).json()).reservations.length, 0);
    assert.equal(proxy(new NextRequest("http://localhost/board")).status, 401);
    assert.equal(proxy(new NextRequest("http://localhost/api/board", { headers: {
      authorization: `Basic ${Buffer.from(`board:${"b".repeat(32)}`).toString("base64")}`,
    } })).status, 200);
    delete process.env.WEBHOOK_URL_TOKEN;
    assert.equal((await send("{}")).status, 503);
    const recorded = logs.join(" ");
    for (const sensitive of ["SIMULATO", "TEST-001", "test-store", "do-not-store", "a".repeat(64)]) assert.equal(recorded.includes(sensitive), false);
  } finally {
    console.info = log;
    for (const key of ["DATABASE_PATH", "BRM_NAMESPACE", "WEBHOOK_URL_TOKEN", "BOARD_MODE", "BOARD_USERNAME", "BOARD_PASSWORD"]) {
      if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
    }
    rmSync(dir, { recursive: true, force: true });
  }
});
