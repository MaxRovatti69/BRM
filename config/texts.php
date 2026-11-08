<?php
// Modifica solo i testi tra apici. Non cambiare i nomi delle chiavi.
// Per un apostrofo scrivi \' (esempio: 'L\'avventura inizia qui').
// I segnaposto {count}, {page}, {pages}, {time}, {seconds} vengono sostituiti dall'app.
// I testi sono testo semplice: HTML e JavaScript non vengono eseguiti.
return [
    // Scheda del browser e accessibilità.
    'titolo_scheda' => 'Binario Zero · Bike Rental Departure Board',
    'descrizione_scheda' => 'Il tabellone delle partenze di Binario Zero.',
    'javascript_disattivato' => 'Attiva JavaScript nel browser per visualizzare il tabellone.',
    'logo_alt' => 'Binario Zero',
    'descrizione_partenze' => 'Informazioni partenze',
    'descrizione_tabella' => 'Prenotazioni di oggi',
    'quantita_prodotti' => '{count} prodotti',

    // Header e titolo principale.
    'marchio_riga1' => 'BIKE RENTAL',
    'marchio_riga2' => 'DEPARTURE BOARD',
    'motto' => 'IL TUO VIAGGIO INIZIA QUI',
    'categoria' => 'NOLEGGIO BICICLETTE',
    'titolo' => 'PARTENZE',
    'sottotitolo' => 'PROSSIME AVVENTURE, UN PEDALE ALLA VOLTA.',

    // Intestazioni delle colonne (riga principale e traduzione).
    'colonna_ora' => 'ORA',
    'colonna_ora_en' => 'TIME',
    'colonna_cliente' => 'CLIENTE',
    'colonna_cliente_en' => 'CUSTOMER',
    'colonna_prodotto' => 'BICICLETTA / PRODOTTO',
    'colonna_prodotto_en' => 'BIKE / PRODUCT',
    'colonna_stato' => 'STATO',
    'colonna_stato_en' => 'STATUS',

    // Messaggi di caricamento, assenza di prenotazioni e connessione.
    'caricamento' => 'CARICAMENTO PRENOTAZIONI…',
    'connessione_assente' => 'COLLEGAMENTO NON DISPONIBILE',
    'nessuna_partenza' => 'NESSUNA PARTENZA PER OGGI',
    'sincronizzato' => 'TABELLONE ATTIVO',
    'non_sincronizzato' => 'NON SINCRONIZZATO',
    'riepilogo' => '{count} PRENOTAZIONI · OGGI',
    'paginazione' => ' · PAG. {page}/{pages}',

    // Pulsante schermo intero e relativo errore.
    'schermo_intero' => 'SCHERMO INTERO',
    'riduci_schermo' => 'RIDUCI',
    'schermo_intero_accessibile' => 'Attiva schermo intero',
    'riduci_schermo_accessibile' => 'Esci da schermo intero',
    'errore_schermo_intero' => 'Schermo intero non disponibile. Usa F11 sul televisore.',

    // Footer e indicazioni sulla provenienza dei dati.
    'messaggio_footer' => 'IL PERSONALE È A DISPOSIZIONE PER IL RITIRO DELLA TUA BICICLETTA.',
    'etichetta_live' => 'LIVE',
    'etichetta_demo' => 'DEMO',
    'etichetta_attesa' => '…',
    'aggiornamento' => 'AGGIORNATO {time}',
    'aggiornamento_automatico' => ' · AUTO {seconds} S',
    'nota_live' => 'PRENOTAZIONI BRM · ORARI LOCALI DEL NEGOZIO',
    'nota_demo' => 'PRENOTAZIONI E STATI SIMULATI · NESSUN DATO REALE',
    'nota_attesa' => 'IN ATTESA DEL TABELLONE',
];
