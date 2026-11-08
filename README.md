# Binario Zero · Bike Rental Departure Board

Tabellone ferroviario a palette con logo Binario Zero e lettere/numeri arancioni
(`#ff5700`). Backend **PHP 8.2+**, database **SQLite**, frontend **React nel browser**.
Non servono Node.js, npm, Python, Composer o una compilazione JavaScript.

[Anteprima Full HD](docs/preview.png)

## Avvio immediato

Installare PHP con `PDO` e `pdo_sqlite`. Su Debian/Ubuntu: pacchetti `php-cli`
e `php-sqlite3`. Verificare con `php -v` e `php -m`.

```sh
php -S 0.0.0.0:8080 -t public router.php
```

Aprire `/board` sulla porta **8080**. In Codespaces inoltrare quella porta.
La modalità predefinita è DEMO: otto prenotazioni sintetiche, nessun dato reale.
Il server PHP integrato è per sviluppo; per produzione usare Apache o Nginx con PHP-FPM.

## Prenotazioni reali

Copiare `config/local.example.php` in `config/local.php` **solo se quest'ultimo non
esiste già**. Il file locale non va pubblicato in Git ed è esterno alla cartella web.
Impostare `BOARD_MODE=live`, il namespace BRM esatto, il fuso orario del negozio,
la chiave webhook, utente/password del tabellone e percorsi persistenti di database
e log. Si possono usare in alternativa variabili d'ambiente con gli stessi nomi.
Generare due segreti distinti:

```sh
php -r 'echo bin2hex(random_bytes(32)), PHP_EOL;'
```

Il tabellone live e `/api/board` richiedono HTTP Basic auth del nostro servizio,
separata dalle credenziali BRM. Non esporre dati reali senza HTTPS.

Endpoint conservati:

- `POST /api/webhooks/brm?key=CHIAVE_SEGRETA`: ricezione BRM.
- `GET /api/board`: prenotazioni del giorno, ordinate per ora.
- `GET /api/health`: verifica di liveness, senza dati personali.
- `/board`: display per televisore; `/` reindirizza qui.

Leggere [la guida webhook e hosting PHP](docs/brm-webhooks.md) prima della produzione.
Gli stati annullati effettivi restano da confermare con il consulente BRM: si mostrano
solo `status=ok`, `stage=confirmed/provisional`, `draft=false`. Gli altri stati sono
esclusi senza attribuire loro un significato non documentato.

## Test senza Node/Python

```sh
php tests/run.php
php tests/http.php
find app config public scripts tests -name '*.php' -print0 | xargs -0 -n1 php -l
```

Test facoltativo con Chromium installato e il server demo avviato:

```sh
php tests/browser.php http://127.0.0.1:8080/board
```

Il test browser è scritto in PHP e usa il protocollo Chrome DevTools: verifica
React, logo, arancione, righe demo, Full HD, orologio, mobile e movimento ridotto.
`CHROMIUM_BIN` permette di scegliere il binario Chromium del proprio sistema.

Con server e database **di test** configurati in modalità live:

```sh
php scripts/simulate.php create
php scripts/simulate.php update
php scripts/simulate.php exclude
php scripts/simulate.php tomorrow
```

`exclude` prova uno stato sconosciuto sintetico, non uno stato annullato BRM verificato.

## Televisore e interfaccia

Layout 1920×1080 al 100% di zoom, schermo intero, orologio del negozio, polling ogni
5 secondi. Più prodotti producono righe distinte, con rotazione di otto righe ogni
12 secondi. In caso di errore si conserva l'ultimo risultato con NON SINCRONIZZATO.
React/ReactDOM 18.3.1 sono distribuiti localmente con le rispettive licenze MIT:
nessuna CDN viene contattata dal televisore. JavaScript normale con `createElement`,
senza JSX/transpiler; CSS statico senza build Tailwind.

## Struttura

- `app/`: normalizzazione BRM, archivio, controller e pagina HTML.
- `public/`: unica document root pubblica, frontend React, CSS e logo.
- `config/local.example.php`: impostazioni da copiare sul server.
- `data/`: database e log privati, ignorati da Git.
- `tests/`: suite PHP e test browser opzionale.
- `scripts/simulate.php`: prenotazioni sintetiche inviate tramite HTTP.

Il database mantiene le tabelle della precedente versione. Prima di migrare un
archivio reale effettuare un backup SQLite coerente e provarne una copia; non
cancellare la cartella `data/` durante il deploy. La cronologia Git conserva la
precedente implementazione Next.js. I vecchi `node_modules`/`.next` locali possono
essere rimossi: non sono utilizzati dal progetto PHP.
