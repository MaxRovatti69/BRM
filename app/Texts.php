<?php
declare(strict_types=1);
namespace BinarioZero;

function renderBoard(?array $texts = null): string
{
    $texts ??= require dirname(__DIR__) . '/config/texts.php';
    if (!is_array($texts)) throw new \RuntimeException('Invalid dashboard texts');
    foreach ($texts as $key => $value) {
        if (!is_string($key) || !is_string($value)) throw new \RuntimeException('Dashboard texts must be strings');
    }
    // Keep content out of executable JavaScript and escape HTML delimiters even
    // inside the non-executable JSON script, including any user-entered </script>.
    $json = json_encode($texts, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    $escape = static fn(string $value): string => htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    ob_start();
    try { require __DIR__ . '/board.php'; return ob_get_contents(); }
    finally { ob_end_clean(); }
}
