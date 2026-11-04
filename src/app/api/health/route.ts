import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export function GET() {
  // Liveness only; does not expose or read bookings.
  return NextResponse.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
}
