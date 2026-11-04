import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createHash } from "node:crypto";

/** Internal model only. The BRM adapter must map verified documented fields. */
export type Reservation = {
  sourceId: string;
  customerName: string;
  startsAt: string;
  cancelled: boolean;
  status: string;
  products: { name: string; quantity: number }[];
  sourceUpdatedAt?: number;
  stage?: string;
};

export class ReservationStore {
  private db: Database.Database;

  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new Database(path);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("busy_timeout = 5000");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS reservations (
        source_id TEXT PRIMARY KEY,
        customer_name TEXT NOT NULL,
        starts_at TEXT NOT NULL,
        cancelled INTEGER NOT NULL CHECK(cancelled IN (0,1)),
        status TEXT NOT NULL,
        products_json TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        received_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS reservations_start ON reservations(starts_at);
      CREATE TABLE IF NOT EXISTS reservation_versions (
        source_id TEXT PRIMARY KEY,
        source_updated_at INTEGER NOT NULL,
        stage TEXT NOT NULL
      );
    `);
  }

  save(reservation: Reservation): "inserted" | "updated" | "duplicate" | "stale" | "conflict" {
    if (!reservation.sourceId || !reservation.customerName.trim() ||
      !Number.isFinite(Date.parse(reservation.startsAt)) ||
      (!reservation.cancelled && !reservation.products.length) || reservation.products.some(p =>
        !p.name.trim() || !Number.isSafeInteger(p.quantity) || p.quantity < 1)) {
      throw new Error("Invalid normalized reservation");
    }
    const normalized = { ...reservation, startsAt: new Date(reservation.startsAt).toISOString() };
    const hash = createHash("sha256").update(JSON.stringify([
      normalized.customerName, normalized.startsAt, normalized.cancelled,
      normalized.status, normalized.stage ?? "", normalized.products.map(p => [p.name, p.quantity]),
    ])).digest("hex");
    return this.db.transaction(() => {
      const previous = this.db.prepare("SELECT content_hash FROM reservations WHERE source_id = ?")
        .get(normalized.sourceId) as { content_hash: string } | undefined;
      const version = this.db.prepare("SELECT source_updated_at FROM reservation_versions WHERE source_id = ?")
        .get(normalized.sourceId) as { source_updated_at: number } | undefined;
      if (version && normalized.sourceUpdatedAt !== undefined) {
        if (normalized.sourceUpdatedAt < version.source_updated_at) return "stale" as const;
        if (normalized.sourceUpdatedAt === version.source_updated_at && previous?.content_hash !== hash) return "conflict" as const;
      }
      if (normalized.sourceUpdatedAt !== undefined) {
        this.db.prepare(`INSERT INTO reservation_versions VALUES (?, ?, ?)
          ON CONFLICT(source_id) DO UPDATE SET source_updated_at=excluded.source_updated_at, stage=excluded.stage`)
          .run(normalized.sourceId, normalized.sourceUpdatedAt, normalized.stage ?? "");
      }
      if (previous?.content_hash === hash) return "duplicate" as const;
      this.db.prepare(`INSERT INTO reservations VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(source_id) DO UPDATE SET customer_name=excluded.customer_name,
        starts_at=excluded.starts_at, cancelled=excluded.cancelled, status=excluded.status,
        products_json=excluded.products_json, content_hash=excluded.content_hash,
        received_at=excluded.received_at`).run(normalized.sourceId, normalized.customerName,
        normalized.startsAt, Number(normalized.cancelled), normalized.status,
        JSON.stringify(normalized.products), hash, new Date().toISOString());
      return previous ? "updated" as const : "inserted" as const;
    })();
  }

  /** Half-open UTC interval; caller computes the selected local day's boundaries. */
  listBetween(from: Date, until: Date): Reservation[] {
    const rows = this.db.prepare(`SELECT r.*, v.source_updated_at, v.stage FROM reservations r
      LEFT JOIN reservation_versions v ON v.source_id = r.source_id
      WHERE cancelled = 0 AND starts_at >= ? AND starts_at < ? ORDER BY starts_at, source_id`)
      .all(from.toISOString(), until.toISOString()) as {
        source_id: string; customer_name: string; starts_at: string;
        cancelled: number; status: string; products_json: string; source_updated_at: number | null; stage: string | null;
      }[];
    return rows.map(row => ({ sourceId: row.source_id, customerName: row.customer_name,
      startsAt: row.starts_at, cancelled: Boolean(row.cancelled), status: row.status,
      products: JSON.parse(row.products_json),
      ...(row.source_updated_at !== null ? { sourceUpdatedAt: row.source_updated_at, stage: row.stage ?? "" } : {}),
    }));
  }

  close() { this.db.close(); }
}
