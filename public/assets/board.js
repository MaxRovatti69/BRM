/* React runs in the browser. Plain JavaScript: no JSX compiler or Node build. */
'use strict';
(() => {
  const texts = JSON.parse(document.getElementById('board-texts').textContent);
  const format = (text, values) => text.replace(/\{(\w+)\}/g, (match, key) => Object.hasOwn(values, key) ? String(values[key]) : match);
  const h = React.createElement;
  const { useState, useEffect } = React;
  const dot = () => h('span', { className: 'live-dot', 'aria-hidden': true });
  function Flap({text, kind = ''}) {
    const limit = kind === 'time-flaps' ? 5 : kind === 'client-flaps' ? 23 : 27;
    return h('span', {className: `flap-text ${kind}`, 'aria-label': text, title: text},
      Array.from(text.toLocaleUpperCase('it-IT')).slice(0, limit).map((letter, i) =>
        h('span', {className:'flap', key:`${i}-${letter}`, 'aria-hidden':true, style:{animationDelay:`${i * 18}ms`}}, letter === ' ' ? '\u00a0' : letter)));
  }
  function Board() {
    const [now, setNow] = useState(new Date());
    const [data, setData] = useState(null);
    const [offline, setOffline] = useState(false);
    const [page, setPage] = useState(0);
    const [fullscreen, setFullscreen] = useState(false);
    const [error, setError] = useState('');
    useEffect(() => {
      let stopped = false, busy = false, controller;
      const refresh = async () => {
        if (busy) return;
        busy = true;
        controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        try {
          const response = await fetch('/api/board', {cache:'no-store', signal:controller.signal, credentials:'same-origin'});
          if (!response.ok) throw new Error('Board unavailable');
          const next = await response.json();
          if (!Array.isArray(next.reservations) || !['demo','live'].includes(next.mode)) throw new Error('Invalid response');
          if (!stopped) { setData(next); setOffline(false); }
        } catch { if (!stopped) setOffline(true); }
        finally { clearTimeout(timeout); busy = false; }
      };
      refresh();
      const clock = setInterval(() => setNow(new Date()), 1000);
      const poll = setInterval(refresh, 5000);
      const pages = setInterval(() => setPage(p => p + 1), 12000);
      const syncFullscreen = () => setFullscreen(Boolean(document.fullscreenElement));
      document.addEventListener('fullscreenchange', syncFullscreen);
      return () => { stopped = true; controller?.abort(); clearInterval(clock); clearInterval(poll); clearInterval(pages); document.removeEventListener('fullscreenchange', syncFullscreen); };
    }, []);
    const toggleFullscreen = async () => {
      try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); setError(''); }
      catch { setError(texts.errore_schermo_intero); }
    };
    const allRows = data?.reservations.flatMap(b => b.products.map((p, i) => ({...b, id:`${b.id}-${i}`, product:p.name, quantity:p.quantity}))) ?? [];
    const pageCount = Math.max(1, Math.ceil(allRows.length / 8));
    const pageIndex = page % pageCount;
    const rows = allRows.slice(pageIndex * 8, (pageIndex + 1) * 8);
    const zone = data?.zone ?? 'Europe/Rome';
    const clock = now.toLocaleTimeString('it-IT', {timeZone:zone, hour12:false});
    const date = now.toLocaleDateString('it-IT', {timeZone:zone, weekday:'long', day:'2-digit', month:'long', year:'numeric'});
    const updated = data ? new Date(data.fetchedAt).toLocaleTimeString('it-IT', {timeZone:zone}) : '--:--:--';
    const renderedRows = rows.map(b => h('tr', {key:b.id, className:b.status === 'IN CONSEGNA' ? 'active-row' : b.status === 'PARTITO' ? 'departed-row' : ''},
      h('td', null, h(Flap, {text:b.time, kind:'time-flaps'})),
      h('td', null, h(Flap, {text:b.client, kind:'client-flaps'})),
      h('td', null, h('div', {className:'product-cell flex items-center justify-between gap-2'}, h(Flap, {text:b.product}), h('span', {className:'quantity', 'aria-label':format(texts.quantita_prodotti, {count:b.quantity})}, `×${b.quantity}`))),
      h('td', null, h('span', {className:`status status-${b.status.toLowerCase().replaceAll(' ', '-')}`}, h('span', {className:'status-dot'}), h('span', {className:'status-label', key:b.status}, b.status)))));
    if (!rows.length) renderedRows.push(h('tr', {key:'message'}, h('td', {colSpan:4, className:'empty-board'}, !data ? (offline ? texts.connessione_assente : texts.caricamento) : texts.nessuna_partenza)));
    for (let i = Math.max(1, rows.length); i < 8; i++) renderedRows.push(h('tr', {key:`empty-${i}`, 'aria-hidden':true}, h('td', {colSpan:4})));
    return h('main', {className:'board-shell min-h-screen'},
      h('header', {className:'masthead flex items-center justify-between gap-6'},
        h('div', {className:'brand flex items-center gap-5'}, h('img', {className:'brand-logo', src:'/assets/binario-zero.png', alt:texts.logo_alt, width:252, height:60}), h('span', {className:'brand-description'}, texts.marchio_riga1, h('br'), texts.marchio_riga2)),
        h('div', {className:'station-label hidden md:flex items-center gap-3'}, dot(), texts.motto),
        h('button', {className:'fullscreen-button', onClick:toggleFullscreen, 'aria-label':fullscreen ? texts.riduci_schermo_accessibile : texts.schermo_intero_accessibile}, h('span', {'aria-hidden':true}, '⛶'), h('span', null, fullscreen ? texts.riduci_schermo : texts.schermo_intero))),
      h('section', {className:'departure-heading flex items-end justify-between gap-5', 'aria-label':texts.descrizione_partenze},
        h('div', null, h('div', {className:'eyebrow flex items-center gap-3'}, h('svg', {width:36,height:25,viewBox:'0 0 48 32',fill:'none','aria-hidden':true}, h('circle',{cx:10,cy:22,r:8,stroke:'currentColor',strokeWidth:2.5}),h('circle',{cx:38,cy:22,r:8,stroke:'currentColor',strokeWidth:2.5}),h('path',{d:'m10 22 10-17 10 17H10m10-17h7m3 17-6-19h7',stroke:'currentColor',strokeWidth:2.5,strokeLinejoin:'round'})), texts.categoria), h('h1', null, texts.titolo, h('span', {className:'heading-arrow', 'aria-hidden':true}, h('svg', {width:48, height:48, viewBox:'0 0 48 48', fill:'none'}, h('path', {d:'M10 38 38 10M10 10h28v28', stroke:'currentColor', strokeWidth:4})))), h('p', {className:'subtitle'}, texts.sottotitolo)),
        h('div', {className:'time-block text-right'}, h('time', {className:'clock', dateTime:now.toISOString()}, clock), h('p', {className:'date'}, date))),
      h('div', {className:'board-frame'}, h('div', {className:'board-screw screw-left'}), h('div', {className:'board-screw screw-right'}),
        h('div', {className:'table-scroll'}, h('table', {className:'departure-table w-full', 'aria-label':texts.descrizione_tabella},
          h('colgroup', null, ...['time','client','product','status'].map(c => h('col', {className:`col-${c}`, key:c}))),
          h('thead', null, h('tr', null, ...[[texts.colonna_ora,texts.colonna_ora_en],[texts.colonna_cliente,texts.colonna_cliente_en],[texts.colonna_prodotto,texts.colonna_prodotto_en],[texts.colonna_stato,texts.colonna_stato_en]].map(([it,en]) => h('th', {scope:'col', key:it}, it, h('span', null, en))))), h('tbody', null, ...renderedRows))),
        h('div', {className:'board-bottom flex items-center justify-between'}, h('span', null, dot(), offline ? texts.non_sincronizzato : texts.sincronizzato), h('span', null, format(texts.riepilogo, {count:String(data?.reservations.length ?? 0).padStart(2, '0')}) + (pageCount > 1 ? format(texts.paginazione, {page:pageIndex + 1, pages:pageCount}) : '')))),
      h('footer', {className:'footer flex items-center justify-between gap-5'},
        h('div', {className:'footer-message'}, h('span', {className:'info-icon'}, 'i'), texts.messaggio_footer),
        h('div', {className:'update-info'}, h('span', {className:'demo-badge'}, data?.mode === 'live' ? texts.etichetta_live : data?.mode === 'demo' ? texts.etichetta_demo : texts.etichetta_attesa), h('span', null, format(texts.aggiornamento, {time:updated}), h('span', {className:'refresh-note'}, format(texts.aggiornamento_automatico, {seconds:5}))))),
      h('p', {className:'demo-note'}, data?.mode === 'live' ? texts.nota_live : data?.mode === 'demo' ? texts.nota_demo : texts.nota_attesa),
      error && h('p', {className:'fullscreen-error', role:'status'}, error));
  }
  ReactDOM.createRoot(document.getElementById('root')).render(h(Board));
})();
