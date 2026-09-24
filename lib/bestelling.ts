// Labels en kleuren voor bestellingen en documenten. Eén plek, zodat
// lijst, kanban, detailscherm en pdf dezelfde woorden gebruiken.

import type { BestellingSoort, BestellingStatus, DocumentSoort, DocumentStatus } from "@/lib/types";

export const STATUS_LABEL: Record<BestellingStatus, string> = {
  nieuw: "Nieuw",
  in_behandeling: "In behandeling",
  klaar: "Klaar",
  geleverd: "Geleverd",
  gefactureerd: "Gefactureerd",
  geannuleerd: "Geannuleerd",
};

/** Voor de kanban: de kolommen in volgorde, geannuleerd achteraan. */
export const KANBAN_KOLOMMEN: BestellingStatus[] = [
  "nieuw",
  "in_behandeling",
  "klaar",
  "geleverd",
  "gefactureerd",
  "geannuleerd",
];

export const STATUS_KLASSE: Record<BestellingStatus, string> = {
  nieuw: "badge",
  in_behandeling: "badge badge--waarschuwing",
  klaar: "badge badge--goed",
  geleverd: "badge badge--goed",
  gefactureerd: "badge badge--goed",
  geannuleerd: "badge badge--fout",
};

export const SOORT_LABEL: Record<BestellingSoort, { enkel: string; meer: string; relatie: string; document: DocumentSoort; documentLabel: string }> = {
  verkoop: { enkel: "verkooporder", meer: "Verkooporders", relatie: "Klant", document: "offerte", documentLabel: "Offerte" },
  aankoop: { enkel: "aankooporder", meer: "Aankooporders", relatie: "Leverancier", document: "bestelbon", documentLabel: "Bestelbon" },
};

export const DOCUMENT_LABEL: Record<DocumentSoort, string> = {
  offerte: "Offerte",
  bestelbon: "Bestelbon",
  leverbon: "Leverbon",
  ontvangstbon: "Ontvangstbon",
  factuur: "Factuur",
  creditnota: "Creditnota",
  aankoopfactuur: "Aankoopfactuur",
  aankoopcreditnota: "Aankoopcreditnota",
};

export const DOCUMENT_STATUS_LABEL: Record<DocumentStatus, string> = {
  concept: "Concept",
  definitief: "Definitief",
  geannuleerd: "Geannuleerd",
};

export const DOCUMENT_STATUS_KLASSE: Record<DocumentStatus, string> = {
  concept: "badge badge--waarschuwing",
  definitief: "badge badge--goed",
  geannuleerd: "badge badge--fout",
};

/** Bestellingnummer zoals getoond: 2026-0007. */
export function bestellingNummer(b: { jaar: number; nummer: number }): string {
  return `${b.jaar}-${String(b.nummer).padStart(4, "0")}`;
}

/** Datum tonen als 24/09/2026. */
export function datum(iso: string | null | undefined): string {
  if (!iso) return "";
  const [j, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${j}`;
}

/**
 * Vandaag als 2026-09-24, in Belgische tijd. Niet de tijd van de server:
 * die draait bij Vercel op UTC, en dan zou een document dat om half één
 * 's nachts gemaakt wordt de datum van gisteren krijgen.
 */
export function vandaag(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(new Date());
}

/** Welke documenten je vanuit een bestelling kunt maken, in deze volgorde. */
export const DOCUMENTEN_PER_SOORT: Record<BestellingSoort, DocumentSoort[]> = {
  verkoop: ["offerte", "leverbon", "factuur"],
  aankoop: ["bestelbon", "ontvangstbon", "aankoopfactuur"],
};

/** Hiervan mag er per bestelling maar één lopend zijn (niet geannuleerd). */
export const EEN_PER_BESTELLING: DocumentSoort[] = ["leverbon", "ontvangstbon", "factuur", "aankoopfactuur"];

/** Documenten die, eenmaal definitief, de lijnen van de bestelling vastzetten. */
export const VERGRENDELT_BESTELLING: DocumentSoort[] = ["leverbon", "ontvangstbon", "factuur", "aankoopfactuur"];

/** Waar je een document bekijkt: aankoopfacturen hebben een eigen scherm. */
export function documentPad(d: { id: string; soort: DocumentSoort }): string {
  return d.soort === "aankoopfactuur" || d.soort === "aankoopcreditnota" ? `/aankopen/${d.id}` : `/documenten/${d.id}`;
}

export const DAGBOEK_LABEL: Record<"verkoop" | "aankoop" | "financieel" | "divers", { naam: string; code: string }> = {
  verkoop: { naam: "Verkopen", code: "VK" },
  aankoop: { naam: "Aankopen", code: "AK" },
  financieel: { naam: "Financieel", code: "FI" },
  divers: { naam: "Diverse", code: "DI" },
};

/** Boekingsnummer zoals getoond: VK 2026/0003. */
export function boekingNummer(b: { dagboek: keyof typeof DAGBOEK_LABEL; jaar: number; nummer: number }): string {
  return `${DAGBOEK_LABEL[b.dagboek].code} ${b.jaar}/${String(b.nummer).padStart(4, "0")}`;
}

/** Een leverbon of ontvangstbon toont geen prijzen. */
export function toontPrijzen(soort: DocumentSoort): boolean {
  return soort !== "leverbon" && soort !== "ontvangstbon";
}

/**
 * Gestructureerde mededeling voor een factuur: +++123/4567/89012+++.
 *
 * Tien cijfers plus twee controlecijfers (rest bij deling door 97, en 97
 * als die rest nul is). Het eerste cijfer is het bedrijf: beide dochters
 * delen één bankrekening, en zo is aan elke betaling te zien voor welke
 * dochter ze bestemd is, ook als hun factuurnummers gelijk zijn.
 */
export function gestructureerdeMededeling(bedrijfVolgorde: number, jaar: number, volgnummer: number): string {
  const basis = `${bedrijfVolgorde % 10}${String(jaar % 1000).padStart(3, "0")}${String(volgnummer % 1000000).padStart(6, "0")}`;
  const rest = Number(BigInt(basis) % 97n);
  const cijfers = basis + String(rest === 0 ? 97 : rest).padStart(2, "0");
  return `+++${cijfers.slice(0, 3)}/${cijfers.slice(3, 7)}/${cijfers.slice(7)}+++`;
}

/** Een aantal dagen bij een ISO-datum optellen. */
export function plusDagen(iso: string, dagen: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + dagen);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
