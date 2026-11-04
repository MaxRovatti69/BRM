# BRM Bike Rental Departure Board

Esposizione prenotazioni su tabellone.

Tabellone di noleggio biciclette ispirato ai display meccanici Solari delle stazioni italiane. Next.js App Router, TypeScript e Tailwind CSS. Questa prima versione usa esclusivamente dati dimostrativi locali: nessuna API BRM e nessuna credenziale necessaria.

## Avvio

Richiede Node.js >= 20.9 (verificato con Node 24) e npm.

```sh
npm ci
npm run dev
```

Aprire `http://localhost:3000/board` nel proprio browser. La pagina iniziale reindirizza a `/board`. Il server ascolta su tutte le interfacce: in un ambiente remoto usare l'inoltro della porta 3000 previsto dal proprio servizio.

## Produzione e controlli

```sh
npm run lint
npm run typecheck
npm run build
npm start
```

La build deve terminare prima di `npm start`. Per cambiare porta: `npm run dev -- --port 3001` oppure `npm start -- --port 3001`.

## Televisore

Layout ottimizzato per 1920×1080, zoom browser al 100%. Il pulsante in alto a destra attiva lo schermo intero; Esc lo chiude. Su schermi piccoli il tabellone scorre orizzontalmente per mantenere la leggibilità. Le animazioni rispettano la preferenza di accessibilità per ridurre il movimento.

Orologio e data usano il fuso `Europe/Rome`, con aggiornamento ogni secondo. Le otto prenotazioni sono ordinate per orario di inizio. Ogni 30 secondi il tabellone aggiorna l'indicatore di sincronizzazione e alterna lo stato della seconda prenotazione per mostrare il funzionamento del display. Gli orari delle prenotazioni sono esempi fissi, non derivano dall'ora reale. Data e orologio sono reali; i dati e gli stati sono sempre simulati.

I dati sono in `src/lib/demo.ts`, l'interfaccia in `src/app/board/page.tsx`, gli stili in `src/app/globals.css`. Il futuro collegamento BRM è fuori dall'ambito di questa versione. Non è prevista persistenza dei cambiamenti dimostrativi tra ricaricamenti.
