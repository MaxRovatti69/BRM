<?php
declare(strict_types=1);

namespace BinarioZero;

require_once __DIR__ . '/Reservations.php';
require_once __DIR__ . '/Application.php';
require_once __DIR__ . '/Texts.php';

function configuration(): array
{
    $localPath = dirname(__DIR__) . '/config/local.php';
    $local = is_file($localPath) ? require $localPath : [];
    if (!is_array($local)) throw new \RuntimeException('Invalid configuration');
    $defaults = [
        'BOARD_MODE' => 'demo', 'BRM_TIME_ZONE' => 'Europe/Rome', 'BRM_NAMESPACE' => '',
        'WEBHOOK_URL_TOKEN' => '', 'BOARD_USERNAME' => 'board', 'BOARD_PASSWORD' => '',
        'DATABASE_PATH' => dirname(__DIR__) . '/data/reservations.sqlite',
        'WEBHOOK_LOG_PATH' => dirname(__DIR__) . '/data/webhooks.log',
    ];
    foreach ($defaults as $name => $value) {
        $environment = getenv($name);
        $defaults[$name] = $environment !== false ? $environment : ($local[$name] ?? $value);
    }
    if (!in_array($defaults['BOARD_MODE'], ['demo', 'live'], true)) throw new \RuntimeException('Invalid mode');
    new \DateTimeZone($defaults['BRM_TIME_ZONE']);
    return $defaults;
}
