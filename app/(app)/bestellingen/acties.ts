"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { huidigeContext, vereistBedrijf } from "@/lib/sessie";
import { tekst } from "@/lib/formulier";
import { leesLijnen } from "@/lib/lijnen";
import { DOCUMENT_LABEL, DOCUMENTEN_PER_SOORT, EEN_PER_BESTELLING, plusDagen, SOORT_LABEL, vandaag, VERGRENDELT_BESTELLING } from "@/lib/bestelling";
import { BESTELLING_STATUSSEN, type BestellingSoort, type BestellingStatus, type DocumentSoort } from "@/lib/types";

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

  // Bedrijf: van de bestaande bestelling, of het actieve bedrijf.
  // Een bestelling met een definitieve leverbon, ontvangstbon of factuur
  // is vergrendeld: klant en lijnen liggen dan vast, want die staan al
  // op een document dat de klant kreeg of dat de voorraad veranderde.
  let bedrijfId: string;
  let gebruikerId: string;
  let vergrendeld = false;
  if (id) {
    const ctx = await huidigeContext();
    gebruikerId = ctx.gebruikerId;
    const { data } = await supabase.from("bestellingen").select("bedrijf_id, soort, relatie_id, documenten(soort, status)").eq("id", id).maybeSingle();
    if (!data) return { fout: "Bestelling niet gevonden." };
    bedrijfId = data.bedrijf_id;
    vergrendeld = ((data.documenten ?? []) as { soort: DocumentSoort; status: string }[]).some(
      (d) => VERGRENDELT_BESTELLING.includes(d.soort) && d.status === "definitief",
    );
    if (vergrendeld && relatieId !== data.relatie_id) {
      return { fout: "De klant of leverancier kan niet meer veranderen: er is al een definitief document." };
    }
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

  const gelezen = leesLijnen(form.get("lijnen"));
  if ("fout" in gelezen) return { fout: gelezen.fout };
  if (!vergrendeld && gelezen.lijnen.length === 0) return { fout: "Voeg minstens één lijn toe." };

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

  if (vergrendeld) {
    ververs(bestellingId!);
    redirect(`/bestellingen/${bestellingId}`);
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
 * Een document maken vanuit een bestelling: offerte, leverbon of factuur
 * bij een verkooporder; bestelbon of ontvangstbon bij een aankooporder.
 *
 * De lijnen worden gekopieerd: het document is een momentopname. Wijzigt
 * de bestelling nog, dan vernieuw je de lijnen vanuit het documentscherm
 * zolang het document een concept is.
 */
export async function documentMakenVanBestelling(
  bestellingId: string,
  soort: DocumentSoort,
): Promise<BestellingStatusResultaat> {
  const ctx = await huidigeContext();
  const supabase = await supabaseServer();

  const { data: b } = await supabase
    .from("bestellingen")
    .select("*, bestellijnen(*), relaties(betaaltermijn_dagen), documenten(soort, status)")
    .eq("id", bestellingId)
    .maybeSingle();
  if (!b) return { fout: "Bestelling niet gevonden." };
  const bestellingSoort = b.soort as string;
  if (!isSoort(bestellingSoort)) return { fout: "Onbekende soort bestelling." };
  if (b.status === "geannuleerd") return { fout: "Deze bestelling is geannuleerd." };
  if (!DOCUMENTEN_PER_SOORT[bestellingSoort].includes(soort)) {
    return { fout: `Een ${DOCUMENT_LABEL[soort].toLowerCase()} hoort niet bij een ${SOORT_LABEL[bestellingSoort].enkel}.` };
  }

  const bestaande = (b.documenten ?? []) as { soort: DocumentSoort; status: string }[];
  if (EEN_PER_BESTELLING.includes(soort) && bestaande.some((d) => d.soort === soort && d.status !== "geannuleerd")) {
    return { fout: `Er is al een ${DOCUMENT_LABEL[soort].toLowerCase()} voor deze bestelling. Annuleer die eerst als je een nieuwe wilt.` };
  }
  if ((b.bestellijnen ?? []).length === 0) return { fout: "Deze bestelling heeft nog geen lijnen." };

  const datumIso = vandaag();
  let vervaldatum: string | null = null;
  if (soort === "offerte") vervaldatum = plusDagen(datumIso, 30);
  if (soort === "bestelbon") vervaldatum = b.gewenste_leverdatum;
  if (soort === "factuur") {
    const termijn = (b.relaties as { betaaltermijn_dagen: number | null } | null)?.betaaltermijn_dagen ?? ctx.instellingen.betaaltermijn_dagen;
    vervaldatum = plusDagen(datumIso, termijn);
  }

  const { data: doc, error } = await supabase
    .from("documenten")
    .insert({
      bedrijf_id: b.bedrijf_id,
      soort,
      bestelling_id: b.id,
      relatie_id: b.relatie_id,
      datum: datumIso,
      jaar: Number(datumIso.slice(0, 4)),
      vervaldatum,
      opmerking: b.opmerking,
      aangemaakt_door: ctx.gebruikerId,
    })
    .select("id")
    .single();
  if (error) {
    if (error.message.includes("een_actief_document_per_bestelling")) {
      return { fout: `Er is al een ${DOCUMENT_LABEL[soort].toLowerCase()} voor deze bestelling.` };
    }
    return { fout: error.message };
  }

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
  const { error: lijnFout } = await supabase.from("documentlijnen").insert(lijnen);
  if (lijnFout) return { fout: lijnFout.message };

  // Een nieuwe bestelling waar al een document voor is, is "in behandeling".
  if (b.status === "nieuw") {
    await supabase.from("bestellingen").update({ status: "in_behandeling" }).eq("id", b.id);
  }

  ververs(b.id);
  redirect(`/documenten/${doc.id}`);
}
