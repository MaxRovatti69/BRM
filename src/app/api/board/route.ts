import { NextResponse } from "next/server";
import { bookings, demoStatus, timeLabel } from "@/lib/demo";
import { todayBounds } from "@/lib/brm";
import { getStore } from "@/lib/db";
import { boardMode } from "@/lib/server-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const headers = { "Cache-Control": "private, no-store, max-age=0" };
  const zone = process.env.BRM_TIME_ZONE ?? "Europe/Rome";
  if (boardMode() === "demo") {
    return NextResponse.json({ mode: "demo", zone, fetchedAt: new Date().toISOString(), reservations: bookings.map((b, i) => ({
      id: b.id, client: b.client, time: timeLabel(b.minutes), products: [{ name: b.product, quantity: b.quantity }],
      status: demoStatus(i, Math.floor(Date.now() / 30000)),
    })) }, { headers });
  }
  try {
    const { from, until } = todayBounds(zone);
    const namespace = process.env.BRM_NAMESPACE;
    if (!namespace) throw new Error("BRM_NAMESPACE not configured");
    const reservations = getStore().listBetween(from, until)
      .filter(r => { const identity = JSON.parse(r.sourceId); return Array.isArray(identity) && identity[0] === namespace; })
      .map(r => ({
      id: r.sourceId, client: r.customerName,
      time: new Date(r.startsAt).toLocaleTimeString("it-IT", { timeZone: zone, hour: "2-digit", minute: "2-digit" }),
      products: r.products,
      status: r.stage === "confirmed" ? "CONFERMATA" : "PROVVISORIA",
    }));
    return NextResponse.json({ mode: "live", zone, fetchedAt: new Date().toISOString(), reservations }, { headers });
  } catch {
    console.error(JSON.stringify({ component: "brm-board", outcome: "storage_unavailable" }));
    return NextResponse.json({ error: "temporarily_unavailable" }, { status: 503, headers });
  }
}
