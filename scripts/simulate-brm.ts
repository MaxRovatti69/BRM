import { DateTime } from "luxon";
import { fixture } from "../tests/fixtures/brm";

async function main() {
  const target = new URL(process.env.SIMULATOR_BASE_URL ?? "http://localhost:3000");
  if (!["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) && !process.argv.includes("--allow-remote")) {
    throw new Error("Remote simulation requires --allow-remote; use a staging database.");
  }
  if (target.protocol !== "https:" && !["localhost", "127.0.0.1", "[::1]"].includes(target.hostname)) {
    throw new Error("HTTPS required for remote simulation");
  }
  const token = process.env.WEBHOOK_URL_TOKEN;
  const namespace = process.env.BRM_NAMESPACE;
  if (!token || !namespace) throw new Error("Set WEBHOOK_URL_TOKEN and BRM_NAMESPACE locally");
  const action = process.argv[2] ?? "create";
  if (!["create", "update", "exclude", "tomorrow"].includes(action)) throw new Error("Use create, update, exclude or tomorrow");
  const now = DateTime.now().setZone(process.env.BRM_TIME_ZONE ?? "Europe/Rome");
  const f = fixture();
  f.namespace = namespace;
  f.reference = f.data.reference = `BOARD-SIM-${now.toISODate()}`;
  f.event = action === "create" ? "reservation.create" : "reservation.update";
  f.data.start_date = (action === "tomorrow" ? now.plus({ days: 1 }) : now).toISODate()!;
  f.data.start_time = action === "update" ? "11:45" : "09:30";
  f.data.created_ts = now.startOf("day").toMillis();
  f.data.updated_ts = Date.now();
  if (action === "exclude") f.data.status = "UNVERIFIED-TEST-STATE";
  const endpoint = new URL("/api/webhooks/brm", target);
  endpoint.searchParams.set("key", token);
  const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(f), signal: AbortSignal.timeout(10000) });
  const result = await response.json();
  console.log(JSON.stringify({ status: response.status, outcome: result.outcome, requestId: result.requestId }));
  if (!response.ok) process.exitCode = 1;
}

main().catch(() => { console.error("Simulation failed. Check configuration, action, server and staging access; no secrets logged."); process.exitCode = 1; });
