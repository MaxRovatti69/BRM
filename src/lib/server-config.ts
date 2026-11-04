import { timingSafeEqual } from "node:crypto";

export function equalSecret(actual: string, expected: string) {
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function boardMode(): "live" | "demo" {
  const mode = process.env.BOARD_MODE ?? (process.env.NODE_ENV === "production" ? "live" : "demo");
  if (mode !== "live" && mode !== "demo") throw new Error("Invalid BOARD_MODE");
  return mode;
}

export function boardAuthorized(header: string | null) {
  const user = process.env.BOARD_USERNAME;
  const password = process.env.BOARD_PASSWORD;
  if (!user || !password || password.length < 16) return false;
  if (!header?.startsWith("Basic ")) return false;
  return equalSecret(header.slice(6), Buffer.from(`${user}:${password}`).toString("base64"));
}
