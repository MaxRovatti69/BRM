<?php
// Copy to config/local.php, outside the web document root. Never commit secrets.
return [
    'BOARD_MODE' => 'demo', // Change to live only after configuration.
    'BRM_TIME_ZONE' => 'Europe/Rome',
    'BRM_NAMESPACE' => '',
    'WEBHOOK_URL_TOKEN' => '', // At least 32 random characters.
    'BOARD_USERNAME' => 'board',
    'BOARD_PASSWORD' => '', // At least 16 random characters, distinct from webhook key.
    'DATABASE_PATH' => dirname(__DIR__) . '/data/reservations.sqlite',
    'WEBHOOK_LOG_PATH' => dirname(__DIR__) . '/data/webhooks.log',
];
