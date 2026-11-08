<?php
declare(strict_types=1);
// Development only. Production document root must be public/.
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$file = realpath(__DIR__ . '/public' . rawurldecode($path));
if (str_starts_with($path, '/assets/') && $file && str_starts_with($file, __DIR__ . '/public/assets/') && is_file($file)) return false;
require __DIR__ . '/public/index.php';
