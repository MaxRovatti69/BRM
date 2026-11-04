import { NextRequest, NextResponse } from "next/server";
import { boardAuthorized, boardMode } from "./lib/server-config";

export function proxy(request: NextRequest) {
  if (boardMode() === "demo") return NextResponse.next();
  if (!process.env.BOARD_USERNAME || (process.env.BOARD_PASSWORD?.length ?? 0) < 16) {
    return new NextResponse("Configurare le credenziali del tabellone", { status: 503 });
  }
  if (!boardAuthorized(request.headers.get("authorization"))) {
    return new NextResponse("Accesso riservato al tabellone", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="BRM Board", charset="UTF-8"', "Cache-Control": "no-store" },
    });
  }
  return NextResponse.next();
}

export const config = { matcher: ["/board/:path*", "/api/board/:path*"] };
