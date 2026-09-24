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
