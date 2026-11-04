import { resolve } from "node:path";
import { ReservationStore } from "./reservation-store";

let store: ReservationStore | undefined;
export function getStore() {
  store ??= new ReservationStore(resolve(process.env.DATABASE_PATH ?? "data/reservations.sqlite"));
  return store;
}
