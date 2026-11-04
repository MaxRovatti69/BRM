"use client";

import { useEffect, useState } from "react";
type BoardData = {
  mode: "demo" | "live"; zone: string; fetchedAt: string;
  reservations: { id: string; client: string; time: string; status: string; products: { name: string; quantity: number }[] }[];
};

function Flap({ text, className = "" }: { text: string; className?: string }) {
  return <span className={`flap-text ${className}`} aria-label={text}>
    {Array.from(text.slice(0, className === "time-flaps" ? 5 : className === "client-flaps" ? 23 : 27).toLocaleUpperCase("it-IT")).map((letter, i) => <span className="flap" key={`${i}-${letter}`} aria-hidden="true" style={{ animationDelay: `${i * 18}ms` }}>{letter === " " ? "\u00a0" : letter}</span>)}
  </span>;
}

export default function Board() {
  const [now, setNow] = useState<Date | null>(null);
  const [updated, setUpdated] = useState<Date | null>(null);
  const [data, setData] = useState<BoardData | null>(null);
  const [offline, setOffline] = useState(false);
  const [page, setPage] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState("");

  useEffect(() => {
    const tick = () => setNow(new Date());
    let stopped = false;
    let controller: AbortController | undefined;
    let busy = false;
    const refresh = async () => {
      if (busy) return;
      busy = true;
      controller = new AbortController();
      const timeout = window.setTimeout(() => controller?.abort(), 8000);
      try {
        const response = await fetch("/api/board", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Board unavailable");
        const next: BoardData = await response.json();
        if (!stopped) { setData(next); setUpdated(new Date(next.fetchedAt)); setOffline(false); }
      } catch { if (!stopped) setOffline(true); }
      finally { clearTimeout(timeout); busy = false; }
    };
    const initial = window.setTimeout(() => { tick(); void refresh(); }, 0);
    const clock = window.setInterval(tick, 1000);
    const polling = window.setInterval(() => void refresh(), 5000);
    const pagination = window.setInterval(() => setPage(p => p + 1), 12000);
    const syncFullscreen = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => { stopped = true; controller?.abort(); clearTimeout(initial); clearInterval(clock); clearInterval(polling); clearInterval(pagination); document.removeEventListener("fullscreenchange", syncFullscreen); };
  }, []);

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
      setFullscreenError("");
    } catch { setFullscreenError("Schermo intero non disponibile. Usa F11 sul televisore."); }
  }

  const allRows = data?.reservations.flatMap(booking => booking.products.map((product, index) => ({
    ...booking, id: `${booking.id}-${index}`, product: product.name, quantity: product.quantity,
  }))) ?? [];
  const pageCount = Math.max(1, Math.ceil(allRows.length / 8));
  const pageIndex = page % pageCount;
  const rows = allRows.slice(pageIndex * 8, (pageIndex + 1) * 8);
  const zone = data?.zone ?? "Europe/Rome";
  const clock = now?.toLocaleTimeString("it-IT", { timeZone: zone, hour12: false }) ?? "--:--:--";
  const date = now?.toLocaleDateString("it-IT", { timeZone: zone, weekday: "long", day: "2-digit", month: "long", year: "numeric" }) ?? "CARICAMENTO DATA";

  return <main className="board-shell min-h-screen text-amber-400">
    <header className="masthead flex items-center justify-between gap-6">
      <div className="brand flex items-center gap-5"><span className="brand-mark">BRM<span className="brand-dot">.</span></span><span className="brand-description">BIKE RENTAL<br />DEPARTURE BOARD</span></div>
      <div className="station-label hidden md:flex items-center gap-3"><span className="live-dot" /> IL TUO VIAGGIO INIZIA QUI</div>
      <button className="fullscreen-button" onClick={toggleFullscreen} aria-label={fullscreen ? "Esci da schermo intero" : "Attiva schermo intero"}><span aria-hidden="true">⛶</span><span>{fullscreen ? "RIDUCI" : "SCHERMO INTERO"}</span></button>
    </header>

    <section className="departure-heading flex items-end justify-between gap-5" aria-label="Informazioni partenze">
      <div><div className="eyebrow flex items-center gap-3"><svg width="36" height="25" viewBox="0 0 48 32" fill="none" aria-hidden="true"><circle cx="10" cy="22" r="8" stroke="currentColor" strokeWidth="2.5"/><circle cx="38" cy="22" r="8" stroke="currentColor" strokeWidth="2.5"/><path d="m10 22 10-17 10 17H10m10-17h7m3 17-6-19h7" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round"/></svg> NOLEGGIO BICICLETTE</div><h1>PARTENZE<span className="heading-arrow" aria-hidden="true"><svg width="48" height="48" viewBox="0 0 48 48" fill="none"><path d="M10 38 38 10M10 10h28v28" stroke="currentColor" strokeWidth="4"/></svg></span></h1><p className="subtitle">PROSSIME AVVENTURE, UN PEDALE ALLA VOLTA.</p></div>
      <div className="time-block text-right"><time className="clock" dateTime={now?.toISOString()}>{clock}</time><p className="date">{date}</p></div>
    </section>

    <div className="board-frame">
      <div className="board-screw screw-left" /><div className="board-screw screw-right" />
      <div className="table-scroll"><table className="departure-table w-full" aria-label="Prenotazioni di oggi">
        <colgroup><col className="col-time"/><col className="col-client"/><col className="col-product"/><col className="col-status"/></colgroup>
        <thead><tr><th scope="col">ORA <span>TIME</span></th><th scope="col">CLIENTE <span>CUSTOMER</span></th><th scope="col">BICICLETTA / PRODOTTO <span>BIKE / PRODUCT</span></th><th scope="col">STATO <span>STATUS</span></th></tr></thead>
        <tbody>{rows.map((booking) => {
          const status = booking.status;
          return <tr key={booking.id} className={status === "IN CONSEGNA" ? "active-row" : status === "PARTITO" ? "departed-row" : ""}>
            <td><Flap text={booking.time} className="time-flaps"/></td>
            <td><Flap text={booking.client} className="client-flaps"/></td>
            <td><div className="product-cell flex items-center justify-between gap-2"><Flap text={booking.product}/><span className="quantity" aria-label={`${booking.quantity} biciclette`}>×{booking.quantity}</span></div></td>
            <td><span className={`status status-${status.toLowerCase().replaceAll(" ", "-")}`}><span className="status-dot"/><span key={status} className="status-label">{status}</span></span></td>
          </tr>;
        })}
        {rows.length === 0 && <tr><td colSpan={4} className="empty-board">{!data ? (offline ? "COLLEGAMENTO NON DISPONIBILE" : "CARICAMENTO PRENOTAZIONI…") : "NESSUNA PARTENZA PER OGGI"}</td></tr>}
        {Array.from({ length: Math.max(0, 8 - Math.max(1, rows.length)) }, (_, i) => <tr key={`empty-${i}`} aria-hidden="true"><td colSpan={4} /></tr>)}
        </tbody>
      </table></div>
      <div className="board-bottom flex items-center justify-between"><span><span className="live-dot"/> {offline ? "NON SINCRONIZZATO" : "TABELLONE ATTIVO"}</span><span>{String(data?.reservations.length ?? 0).padStart(2, "0")} PRENOTAZIONI · OGGI{pageCount > 1 ? ` · PAG. ${pageIndex + 1}/${pageCount}` : ""}</span></div>
    </div>

    <footer className="footer flex items-center justify-between gap-5"><div className="footer-message"><span className="info-icon">i</span> IL PERSONALE È A DISPOSIZIONE PER IL RITIRO DELLA TUA BICICLETTA.</div><div className="update-info"><span className="demo-badge">{data?.mode === "live" ? "LIVE" : data?.mode === "demo" ? "DEMO" : "…"}</span><span>AGGIORNATO {updated?.toLocaleTimeString("it-IT", { timeZone: zone }) ?? "--:--:--"}<span className="refresh-note"> · AUTO 5 S</span></span></div></footer>
    <p className="demo-note">{data?.mode === "live" ? "PRENOTAZIONI BRM · ORARI LOCALI DEL NEGOZIO" : data?.mode === "demo" ? "PRENOTAZIONI E STATI SIMULATI · NESSUN DATO REALE" : "IN ATTESA DEL TABELLONE"}</p>
    {fullscreenError && <p role="status" className="fullscreen-error">{fullscreenError}</p>}
  </main>;
}
