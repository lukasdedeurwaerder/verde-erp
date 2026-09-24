// Klanten en leveranciers delen één tabel en dezelfde schermen; dit
// zegt welke van de twee pagina's je bekijkt. Staat apart van acties.ts
// omdat een "use server"-bestand alleen async functies mag exporteren.

export type Pagina = "klant" | "leverancier";

export function padVoor(pagina: Pagina): string {
  return pagina === "klant" ? "/klanten" : "/leveranciers";
}
