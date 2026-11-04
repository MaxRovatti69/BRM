# BRM Bike Rental Departure Board

Esposizione prenotazioni su tabellone. Next.js, TypeScript e Tailwind CSS, con il
design ferroviario a palette e un archivio SQLite persistente per webhook BRM.

## Avvio

Richiede **Node.js 24** e npm.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Aprire `/board` sulla porta 3000, usando l'inoltro porte se il progetto gira in
Codespaces. `/` reindirizza a `/board`. `BOARD_MODE=demo` mostra solo dati sintetici.
Il server ascolta su tutte le interfacce: non esporre il live su Internet senza HTTPS.

## Prenotazioni reali

Seguire [la guida webhook e pubblicazione](docs/brm-webhooks.md). In sintesi:

- `BOARD_MODE=live`, namespace esatto BRM, fuso orario del negozio;
- chiave URL del ricevitore e credenziali separate per il tabellone;
- Node sempre attivo, singola istanza e disco persistente;
- webhook `reservation.create` / `reservation.update`, polling del display ogni 5 s;
- un prodotto per riga, paginazione automatica ogni 12 s oltre le 8 righe;
- filtro del giorno e protezione contro duplicati e aggiornamenti fuori ordine.

**Da confermare prima dell'uso operativo:** gli articoli forniti non documentano
lo stato effettivo annullato né firme BRM. Si visualizzano solo `status=ok`,
`stage=confirmed/provisional`, `draft=false`; gli altri stati sono esclusi senza
attribuire loro un significato inventato. È necessario un test BRM reale e la
conferma degli annullamenti dal consulente. Nessuna importazione storica automatica.

## Controlli e produzione

```sh
npm test
npm run lint
npm run typecheck
npm run build
npm start
```

In produzione la modalità predefinita è live (in sviluppo demo); impostarla sempre
esplicitamente. Configurare `.env.local` o le variabili del provider prima di
avviare il server. `/api/health` controlla solo che il processo risponda.

Per provare il flusso con dati sintetici su un database locale di test:

```sh
npm run simulate -- create
npm run simulate -- update
npm run simulate -- exclude
npm run simulate -- tomorrow
```

Vedere la guida per le variabili richieste e il significato dei comandi. I test
non contattano BRM e non inviano dati reali.

## Televisore

Layout per 1920×1080, zoom al 100%. Pulsante schermo intero in alto a destra,
Esc per uscire. Orologio nel fuso del negozio, aggiornato ogni secondo. I dispositivi
piccoli permettono lo scorrimento orizzontale. Animazioni compatibili con la
preferenza di movimento ridotto. La demo è sempre indicata e resta separata dai
dati reali. I dati dell'ultimo polling vengono conservati a schermo in caso di
errore di rete, con indicazione NON SINCRONIZZATO.

## File principali

- `src/lib/brm.ts`: validazione e normalizzazione del formato documentato.
- `src/lib/reservation-store.ts`: database, transazioni e idempotenza.
- `src/app/api/webhooks/brm/route.ts`: ricezione POST e log senza payload.
- `src/app/api/board/route.ts`: prenotazioni del giorno.
- `src/proxy.ts`: protezione del tabellone live con HTTP Basic auth.
- `src/app/board/page.tsx`: display ferroviario e aggiornamenti.
- `tests/`: test sintetici; `scripts/simulate-brm.ts`: invio webhook locali.
- `render.yaml`: opzione di deploy su Render, se non si usa il proprio hosting.

Non pubblicare `.env.local`, database, backup o URL webhook completi con la chiave.
