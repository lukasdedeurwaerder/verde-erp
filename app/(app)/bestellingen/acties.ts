"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { huidigeContext, vereistBedrijf } from "@/lib/sessie";
import { tekst } from "@/lib/formulier";
import { leesLijnen } from "@/lib/lijnen";
import { plusDagen, SOORT_LABEL } from "@/lib/bestelling";
import { BESTELLING_STATUSSEN, type BestellingSoort, type BestellingStatus } from "@/lib/types";

export type BestellingStatusResultaat = { fout?: string };

function ververs(id?: string) {
  revalidatePath("/bestellingen");
  revalidatePath("/documenten");
  revalidatePath("/");
  if (id) revalidatePath(`/bestellingen/${id}`);
}

function isSoort(s: string | null): s is BestellingSoort {
  return s === "verkoop" || s === "aankoop";
}

function isStatus(s: string | null): s is BestellingStatus {
  return (BESTELLING_STATUSSEN as readonly string[]).includes(s ?? "");
}

/**
 * Een bestelling aanmaken of bijwerken, mét haar lijnen. De lijnen
 * komen als JSON mee en vervangen de bestaande lijnen volledig: dat is
 * eenvoudiger en veiliger dan per lijn bijhouden wat er veranderde.
 */
export async function bestellingOpslaan(
  id: string | null,
  soort: BestellingSoort,
  _vorige: BestellingStatusResultaat,
  form: FormData,
): Promise<BestellingStatusResultaat> {
  const supabase = await supabaseServer();

  const relatieId = tekst(form, "relatie_id");
  if (!relatieId) return { fout: `Kies een ${SOORT_LABEL[soort].relatie.toLowerCase()}.` };

  const datum = tekst(form, "datum");
  if (!datum || !/^\d{4}-\d{2}-\d{2}$/.test(datum)) return { fout: "Vul een geldige datum in." };
  const leverdatum = tekst(form, "gewenste_leverdatum");
  if (leverdatum && !/^\d{4}-\d{2}-\d{2}$/.test(leverdatum)) return { fout: "Ongeldige leverdatum." };

  const gelezen = leesLijnen(form.get("lijnen"));
  if ("fout" in gelezen) return { fout: gelezen.fout };
  if (gelezen.lijnen.length === 0) return { fout: "Voeg minstens één lijn toe." };

  // Bedrijf: van de bestaande bestelling, of het actieve bedrijf.
  let bedrijfId: string;
  let gebruikerId: string;
  if (id) {
    const ctx = await huidigeContext();
    gebruikerId = ctx.gebruikerId;
    const { data } = await supabase.from("bestellingen").select("bedrijf_id, soort").eq("id", id).maybeSingle();
    if (!data) return { fout: "Bestelling niet gevonden." };
    bedrijfId = data.bedrijf_id;
  } else {
    try {
      const ctx = await vereistBedrijf();
      bedrijfId = ctx.bedrijf.id;
      gebruikerId = ctx.gebruikerId;
    } catch (e) {
      return { fout: e instanceof Error ? e.message : "Kies eerst een bedrijf." };
    }
  }

  // De relatie moet van dit bedrijf zijn en van de juiste soort. RLS
  // houdt andere bedrijven al tegen, maar een duidelijke melding is beter
  // dan een cryptische foreign-key-fout.
  const { data: relatie } = await supabase
    .from("relaties")
    .select("id, soort")
    .eq("id", relatieId)
    .eq("bedrijf_id", bedrijfId)
    .maybeSingle();
  if (!relatie) return { fout: "Die relatie hoort niet bij dit bedrijf." };
  const verwacht = soort === "verkoop" ? "klant" : "leverancier";
  if (relatie.soort !== verwacht && relatie.soort !== "beide") {
    return { fout: `Deze fiche is geen ${verwacht}. Pas eerst de soort aan op de fiche.` };
  }

  const verantwoordelijkeId = tekst(form, "verantwoordelijke_id");
  const statusRuw = tekst(form, "status");

  const velden = {
    relatie_id: relatieId,
    datum,
    gewenste_leverdatum: leverdatum,
    verantwoordelijke_id: verantwoordelijkeId,
    opmerking: tekst(form, "opmerking"),
  };

  let bestellingId = id;
  if (id) {
    const { error } = await supabase
      .from("bestellingen")
      .update({ ...velden, ...(isStatus(statusRuw) ? { status: statusRuw } : {}) })
      .eq("id", id);
    if (error) return { fout: error.message };
  } else {
    const { data, error } = await supabase
      .from("bestellingen")
      .insert({ ...velden, soort, bedrijf_id: bedrijfId, jaar: Number(datum.slice(0, 4)), aangemaakt_door: gebruikerId })
      .select("id")
      .single();
    if (error) return { fout: error.message };
    bestellingId = data.id;
  }

  // Lijnen vervangen.
  const { error: wisFout } = await supabase.from("bestellijnen").delete().eq("bestelling_id", bestellingId);
  if (wisFout) return { fout: wisFout.message };
  const { error: lijnFout } = await supabase
    .from("bestellijnen")
    .insert(gelezen.lijnen.map((l) => ({ ...l, bestelling_id: bestellingId })));
  if (lijnFout) return { fout: lijnFout.message };

  ververs(bestellingId!);
  redirect(`/bestellingen/${bestellingId}`);
}

/** Vanuit het kanban-bord: een kaart naar een andere kolom slepen. */
export async function statusWijzigen(id: string, status: string): Promise<BestellingStatusResultaat> {
  if (!isStatus(status)) return { fout: "Onbekende status." };
  await huidigeContext();
  const supabase = await supabaseServer();
  const { error } = await supabase.from("bestellingen").update({ status }).eq("id", id);
  if (error) return { fout: error.message };
  ververs(id);
  return {};
}

/**
 * Verwijderen kan alleen zolang er geen documenten aan hangen; anders
 * blokkeert de databank het en zetten we de bestelling op geannuleerd.
 */
export async function bestellingVerwijderen(id: string): Promise<BestellingStatusResultaat> {
  await huidigeContext();
  const supabase = await supabaseServer();
  const { error } = await supabase.from("bestellingen").delete().eq("id", id);
  if (error) {
    const { error: fout2 } = await supabase.from("bestellingen").update({ status: "geannuleerd" }).eq("id", id);
    if (fout2) return { fout: fout2.message };
  }
  ververs();
  redirect("/bestellingen");
}

/**
 * Een offerte (verkoop) of bestelbon (aankoop) maken van een bestelling.
 * De lijnen worden gekopieerd: het document is een momentopname. Wijzigt
 * de bestelling later, dan maak je een nieuw document of vernieuw je de
 * lijnen vanuit het documentscherm zolang het concept is.
 */
export async function documentMakenVanBestelling(bestellingId: string): Promise<BestellingStatusResultaat> {
  const ctx = await huidigeContext();
  const supabase = await supabaseServer();

  const { data: b } = await supabase
    .from("bestellingen")
    .select("*, bestellijnen(*)")
    .eq("id", bestellingId)
    .maybeSingle();
  if (!b) return { fout: "Bestelling niet gevonden." };
  const bestellingSoort = b.soort as string;
  if (!isSoort(bestellingSoort)) return { fout: "Onbekende soort bestelling." };
  if (b.status === "geannuleerd") return { fout: "Deze bestelling is geannuleerd." };

  const soort = SOORT_LABEL[bestellingSoort].document;
  const vandaagIso = new Date().toISOString().slice(0, 10);
  const vervaldatum = soort === "offerte" ? plusDagen(vandaagIso, 30) : b.gewenste_leverdatum;

  const { data: doc, error } = await supabase
    .from("documenten")
    .insert({
      bedrijf_id: b.bedrijf_id,
      soort,
      bestelling_id: b.id,
      relatie_id: b.relatie_id,
      datum: vandaagIso,
      jaar: Number(vandaagIso.slice(0, 4)),
      vervaldatum,
      opmerking: b.opmerking,
      aangemaakt_door: ctx.gebruikerId,
    })
    .select("id")
    .single();
  if (error) return { fout: error.message };

  type L = { product_id: string | null; omschrijving: string; aantal: number; eenheidsprijs: number; btw_tarief: number; korting_pct: number; volgorde: number };
  const lijnen = ((b.bestellijnen ?? []) as L[]).map((l) => ({
    document_id: doc.id,
    product_id: l.product_id,
    omschrijving: l.omschrijving,
    aantal: l.aantal,
    eenheidsprijs: l.eenheidsprijs,
    btw_tarief: l.btw_tarief,
    korting_pct: l.korting_pct,
    volgorde: l.volgorde,
  }));
  if (lijnen.length > 0) {
    const { error: lijnFout } = await supabase.from("documentlijnen").insert(lijnen);
    if (lijnFout) return { fout: lijnFout.message };
  }

  // Een nieuwe bestelling die een offerte krijgt, is "in behandeling".
  if (b.status === "nieuw") {
    await supabase.from("bestellingen").update({ status: "in_behandeling" }).eq("id", b.id);
  }

  ververs(b.id);
  redirect(`/documenten/${doc.id}`);
}
