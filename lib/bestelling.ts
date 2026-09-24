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

/** Vandaag als 2026-09-24, in lokale tijd. */
export function vandaag(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

/** Een aantal dagen bij een ISO-datum optellen. */
export function plusDagen(iso: string, dagen: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + dagen);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
