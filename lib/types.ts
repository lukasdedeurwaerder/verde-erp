// De vormen van de rijen zoals ze uit de databank komen. Met de hand
// bijgehouden en in dezelfde volgorde als supabase/migrations/0001_schema.sql.

export type Rol = "docent" | "student";

export type Bedrijf = {
  id: string;
  naam: string;
  straat: string | null;
  postcode: string | null;
  gemeente: string | null;
  land: string;
  btw_nummer: string | null;
  email: string | null;
  telefoon: string | null;
  kleur: string;
  volgorde: number;
  actief: boolean;
};

export type Instellingen = {
  id: 1;
  moeder_naam: string;
  iban: string | null;
  bic: string | null;
  boekjaar_start: string;
  betaaltermijn_dagen: number;
  factuur_voettekst: string | null;
};

export type Profiel = {
  id: string;
  naam: string;
  email: string | null;
  rol: Rol;
  bedrijf_id: string | null;
  actief: boolean;
  aangemaakt_op: string;
};

export type RelatieSoort = "klant" | "leverancier" | "beide";

export type Relatie = {
  id: string;
  bedrijf_id: string;
  soort: RelatieSoort;
  naam: string;
  contactpersoon: string | null;
  email: string | null;
  telefoon: string | null;
  straat: string | null;
  postcode: string | null;
  gemeente: string | null;
  land: string;
  btw_nummer: string | null;
  betaaltermijn_dagen: number | null;
  opmerkingen: string | null;
  actief: boolean;
  aangemaakt_op: string;
};

export type Productcategorie = {
  id: string;
  bedrijf_id: string;
  naam: string;
  volgorde: number;
};

export const BTW_TARIEVEN = [21, 12, 6, 0] as const;
export type BtwTarief = (typeof BTW_TARIEVEN)[number];

export type Product = {
  id: string;
  bedrijf_id: string;
  categorie_id: string | null;
  code: string | null;
  naam: string;
  omschrijving: string | null;
  eenheid: string;
  aankoopprijs: number;
  verkoopprijs: number;
  btw_tarief: number;
  voorraad_bijhouden: boolean;
  voorraad: number;
  min_voorraad: number;
  foto_url: string | null;
  actief: boolean;
  aangemaakt_op: string;
};

// ---------- Fase 2: bestellingen en documenten ----------

export type BestellingSoort = "verkoop" | "aankoop";

export const BESTELLING_STATUSSEN = [
  "nieuw",
  "in_behandeling",
  "klaar",
  "geleverd",
  "gefactureerd",
  "geannuleerd",
] as const;
export type BestellingStatus = (typeof BESTELLING_STATUSSEN)[number];

export type Bestelling = {
  id: string;
  bedrijf_id: string;
  soort: BestellingSoort;
  jaar: number;
  nummer: number;
  relatie_id: string;
  datum: string;
  gewenste_leverdatum: string | null;
  status: BestellingStatus;
  verantwoordelijke_id: string | null;
  opmerking: string | null;
  aangemaakt_op: string;
  bijgewerkt_op: string;
  aangemaakt_door: string | null;
};

/** Een lijn zoals ze in bestellijnen én documentlijnen voorkomt. */
export type Lijn = {
  id?: string;
  product_id: string | null;
  omschrijving: string;
  aantal: number;
  eenheidsprijs: number;
  btw_tarief: number;
  korting_pct: number;
  volgorde: number;
};

export const DOCUMENT_SOORTEN = [
  "offerte",
  "bestelbon",
  "leverbon",
  "ontvangstbon",
  "factuur",
  "creditnota",
  "aankoopfactuur",
  "aankoopcreditnota",
] as const;
export type DocumentSoort = (typeof DOCUMENT_SOORTEN)[number];
export type DocumentStatus = "concept" | "definitief" | "geannuleerd";

export type Document = {
  id: string;
  bedrijf_id: string;
  soort: DocumentSoort;
  nummer: string | null;
  volgnummer: number | null;
  jaar: number;
  bestelling_id: string | null;
  relatie_id: string;
  bron_document_id: string | null;
  datum: string;
  vervaldatum: string | null;
  status: DocumentStatus;
  totaal_excl: number;
  totaal_btw: number;
  totaal_incl: number;
  betaald: number;
  /** Creditnota: goederen gaan terug in voorraad (retour). */
  voorraad_terug: boolean;
  opmerking: string | null;
  pdf_pad: string | null;
  aangemaakt_op: string;
  bijgewerkt_op: string;
  definitief_op: string | null;
  aangemaakt_door: string | null;
};
