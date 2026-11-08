<!doctype html>
<html lang="it">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#ff5700">
    <title><?= $escape($texts['titolo_scheda']) ?></title>
    <meta name="description" content="<?= $escape($texts['descrizione_scheda']) ?>">
    <link rel="stylesheet" href="/assets/board.css">
    <script id="board-texts" type="application/json"><?= $json ?></script>
    <script defer src="/assets/vendor/react.production.min.js"></script>
    <script defer src="/assets/vendor/react-dom.production.min.js"></script>
    <script defer src="/assets/board.js"></script>
</head>
<body><div id="root"></div><noscript><?= $escape($texts['javascript_disattivato']) ?></noscript></body>
</html>
