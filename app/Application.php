<?php
declare(strict_types=1);
namespace BinarioZero;

final class Response
{
    public function __construct(public int $status, public array $headers, public string $body) {}
}

final class Application
{
    public function __construct(private array $config) {}

    private function json(int $status, array $body, array $extra = []): Response
    {
        return new Response($status, array_merge(['Content-Type' => 'application/json; charset=utf-8', 'Cache-Control' => 'private, no-store'], $extra), json_encode($body, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR));
    }

    private function authorized(array $headers): bool
    {
        $header = $headers['authorization'] ?? '';
        $expected = base64_encode($this->config['BOARD_USERNAME'] . ':' . $this->config['BOARD_PASSWORD']);
        return str_starts_with($header, 'Basic ') && hash_equals($expected, substr($header, 6));
    }

    public function handle(string $method, string $path, array $headers = [], string $body = '', array $query = []): Response
    {
        $path = rtrim($path, '/') ?: '/';
        $headers = array_change_key_case($headers, CASE_LOWER);
        if ($path === '/api/webhooks/brm') {
            if ($method !== 'POST') return $this->json(405, ['error' => 'method_not_allowed'], ['Allow' => 'POST']);
            return $this->webhook($headers, $body, $query);
        }
        if (!in_array($method, ['GET', 'HEAD'], true)) return $this->json(405, ['error' => 'method_not_allowed'], ['Allow' => 'GET, HEAD']);
        if ($path === '/api/health') return $this->json(200, ['status' => 'ok']);
        if ($path === '/') return new Response(302, ['Location' => '/board', 'Cache-Control' => 'no-store'], '');
        if (!in_array($path, ['/board', '/api/board'], true)) return $this->json(404, ['error' => 'not_found']);
        if ($this->config['BOARD_MODE'] === 'live') {
            if ($this->config['BOARD_USERNAME'] === '' || strlen($this->config['BOARD_PASSWORD']) < 16) return $this->json(503, ['error' => 'board_not_configured']);
            if (!$this->authorized($headers)) return $this->json(401, ['error' => 'authentication_required'], ['WWW-Authenticate' => 'Basic realm="Binario Zero", charset="UTF-8"']);
        }
        if ($path === '/board') return new Response(200, ['Content-Type' => 'text/html; charset=utf-8', 'Cache-Control' => 'private, no-store'], file_get_contents(__DIR__ . '/board.html'));
        try {
            if ($this->config['BOARD_MODE'] === 'demo') $reservations = self::demo();
            else {
                if ($this->config['BRM_NAMESPACE'] === '') throw new \RuntimeException('Namespace not configured');
                $reservations = (new ReservationStore($this->config['DATABASE_PATH']))->today($this->config['BRM_NAMESPACE'], $this->config['BRM_TIME_ZONE']);
            }
            return $this->json(200, ['mode' => $this->config['BOARD_MODE'], 'zone' => $this->config['BRM_TIME_ZONE'], 'fetchedAt' => gmdate('Y-m-d\TH:i:s\Z'), 'reservations' => $reservations]);
        } catch (\Throwable) { return $this->json(503, ['error' => 'temporarily_unavailable']); }
    }

    private function webhook(array $headers, string $body, array $query): Response
    {
        $requestId = bin2hex(random_bytes(16));
        $started = microtime(true);
        $reply = function (int $status, string $outcome) use ($requestId, $started): Response {
            $entry = ['component' => 'brm-webhook', 'requestId' => $requestId, 'status' => $status, 'outcome' => $outcome, 'durationMs' => (int)round((microtime(true) - $started) * 1000)];
            try {
                $path = $this->config['WEBHOOK_LOG_PATH'];
                if (!is_dir(dirname($path))) mkdir(dirname($path), 0700, true);
                if (file_put_contents($path, json_encode($entry, JSON_THROW_ON_ERROR) . "\n", FILE_APPEND | LOCK_EX) === false) throw new \RuntimeException('Audit unavailable');
                chmod($path, 0600);
            } catch (\Throwable) { $status = 503; $outcome = 'audit_unavailable'; }
            return $this->json($status, ['outcome' => $outcome, 'requestId' => $requestId]);
        };
        $token = $this->config['WEBHOOK_URL_TOKEN'];
        if (strlen($token) < 32 || $this->config['BRM_NAMESPACE'] === '') return $reply(503, 'not_configured');
        if (!is_string($query['key'] ?? null) || !hash_equals($token, $query['key'])) return $reply(401, 'unauthorized');
        if (strtolower(trim(explode(';', $headers['content-type'] ?? '')[0])) !== 'application/json') return $reply(415, 'expected_json');
        if (strlen($body) > 262144 || (int)($headers['content-length'] ?? 0) > 262144) return $reply(413, 'payload_too_large');
        try { $input = json_decode($body, true, 32, JSON_THROW_ON_ERROR); }
        catch (\JsonException) { return $reply(400, 'invalid_json'); }
        if (!is_array($input) || array_is_list($input)) return $reply(400, 'invalid_payload');
        try {
            $reservation = Normalizer::normalize($input, $this->config['BRM_NAMESPACE'], $this->config['BRM_TIME_ZONE']);
            $outcome = (new ReservationStore($this->config['DATABASE_PATH']))->save($reservation);
            return $reply($outcome === 'conflict' ? 409 : 200, $outcome);
        } catch (PayloadError $error) { return $reply(400, $error->getMessage()); }
        catch (\Throwable) { return $reply(503, 'storage_unavailable'); }
    }

    private static function demo(): array
    {
        $data = [
            ['09:00', 'MARCO ROSSI', 'E-BIKE TREKKING', 2, 'PARTITO'],
            ['09:15', 'ANNA BIANCHI', 'CITY BIKE', 1, (int)floor(time()/30)%2 === 0 ? 'IN CONSEGNA' : 'PRONTO'],
            ['09:30', 'LUCA FERRARI', 'GRAVEL EXPLORER', 2, 'PRONTO'],
            ['10:00', 'GIULIA ROMANO', 'E-MTB ADVENTURE', 4, 'CONFERMATO'],
            ['10:15', 'THOMAS WEBER', 'E-BIKE TREKKING', 2, 'CONFERMATO'],
            ['10:30', 'SOFIA MORETTI', 'CITY BIKE', 3, 'CONFERMATO'],
            ['11:00', 'PAOLO CONTI', 'ROAD PERFORMANCE', 1, 'CONFERMATO'],
            ['11:30', 'ELENA RICCI', 'E-BIKE + SEGGIOLINO', 2, 'CONFERMATO'],
        ];
        return array_map(fn($r, $i) => ['id' => 'DEMO-' . $i, 'time' => $r[0], 'client' => $r[1], 'products' => [['name' => $r[2], 'quantity' => $r[3]]], 'status' => $r[4]], $data, array_keys($data));
    }
}
