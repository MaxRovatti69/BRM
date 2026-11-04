import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { normalizeBrm, PayloadError } from "@/lib/brm";
import { getStore } from "@/lib/db";
import { equalSecret } from "@/lib/server-config";

export const runtime = "nodejs";
const MAX_BYTES = 256 * 1024;

export async function POST(request: NextRequest) {
  const requestId = randomUUID();
  const started = Date.now();
  const reply = (status: number, outcome: string) => {
    // Never log payloads, names, references, namespace, query strings or credentials.
    console.info(JSON.stringify({ component: "brm-webhook", requestId, status, outcome, durationMs: Date.now() - started }));
    return NextResponse.json({ outcome, requestId }, { status, headers: { "Cache-Control": "no-store" } });
  };
  const token = process.env.WEBHOOK_URL_TOKEN;
  const namespace = process.env.BRM_NAMESPACE;
  if (!token || token.length < 32 || !namespace) return reply(503, "not_configured");
  // Receiver-side URL capability, NOT a BRM signature/authentication feature.
  // BRM only documents a configurable Web URL. Verify delivery with its UI.
  if (!equalSecret(request.nextUrl.searchParams.get("key") ?? "", token)) return reply(401, "unauthorized");
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return reply(415, "expected_json");
  }
  if (Number(request.headers.get("content-length")) > MAX_BYTES) return reply(413, "payload_too_large");
  let raw: unknown;
  try {
    const reader = request.body?.getReader();
    if (!reader) return reply(400, "empty_body");
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BYTES) { await reader.cancel(); return reply(413, "payload_too_large"); }
      chunks.push(value);
    }
    raw = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch { return reply(400, "invalid_json"); }
  try {
    const normalized = normalizeBrm(raw, namespace, process.env.BRM_TIME_ZONE ?? "Europe/Rome");
    const outcome = getStore().save(normalized);
    return reply(outcome === "conflict" ? 409 : 200, outcome);
  } catch (error) {
    if (error instanceof PayloadError) return reply(400, error.code);
    return reply(503, "storage_unavailable");
  }
}
