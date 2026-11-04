"use client";

import { useEffect, useState } from "react";
import { bookings, demoStatus, timeLabel } from "@/lib/demo";

function Flap({ text, className = "" }: { text: string; className?: string }) {
  return <span className={`flap-text ${className}`} aria-label={text}>
    {Array.from(text).map((letter, i) => <span className="flap" key={`${i}-${letter}`} aria-hidden="true" style={{ animationDelay: `${i * 18}ms` }}>{letter === " " ? "\u00a0" : letter}</span>)}
  </span>;
}

export default function Board() {
  const [now, setNow] = useState<Date | null>(null);
  const [updated, setUpdated] = useState<Date | null>(null);
  const [cycle, setCycle] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState("");

  useEffect(() => {
    const tick = () => setNow(new Date());
    const refresh = () => { setUpdated(new Date()); setCycle(c => c + 1); };
    const initial = window.setTimeout(() => { tick(); setUpdated(new Date()); }, 0);
    const clock = window.setInterval(tick, 1000);
    const data = window.setInterval(refresh, 30000);
    const syncFullscreen = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => { clearTimeout(initial); clearInterval(clock); clearInterval(data); document.removeEventListener("fullscreenchange", syncFullscreen); };
  }, []);

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
      setFullscreenError("");
    } catch { setFullscreenError("Schermo intero non disponibile. Usa F11 sul televisore."); }
  }

  const clock = now?.toLocaleTimeString("it-IT", { timeZone: "Europe/Rome", hour12: false }) ?? "--:--:--";
  const date = now?.toLocaleDateString("it-IT", { timeZone: "Europe/Rome", weekday: "long", day: "2-digit", month: "long", year: "numeric" }) ?? "CARICAMENTO DATA";

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
      <div className="table-scroll"><table className="departure-table w-full" aria-label="Prenotazioni dimostrative di oggi">
        <colgroup><col className="col-time"/><col className="col-client"/><col className="col-product"/><col className="col-status"/></colgroup>
        <thead><tr><th scope="col">ORA <span>TIME</span></th><th scope="col">CLIENTE <span>CUSTOMER</span></th><th scope="col">BICICLETTA / PRODOTTO <span>BIKE / PRODUCT</span></th><th scope="col">STATO <span>STATUS</span></th></tr></thead>
        <tbody>{bookings.map((booking, i) => {
          const status = demoStatus(i, cycle);
          return <tr key={booking.id} className={i === 1 ? "active-row" : i === 0 ? "departed-row" : ""}>
            <td><Flap text={timeLabel(booking.minutes)} className="time-flaps"/></td>
            <td><Flap text={booking.client}/></td>
            <td><div className="product-cell flex items-center justify-between gap-2"><Flap text={booking.product}/><span className="quantity" aria-label={`${booking.quantity} biciclette`}>×{booking.quantity}</span></div></td>
            <td><span className={`status status-${status.toLowerCase().replaceAll(" ", "-")}`}><span className="status-dot"/><span key={status} className="status-label">{status}</span></span></td>
          </tr>;
        })}</tbody>
      </table></div>
      <div className="board-bottom flex items-center justify-between"><span><span className="live-dot"/> TABELLONE ATTIVO</span><span>08 PRENOTAZIONI · OGGI</span></div>
    </div>

    <footer className="footer flex items-center justify-between gap-5"><div className="footer-message"><span className="info-icon">i</span> IL PERSONALE È A DISPOSIZIONE PER IL RITIRO DELLA TUA BICICLETTA.</div><div className="update-info"><span className="demo-badge">DEMO</span><span>AGGIORNATO {updated?.toLocaleTimeString("it-IT", { timeZone: "Europe/Rome" }) ?? "--:--:--"}<span className="refresh-note"> · AUTO 30 S</span></span></div></footer>
    <p className="demo-note">PRENOTAZIONI E STATI SIMULATI · NESSUN COLLEGAMENTO A BRM</p>
    {fullscreenError && <p role="status" className="fullscreen-error">{fullscreenError}</p>}
  </main>;
}
