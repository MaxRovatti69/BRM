export type Booking = { id: string; minutes: number; client: string; product: string; quantity: number };
export const bookings: Booking[] = [
  { id: "BR001", minutes: 540, client: "MARCO ROSSI", product: "E-BIKE TREKKING", quantity: 2 },
  { id: "BR002", minutes: 555, client: "ANNA BIANCHI", product: "CITY BIKE", quantity: 1 },
  { id: "BR003", minutes: 570, client: "LUCA FERRARI", product: "GRAVEL EXPLORER", quantity: 2 },
  { id: "BR004", minutes: 600, client: "GIULIA ROMANO", product: "E-MTB ADVENTURE", quantity: 4 },
  { id: "BR005", minutes: 615, client: "THOMAS WEBER", product: "E-BIKE TREKKING", quantity: 2 },
  { id: "BR006", minutes: 630, client: "SOFIA MORETTI", product: "CITY BIKE", quantity: 3 },
  { id: "BR007", minutes: 660, client: "PAOLO CONTI", product: "ROAD PERFORMANCE", quantity: 1 },
  { id: "BR008", minutes: 690, client: "ELENA RICCI", product: "E-BIKE + SEGGIOLINO", quantity: 2 },
].sort((a, b) => a.minutes - b.minutes);
export function timeLabel(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
export function demoStatus(index: number, cycle: number) {
  if (index === 0) return "PARTITO";
  if (index === 1) return cycle % 2 === 0 ? "IN CONSEGNA" : "PRONTO";
  if (index === 2) return "PRONTO";
  return "CONFERMATO";
}
