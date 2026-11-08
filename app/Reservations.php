<?php
declare(strict_types=1);
namespace BinarioZero;

final class PayloadError extends \RuntimeException {}

final class Normalizer
{
    private static function text(mixed $value, int $max = 200, bool $empty = false): string
    {
        if (!is_string($value) || strlen($value) > $max * 4 || preg_match('/[\x00-\x1F\x7F]/u', $value)) throw new PayloadError('invalid_text');
        $value = trim($value);
        if (!$empty && $value === '') throw new PayloadError('missing_text');
        return $value;
    }

    public static function normalize(array $input, string $namespace, string $zone): array
    {
        $reference = self::text($input['reference'] ?? null);
        if (self::text($input['namespace'] ?? null) !== $namespace) throw new PayloadError('wrong_namespace');
        $event = $input['event'] ?? null;
        if (!in_array($event, ['reservation.create', 'reservation.update'], true)) throw new PayloadError('unsupported_event');
        $d = $input['data'] ?? null;
        if (!is_array($d) || array_is_list($d)) throw new PayloadError('invalid_payload');
        if (self::text($d['reference'] ?? null) !== $reference) throw new PayloadError('reference_mismatch');
        $stage = self::text($d['stage'] ?? null);
        $status = self::text($d['status'] ?? null);
        if (!isset($d['draft']) || !is_bool($d['draft'])) throw new PayloadError('invalid_draft');
        $name = trim(self::text($d['customer_first_name'] ?? null, 100, true) . ' ' . self::text($d['customer_last_name'] ?? null, 100, true));
        if ($name === '') throw new PayloadError('missing_customer_name');
        $date = self::text($d['start_date'] ?? null);
        $time = self::text($d['start_time'] ?? null);
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/D', $date) || !preg_match('/^\d{2}:\d{2}$/D', $time)) throw new PayloadError('invalid_start_time');
        $local = "$date $time";
        $naive = \DateTimeImmutable::createFromFormat('!Y-m-d H:i', $local, new \DateTimeZone('UTC'));
        if (!$naive || $naive->format('Y-m-d H:i') !== $local) throw new PayloadError('invalid_start_time');
        $tz = new \DateTimeZone($zone);
        $transitions = $tz->getTransitions($naive->getTimestamp() - 86400, $naive->getTimestamp() + 86400);
        $offsets = $transitions ? array_unique(array_column($transitions, 'offset')) : [$tz->getOffset($naive)];
        $candidates = [];
        foreach ($offsets as $offset) {
            $candidate = (new \DateTimeImmutable('@' . ($naive->getTimestamp() - $offset)))->setTimezone($tz);
            if ($candidate->format('Y-m-d H:i') === $local) $candidates[$candidate->getTimestamp()] = $candidate;
        }
        if (count($candidates) !== 1) throw new PayloadError('invalid_or_ambiguous_start_time');
        $start = array_values($candidates)[0]->setTimezone(new \DateTimeZone('UTC'))->format('Y-m-d\TH:i:s.v\Z');
        foreach (['created_ts', 'updated_ts'] as $field) {
            if (!array_key_exists($field, $d) || ($field === 'created_ts' || $d[$field] !== null) && (!is_int($d[$field]) || $d[$field] < 0 || $d[$field] > 8640000000000000)) throw new PayloadError('invalid_timestamp');
        }
        if ($event === 'reservation.update' && $d['updated_ts'] === null) throw new PayloadError('missing_update_timestamp');
        $items = $d['items'] ?? null;
        if (!is_array($items) || !array_is_list($items) || count($items) > 200) throw new PayloadError('invalid_items');
        $grouped = [];
        foreach ($items as $item) {
            if (!is_array($item)) throw new PayloadError('invalid_item');
            $product = self::text($item['name'] ?? null);
            $key = 'product:' . $product;
            if (!isset($grouped[$key])) $grouped[$key] = ['name' => $product, 'quantity' => 0];
            $grouped[$key]['quantity']++;
        }
        $products = array_values($grouped);
        usort($products, fn($a, $b) => strcmp($a['name'], $b['name']));
        $excluded = $d['draft'] || $status !== 'ok' || !in_array($stage, ['confirmed', 'provisional'], true);
        if (!$excluded && !$products) throw new PayloadError('missing_products');
        return [
            'sourceId' => json_encode([$namespace, $reference], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
            'customerName' => $name, 'startsAt' => $start, 'cancelled' => $excluded,
            'status' => $status, 'stage' => $stage, 'products' => $products,
            'sourceUpdatedAt' => $d['updated_ts'] ?? $d['created_ts'],
        ];
    }
}

final class ReservationStore
{
    private \PDO $db;
    public function __construct(string $path)
    {
        if ($path !== ':memory:') {
            $parent = dirname($path);
            if (!is_dir($parent) && !mkdir($parent, 0700, true) && !is_dir($parent)) throw new \RuntimeException('Storage unavailable');
        }
        $this->db = new \PDO('sqlite:' . $path, null, null, [\PDO::ATTR_ERRMODE => \PDO::ERRMODE_EXCEPTION, \PDO::ATTR_DEFAULT_FETCH_MODE => \PDO::FETCH_ASSOC]);
        $this->db->exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
        $this->db->exec('CREATE TABLE IF NOT EXISTS reservations (source_id TEXT PRIMARY KEY, customer_name TEXT NOT NULL, starts_at TEXT NOT NULL, cancelled INTEGER NOT NULL CHECK(cancelled IN (0,1)), status TEXT NOT NULL, products_json TEXT NOT NULL, content_hash TEXT NOT NULL, received_at TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS reservations_start ON reservations(starts_at);
        CREATE TABLE IF NOT EXISTS reservation_versions (source_id TEXT PRIMARY KEY, source_updated_at INTEGER NOT NULL, stage TEXT NOT NULL);');
        if ($path !== ':memory:') chmod($path, 0600);
    }

    public function save(array $r): string
    {
        // Same tables and hash structure as the previous backend: existing SQLite
        // archives can be reused, after a coherent backup and migration check.
        $hash = hash('sha256', json_encode([$r['customerName'], $r['startsAt'], $r['cancelled'], $r['status'], $r['stage'], array_map(fn($p) => [$p['name'], $p['quantity']], $r['products'])], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR));
        $this->db->exec('BEGIN IMMEDIATE');
        try {
            $q = $this->db->prepare('SELECT r.*, v.source_updated_at, v.stage FROM reservations r LEFT JOIN reservation_versions v ON v.source_id=r.source_id WHERE r.source_id=?');
            $q->execute([$r['sourceId']]); $old = $q->fetch();
            $same = $old && ($hash === $old['content_hash'] || $this->equivalent($old, $r));
            if ($old && $old['source_updated_at'] !== null) {
                if ($r['sourceUpdatedAt'] < $old['source_updated_at']) { $this->db->exec('COMMIT'); return 'stale'; }
                if ($r['sourceUpdatedAt'] === (int)$old['source_updated_at'] && !$same) { $this->db->exec('COMMIT'); return 'conflict'; }
            }
            $q = $this->db->prepare('INSERT INTO reservation_versions VALUES (?,?,?) ON CONFLICT(source_id) DO UPDATE SET source_updated_at=excluded.source_updated_at,stage=excluded.stage');
            $q->execute([$r['sourceId'], $r['sourceUpdatedAt'], $r['stage']]);
            if ($same) { $this->db->exec('COMMIT'); return 'duplicate'; }
            $q = $this->db->prepare('INSERT INTO reservations VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(source_id) DO UPDATE SET customer_name=excluded.customer_name,starts_at=excluded.starts_at,cancelled=excluded.cancelled,status=excluded.status,products_json=excluded.products_json,content_hash=excluded.content_hash,received_at=excluded.received_at');
            $q->execute([$r['sourceId'], $r['customerName'], $r['startsAt'], (int)$r['cancelled'], $r['status'], json_encode($r['products'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR), $hash, gmdate('c')]);
            $this->db->exec('COMMIT'); return $old ? 'updated' : 'inserted';
        } catch (\Throwable $e) { $this->db->exec('ROLLBACK'); throw $e; }
    }

    private function equivalent(array $old, array $r): bool
    {
        $products = json_decode($old['products_json'], true, 32, JSON_THROW_ON_ERROR);
        usort($products, fn($a, $b) => strcmp($a['name'], $b['name']));
        return $old['customer_name'] === $r['customerName'] && $old['starts_at'] === $r['startsAt']
            && (bool)$old['cancelled'] === $r['cancelled'] && $old['status'] === $r['status']
            && ($old['stage'] ?? '') === $r['stage'] && $products === $r['products'];
    }
    public function today(string $namespace, string $zone, ?\DateTimeImmutable $now = null): array
    {
        $tz = new \DateTimeZone($zone);
        $day = ($now ?? new \DateTimeImmutable())->setTimezone($tz)->setTime(0, 0);
        $utc = new \DateTimeZone('UTC');
        $q = $this->db->prepare('SELECT r.*,v.stage FROM reservations r LEFT JOIN reservation_versions v ON v.source_id=r.source_id WHERE r.cancelled=0 AND r.starts_at>=? AND r.starts_at<? ORDER BY r.starts_at,r.source_id');
        $q->execute([$day->setTimezone($utc)->format('Y-m-d\TH:i:s.v\Z'), $day->modify('+1 day')->setTimezone($utc)->format('Y-m-d\TH:i:s.v\Z')]);
        $rows = [];
        foreach ($q as $r) {
            if ((json_decode($r['source_id'], true, 32, JSON_THROW_ON_ERROR)[0] ?? null) !== $namespace) continue;
            $rows[] = ['id' => $r['source_id'], 'client' => $r['customer_name'], 'time' => (new \DateTimeImmutable($r['starts_at']))->setTimezone($tz)->format('H:i'), 'products' => json_decode($r['products_json'], true, 32, JSON_THROW_ON_ERROR), 'status' => $r['stage'] === 'confirmed' ? 'CONFERMATA' : 'PROVVISORIA'];
        }
        return $rows;
    }
}
