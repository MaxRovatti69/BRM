import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BRM · Bike Rental Departure Board",
  description: "Il tabellone delle partenze del tuo prossimo viaggio in bicicletta.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="it"><body>{children}</body></html>;
}
