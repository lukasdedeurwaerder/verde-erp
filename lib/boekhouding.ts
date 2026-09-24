import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { cent } from "@/lib/lijnen";
import type { DocumentSoort, Rekening } from "@/lib/types";

// Gedeelde vragen voor de boekhoudschermen.

export type OpenDocument = {
  id: string;
  bedrijf_id: string;
  soort: DocumentSoort;
  nummer: string;
  extern_nummer: string | null;
  datum: string;
  vervaldatum: string | null;
  totaal_incl: number;
  gecrediteerd: number;
  betaald: number;
  openstaand: number;
  relatie: string;
};

/**
 * Definitieve facturen of aankoopfacturen met wat er nog openstaat.
 *
 * Openstaand = totaal − betaald − definitieve creditnota's. Dezelfde regel
 * als de databankfunctie openstaand(), die de betalingen controleert.
 */
export async function documentenMetSaldo(
  supabase: SupabaseClient,
  soort: "factuur" | "aankoopfactuur",
  bedrijfId: string | null,
): Promise<OpenDocument[]> {
  let q = supabase
    .from("documenten")
    .select("id, bedrijf_id, soort, nummer, extern_nummer, datum, vervaldatum, totaal_incl, betaald, relaties(naam)")
    .eq("soort", soort)
    .eq("status", "definitief")
    .order("datum")
    .order("nummer");
  if (bedrijfId) q = q.eq("bedrijf_id", bedrijfId);
  const { data } = await q;
  const docs = (data ?? []) as unknown as (Omit<OpenDocument, "gecrediteerd" | "openstaand" | "relatie"> & { relaties: { naam: string } | null })[];

  const credit = new Map<string, number>();
  if (soort === "factuur" && docs.length > 0) {
    let cq = supabase.from("documenten").select("bron_document_id, totaal_incl").eq("soort", "creditnota").eq("status", "definitief");
    if (bedrijfId) cq = cq.eq("bedrijf_id", bedrijfId);
    const { data: cns } = await cq;
    for (const c of cns ?? []) {
      if (c.bron_document_id) credit.set(c.bron_document_id, cent((credit.get(c.bron_document_id) ?? 0) + Number(c.totaal_incl)));
    }
  }

  return docs.map((d) => {
    const gecrediteerd = credit.get(d.id) ?? 0;
    return {
      ...d,
      totaal_incl: Number(d.totaal_incl),
      betaald: Number(d.betaald),
      gecrediteerd,
      openstaand: cent(Number(d.totaal_incl) - Number(d.betaald) - gecrediteerd),
      relatie: d.relaties?.naam ?? "",
    };
  });
}

/** Alle actieve rekeningen, op nummer. */
export async function rekeningen(supabase: SupabaseClient): Promise<Rekening[]> {
  const { data } = await supabase.from("rekeningen").select("*").eq("actief", true).order("nummer");
  return (data ?? []) as Rekening[];
}

/** Rekeningen waarop een aankoop geboekt kan worden: kosten en vaste activa. */
export function aankoopRekeningen(alle: Rekening[]): Rekening[] {
  return alle.filter((r) => r.soort === "kost" || (r.nummer.startsWith("2") && !r.nummer.endsWith("9")));
}
