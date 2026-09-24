// Bedragen tonen zoals in België gebruikelijk: € 1.234,56.

const formaat = new Intl.NumberFormat("nl-BE", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function euro(bedrag: number | string | null | undefined): string {
  const n = typeof bedrag === "string" ? Number(bedrag) : (bedrag ?? 0);
  return formaat.format(Number.isFinite(n) ? n : 0);
}

const aantalFormaat = new Intl.NumberFormat("nl-BE", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function aantal(n: number | string | null | undefined): string {
  const x = typeof n === "string" ? Number(n) : (n ?? 0);
  return aantalFormaat.format(Number.isFinite(x) ? x : 0);
}

/**
 * Een ingetypt bedrag lezen. Studenten typen "12,50" of "12.50"; allebei
 * moet werken. Geeft null terug als er niets zinnigs staat.
 */
export function leesGetal(tekst: FormDataEntryValue | null): number | null {
  if (typeof tekst !== "string") return null;
  const schoon = tekst.trim().replace(/\s/g, "").replace(",", ".");
  if (schoon === "") return null;
  const n = Number(schoon);
  return Number.isFinite(n) ? n : null;
}
