# Webhook BRM su hosting PHP

## Formato e regole mantenute

Fonti: testo degli articoli ufficiali fornito dall'utente:

- https://support.bikerentalmanager.com/support/solutions/articles/42000086513-setting-up-webhooks
- https://brm2.bikerentalmanager.com/support/solutions/articles/42000088506-example-of-reservation-json-data-sent-by-webhook

L'endpoint riceve `reservation.create` e `reservation.update` con `namespace`,
`reference` e `data`. Usa `customer_first_name`, `customer_last_name`,
`items[].name`, `start_date`, `start_time`, `created_ts` e `updated_ts`.
Gli altri dati personali/finanziari del payload non vengono salvati.
Ogni item di primo livello vale una unità; nomi uguali sono raggruppati. I nested
items non vengono contati due volte. Verificare payload reali per eventuali bundle
o inventario generico con semantiche differenti.

Identità: coppia namespace/reference; snapshot completi con versione in millisecondi.
Invii ripetuti non creano duplicati. Versioni vecchie sono ignorate; una stessa
versione con contenuti differenti restituisce 409. Gli update richiedono updated_ts
non nullo. Cambi di reference o update parziali non sono documentati dagli articoli.

Gli stati annullati **non sono ancora verificati**. Si mostrano soltanto status=ok,
stage=confirmed/provisional e draft=false. Gli altri casi restano archiviati ma
nascosti; il campo interno `cancelled` è un flag di esclusione, non un enum BRM.
Se BRM mantenesse questi stessi valori dopo un annullamento, la regola andrà corretta:
attendere il riscontro del consulente prima di considerare completa questa funzione.

Il fuso è BRM_TIME_ZONE (Europe/Rome di default); giorni locali con cambio dell'ora
sono gestiti. Orari ambigui/inesistenti sono rifiutati invece di essere spostati
silenziosamente. I webhook non importano automaticamente le prenotazioni storiche.

## Configurazione privata

`config/local.php` contiene un array PHP con le chiavi dell'esempio. Deve stare
fuori dalla document root ed essere leggibile solo dall'utente del servizio.
Le variabili d'ambiente con gli stessi nomi hanno precedenza. Non usare il vecchio
`.env.local` della versione Node: PHP non lo legge.

- BOARD_MODE: demo oppure live, impostarlo esplicitamente sul server.
- BRM_NAMESPACE: valore esatto del proprio payload.
- BRM_TIME_ZONE: fuso del negozio.
- WEBHOOK_URL_TOKEN: almeno 32 caratteri casuali.
- BOARD_USERNAME / BOARD_PASSWORD: credenziali proprie del tabellone, password >=16.
- DATABASE_PATH: file SQLite su disco persistente fuori dalla document root.
- WEBHOOK_LOG_PATH: file JSON lines privato, fuori dalla document root.

La chiave `?key=...` è una protezione del nostro ricevitore, **non una firma BRM**.
Gli articoli non documentano firme, header auth, IP sorgenti o retry. La compatibilità
della query va verificata con una consegna reale da BRM. Non può essere certificata
crittograficamente l'origine delle richieste: chi conosce l'URL completo può inviarle.
Usare HTTPS, chiavi casuali, limiti al proxy e rotazione in caso di esposizione.

Limite corpo: 256 KiB. JSON e campi sono validati; query non scalari vengono rifiutate.
Risposte: 200 persistito/duplicato/vecchio, 400 JSON/schema, 401 chiave, 409 conflitto,
413 corpo, 415 content-type, 503 configurazione/database/log non disponibili.
Gli eventi Customer non sono accettati. Database e log non contengono email, telefoni,
dati Stripe o payload originali.

Log applicativo: component/requestId/status/outcome/durationMs; niente nomi, reference,
namespace, chiavi o URL. Controllare anche log Apache/Nginx/hosting e APM: non devono
registrare query string o header di autorizzazione. Il server PHP integrato è soltanto
per test e può registrare gli URL: non usarlo con segreti o clienti reali in produzione.
Configurare rotazione dei log, backup SQLite coerenti, conservazione dei dati e accessi.

## Pubblicazione Apache/PHP su hosting esistente

Requisiti: PHP 8.2+ con PDO SQLite, filesystem persistente locale scrivibile, HTTPS.
Non occorre un processo Node sempre attivo. Apache/PHP-FPM esegue le richieste PHP
quando arrivano; SQLite conserva i dati tra le richieste e tra i riavvii.

1. Caricare il progetto e configurare il dominio/sottodominio con **document root
   impostata su `public/`**, ad esempio `/home/account/binario-zero/public`.
2. Abilitare mod_rewrite e AllowOverride per leggere `public/.htaccess`, che mantiene
   i percorsi `/board` e `/api/...`. L'header Authorization deve arrivare a PHP.
3. Creare `config/local.php` con le variabili reali e BOARD_MODE=live.
4. Rendere scrivibile `data/` solo per l'utente PHP (mai permessi 777). Database,
   configurazione e log devono restare esterni a public/. Se l'hosting impone
   public_html, farlo puntare a public/ oppure chiedere al provider una struttura
   equivalente che mantenga app/config/data fuori dal percorso accessibile via web.
   Non caricare semplicemente tutto nella document root del sito.
5. Eseguire `php tests/run.php` via terminale se disponibile. Aprire `/api/health`
   e poi `/board`, autenticandosi con l'utente del tabellone.
6. Provare su staging con `php scripts/simulate.php create/update/exclude/tomorrow`,
   un comando alla volta, e verificare aggiornamento e conservazione dopo riavvio.
7. Configurare un webhook BRM distinto da quello Stripe e verificare una consegna reale.
   Confermare con il consulente lo stato annullato prima dell'uso operativo.

La documentazione presume il tabellone alla radice di un dominio/sottodominio;
i percorsi assoluti del frontend non supportano un'installazione sotto `/sottocartella`.
Usare ad esempio un sottodominio dedicato, il cui nome sarà scelto dal proprietario.

## Nginx con PHP-FPM

Esempio da adattare a socket/versione PHP e server HTTPS effettivi; non è stato
installato sul dominio dell'utente. Nel contesto http:

```nginx
limit_req_zone $binary_remote_addr zone=brm_webhooks:10m rate=5r/s;
log_format brm_safe '$time_iso8601 $request_method $uri $status';
```

Nel blocco server HTTPS già configurato con certificato:

```nginx
root /srv/binario-zero/public;
index index.php;
access_log /var/log/nginx/binario-zero.log brm_safe;
client_max_body_size 256k;
client_body_timeout 10s;
location = /api/webhooks/brm {
    limit_req zone=brm_webhooks burst=50 nodelay;
    limit_req_status 429;
    include fastcgi_params;
    fastcgi_param SCRIPT_FILENAME $document_root/index.php;
    fastcgi_param HTTP_AUTHORIZATION $http_authorization;
    fastcgi_pass unix:/run/php/php8.2-fpm.sock;
}
location / { try_files $uri /index.php?$query_string; }
location = /index.php {
    include fastcgi_params;
    fastcgi_param SCRIPT_FILENAME $document_root/index.php;
    fastcgi_param HTTP_AUTHORIZATION $http_authorization;
    fastcgi_pass unix:/run/php/php8.2-fpm.sock;
}
location ~ \.php$ { return 404; }
location ~ /\. { deny all; }
```

Rate limit e timeout devono essere adeguati al volume reale. Non configurare IP
fidati o firme BRM non documentati. Verificare la redazione delle query anche nei
log d'errore del provider. Usare una singola installazione con SQLite su disco locale;
più server richiederebbero un archivio condiviso differente.

## Migrazione del database precedente

Le tabelle `reservations` e `reservation_versions`, le chiavi e gli hash sono
compatibili con il modello precedente. Fermare le scritture, fare un backup coerente
(SQLite backup API o copia a servizio fermo comprensiva dei file WAL necessari),
provare una copia con il nuovo backend e impostare DATABASE_PATH al file scelto.
Non cancellare né sovrascrivere il database in un aggiornamento dei file applicativi.
Il progetto demo non contiene database o credenziali reali da migrare.

## Web URL da inserire in BRM

Settings → Integrations → Webhooks → Add hook:

```text
https://DOMINIO-REALE/api/webhooks/brm?key=VALORE_WEBHOOK_URL_TOKEN
```

Selezionare solo reservation.create e reservation.update, attivare Enabled.
Non modificare il webhook Stripe già presente. DOMINIO-REALE è un segnaposto:
l'URL definitivo dipende dall'hosting ancora da comunicare, non è stato attivato.
Non inviare la chiave in chat.
