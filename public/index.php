<?php
declare(strict_types=1);
use BinarioZero\Application;
use BinarioZero\Response;
use function BinarioZero\configuration;

umask(0077);
ini_set('display_errors', '0');
require dirname(__DIR__) . '/app/bootstrap.php';
try {
    $headers = function_exists('getallheaders') ? getallheaders() : [];
    $headers = array_change_key_case($headers, CASE_LOWER);
    foreach (['CONTENT_TYPE' => 'content-type', 'CONTENT_LENGTH' => 'content-length', 'HTTP_AUTHORIZATION' => 'authorization', 'REDIRECT_HTTP_AUTHORIZATION' => 'authorization'] as $key => $name) {
        if (isset($_SERVER[$key]) && !isset($headers[$name])) $headers[$name] = $_SERVER[$key];
    }
    if (!isset($headers['authorization']) && isset($_SERVER['PHP_AUTH_USER'], $_SERVER['PHP_AUTH_PW'])) $headers['authorization'] = 'Basic ' . base64_encode($_SERVER['PHP_AUTH_USER'] . ':' . $_SERVER['PHP_AUTH_PW']);
    $body = file_get_contents('php://input', false, null, 0, 262145);
    $response = (new Application(configuration()))->handle($_SERVER['REQUEST_METHOD'] ?? 'GET', parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/', $headers, $body === false ? '' : $body, $_GET);
} catch (Throwable) { $response = new Response(503, ['Content-Type' => 'application/json', 'Cache-Control' => 'no-store'], '{"error":"service_unavailable"}'); }
http_response_code($response->status);
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');
header("Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'");
foreach ($response->headers as $name => $value) header($name . ': ' . $value);
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'HEAD') echo $response->body;
