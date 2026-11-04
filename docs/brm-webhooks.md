# Webhook BRM e pubblicazione HTTPS

## Fonti e limiti verificati

Implementazione basata sul testo dei due articoli ufficiali fornito dall'utente:

- https://support.bikerentalmanager.com/support/solutions/articles/42000086513-setting-up-webhooks
- https://brm2.bikerentalmanager.com/support/solutions/articles/42000088506-example-of-reservation-json-data-sent-by-webhook

BRM documenta la configurazione del **Web URL** e degli eventi e l'invio di JSON.
L'esempio contiene `event`, `namespace`, `reference` e `data`, con nome/cognome,
`items[].name`, `start_date`, `start_time`, `stage`, `status`, `draft`,
`created_ts` e `updated_ts` (millisecondi Unix).

Non sono documentati in questi articoli: firme, header di autenticazione, IP di
origine, criteri di retry, garanzie di consegna, snapshot parziali o l'elenco degli
stati annullati. L'endpoint richiede snapshot completi nella forma dell'esempio;
non pretende di supportare formati update non verificati. `reservation.update`
richiede `updated_ts` non nullo per ordinare gli aggiornamenti. Eventi con versione
inferiore vengono ignorati; stessa versione e contenuto differente restituiscono
409 per segnalare un conflitto. Nessuna garanzia di exactly-once delivery da BRM.

Gli identificativi locali sono la coppia `(namespace, reference)`; `reference` deve
restare stabile anche sulle modifiche. Un cambio di reference non documentato non
può essere riconciliato senza un altro identificativo stabile ufficiale.

## Dati, prodotti e stati

Ogni elemento di primo livello di `data.items` vale una unità, come nell'esempio
ufficiale. Nomi uguali vengono raggruppati; prodotti differenti hanno righe diverse
sul tabellone con lo stesso cliente e orario. Non si moltiplicano quantità usando
campi non documentati, e gli oggetti annidati `items[].items` non vengono contati
una seconda volta. Extras non sono trattati come biciclette. Verificare con un
payload reale se il negozio usa inventario generico o bundle con semantiche diverse.

Data e ora del payload non hanno offset: il negozio deve confermare il fuso,
configurabile con `BRM_TIME_ZONE` (default Europe/Rome). Date impossibili, orari
inesistenti o ambigui al cambio dell'ora sono rifiutati, evitando correzioni silenziose.
Il filtro del giorno rispetta anche i giorni di 23 o 25 ore. Il tabellone interroga
il server ogni 5 secondi, mostra solo il giorno attuale e ruota 8 righe ogni 12 secondi.
Un errore di rete mantiene l'ultimo risultato con indicazione NON SINCRONIZZATO.

**Annullamenti: punto ancora da confermare dal consulente BRM.** Il testo documenta
solo `status="ok"` e `stage="provisional"` / `"confirmed"`. Il sistema mostra
esclusivamente queste combinazioni con `draft=false`. Ogni altro stato o bozza
resta in archivio ma viene escluso. Il campo interno `cancelled` è un flag di
esclusione prudenziale, non un'asserzione che un valore sconosciuto significhi
annullato in BRM. Non è garantito che tutte le cancellazioni reali siano intercettate
finché non si verifica un payload annullato: se BRM mantenesse `status="ok"` e uno
stage consentito, serve adattare la regola. Non attivare l'uso operativo senza
questa verifica e un test BRM end-to-end. Il consenso del consulente non è necessario
per provare i dati sintetici, ma il valore effettivo serve per chiudere questo requisito.

Non vengono conservati JSON originali, email, telefoni, dati Stripe, prezzi,
note o documenti. SQLite contiene nome cliente, prodotti, ora e metadati necessari.

## Avvio e test locale

Node 24, una sola istanza applicativa, disco scrivibile:

```sh
npm ci
cp .env.example .env.local
```

Modificare `.env.local` senza pubblicarlo: `BOARD_MODE=live`, `BRM_NAMESPACE=test-store`,
un `WEBHOOK_URL_TOKEN` casuale di almeno 32 caratteri, `BOARD_USERNAME=board` e
una `BOARD_PASSWORD` casuale di almeno 16 caratteri. Generare valori distinti con:

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
npm run dev
```

Aprire `/board`: il browser richiede le credenziali del tabellone, non quelle BRM.
In un secondo terminale, con una base locale e un database di test:

```sh
npm test
npm run simulate -- create
npm run simulate -- update
npm run simulate -- exclude
npm run simulate -- tomorrow
```

`create` aggiunge due E-BIKE e un CASCO di un cliente sintetico per oggi; `update`
cambia l'orario alle 11:45. `exclude` usa uno stato inventato **solo per testare
l'esclusione degli stati sconosciuti**, non simula uno stato annullato BRM verificato.
`tomorrow` sposta la prenotazione fuori dal giorno attuale. `create` ripristina i
dati della stessa prenotazione dimostrativa con una versione più recente.
Il simulatore legge `.env.local`, non stampa segreti o il payload e per impostazione
predefinita invia solo a localhost. Per un servizio di staging usare
`SIMULATOR_BASE_URL=https://DOMINIO-STAGING` e `--allow-remote`.
Non usarlo con dati o namespace di produzione.

La suite copre normalizzazione del formato documentato, date/DST, snapshot,
più prodotti, duplicati, aggiornamenti fuori sequenza e prima della create,
persistenza dopo riapertura, auth endpoint/tabellone, richieste malformate,
limite corpo, esclusioni e assenza di dati personali nei log.

## Protezione e log

L'endpoint è `POST /api/webhooks/brm?key=SEGRETO_URL`. La chiave in query è una
**protezione aggiunta dal nostro ricevitore**, compatibile con la sola possibilità
documentata di impostare un Web URL; non è una firma o funzione di autenticazione BRM.
La conservazione della query da parte di BRM va verificata con una consegna reale.
Non è possibile provare crittograficamente che la richiesta provenga da BRM:
chi conosce l'URL completo può inviare un payload. Usare HTTPS, una chiave casuale,
limiti al reverse proxy e ruotare la chiave se l'URL viene esposto. Non inventare
allowlist IP o HMAC senza documentazione aggiuntiva ufficiale.

Il server controlla chiave con confronto a tempo costante a parità di lunghezza,
namespace, JSON, schema, dimensione massima 256 KiB e coerenza delle reference.
Chiave o namespace mancanti: 503; chiave errata: 401; tipo contenuto errato: 415;
payload non valido: 400; corpo eccessivo: 413; conflitto versione: 409;
errore database: 503. Gli eventi gestiti e persistiti restituiscono 200, anche se
duplicati o vecchi. Gli altri eventi sono rifiutati: selezionare solo reservation.
Configurare rate limit e timeout nel proxy/hosting prima della produzione;
non fidarsi di `X-Forwarded-For` arbitrari per un limite IP applicativo.

Log JSON su stdout: `component`, `requestId`, `status`, `outcome`, `durationMs`.
Sono esclusi payload, nomi, email, reference, namespace, token e URL. Controllare
anche i log del provider/reverse proxy: la query con `key` **non deve essere registrata**.
Una riga `outcome=inserted`, `updated`, `duplicate` o `stale` conferma la ricezione.
Un 200 dal ricevitore non prova che il tabellone abbia già aggiornato lo schermo.

Il tabellone e `/api/board` in modalità live sono protetti con HTTP Basic auth
del nostro servizio, separata da BRM. Usare solo HTTPS su Internet. Le credenziali
non vengono inserite nell'URL, nei payload BRM o nel codice client. La modalità
demo non richiede auth e non mostra mai il database reale. In produzione la modalità
predefinita è live; in sviluppo è demo. Impostare sempre esplicitamente BOARD_MODE.

## Pubblicazione sul proprio hosting

Il dominio e il tipo di hosting dell'utente sono ancora da verificare. Un dominio
registrato o un piano PHP/WordPress non dimostra che sia disponibile un processo
Node sempre attivo. Servono Node 24, installazione di dipendenze native SQLite,
un solo processo Next.js con riavvio automatico, HTTPS e disco persistente.
Se il piano non li supporta, il dominio può essere collegato a un hosting Node
separato senza spostare il sito esistente.

Sul server, nel checkout aggiornato, installare con `npm ci --include=dev`, eseguire
`npm test`, `npm run lint` e `npm run build`. Configurare le variabili elencate in
`.env.example` con valori reali e `BOARD_MODE=live`. Il database deve avere un
percorso assoluto esterno alle directory sostituite a ogni deploy. Avviare `npm start`
con il process manager del provider. Il proxy deve inoltrare al processo Node la
richiesta completa, inclusa la query string del webhook, senza registrarla nei log.

Se si usa Nginx su un VPS, aggiungere nel contesto `http` un limite e un formato
di access log che omette argomenti, header e credenziali:

```nginx
limit_req_zone $binary_remote_addr zone=brm_webhooks:10m rate=5r/s;
log_format brm_safe '$time_iso8601 $request_method $uri $status';
```

Nel server HTTPS **già configurato con certificato valido**, il seguente esempio
presuppone Next.js sulla porta 3000. Va adattato alla configurazione del proprio
hosting; non è una configurazione TLS completa né è stato installato sul dominio:

```nginx
access_log /var/log/nginx/brm-access.log brm_safe;
location = /api/webhooks/brm {
    limit_req zone=brm_webhooks burst=50 nodelay;
    limit_req_status 429;
    client_max_body_size 256k;
    client_body_timeout 10s;
    proxy_read_timeout 15s;
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
}
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Non aprire anche la porta Node direttamente su Internet: esporre solo HTTPS tramite
proxy/firewall. Se il proxy sta dietro a un altro proxy, configurare l'IP reale con
le sole reti fidate del provider prima di applicare limiti per IP. Verificare che
anche i log di errore/APM del provider non includano la query `key`; non attivare
debug delle richieste webhook. I limiti suggeriti vanno adeguati al volume reale
e alle politiche di retry, che gli articoli BRM forniti non descrivono.

Solo dopo il deploy e una prova reale si potrà dichiarare attivo l'URL HTTPS.

## Opzione alternativa: Render con URL HTTPS stabile

Il file `render.yaml` prepara un servizio Node 24 con disco persistente da 1 GB.
**Il piano con disco è a pagamento**: verificare prezzo e impostazioni prima di
crearlo. Nessun servizio esterno viene creato da queste istruzioni o dai test locali.

1. Pubblicare questa versione nel repository GitHub BRM.
2. Su Render creare un nuovo Blueprint collegato al repository e al branch main.
3. Rivedere `render.yaml`: servizio web Node, piano con disco, una sola istanza.
4. Impostare `BRM_NAMESPACE` con il valore esatto del proprio payload (non `yourstore`
   dell'esempio). Confermare `BRM_TIME_ZONE=Europe/Rome` se il negozio è in Italia.
5. Render genera `WEBHOOK_URL_TOKEN` e `BOARD_PASSWORD`; mantenerli segreti nelle
   impostazioni. `BOARD_USERNAME=board`, `BOARD_MODE=live`,
   `DATABASE_PATH=/var/data/reservations.sqlite`. Non montare il database dentro Git.
6. Avviare il deploy. I comandi salvati installano, testano e compilano il progetto.
   `/api/health` è una semplice liveness, non verifica consegne BRM o integrità DB.
7. Copiare il dominio HTTPS **effettivamente assegnato** dal servizio. Aprire `/board`
   e autenticarsi. Senza prenotazioni deve apparire NESSUNA PARTENZA PER OGGI.
8. Verificare su staging le consegne usando il simulatore e poi un evento BRM reale.
   Confrontare il tabellone con BRM e controllare modifiche, prodotti e annullamento.
9. Impostare backup del volume/database, accessi al provider e conservazione dei
   dati. SQLite in WAL richiede un backup coerente: usare l'API backup di SQLite
   o una copia a servizio fermo comprendente tutti i file, non copiare solo il .sqlite
   durante le scritture. Verificare il ripristino prima dell'uso operativo.

SQLite su disco persistente è adatto a questo deploy con singola istanza. Non usare
lo storage effimero di funzioni serverless o più istanze senza database condiviso.
Codespaces può sospendersi e non è una destinazione webhook stabile di produzione.
I webhook sincronizzano solo eventi futuri: le prenotazioni già esistenti in BRM
non vengono importate automaticamente. Questi articoli non documentano un'API di
import storico: non ne è stata inventata una.

## Configurazione esatta in BRM

Settings → Integrations → Webhooks → Add hook:

- **Web URL:** `https://DOMINIO-REALE/api/webhooks/brm?key=VALORE_DI_WEBHOOK_URL_TOKEN`
- **Events:** `reservation.create`, `reservation.update`
- **Enabled:** attivo.

Non selezionare Customer create/update. Non sostituire o modificare il webhook
già presente `https://app.bikerentalmanager.com/stripe/webhooks`.

`DOMINIO-REALE` non è un dominio esistente: deve essere sostituito dal dominio
assegnato dopo il deploy. Nessun URL finale è stato attivato finché non viene
pubblicato il servizio. Non inviare il token in chat per ricostruire l'URL.
