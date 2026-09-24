"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { huidigeContext, vereistBedrijf } from "@/lib/sessie";
import { tekst } from "@/lib/formulier";
import { leesLijnen } from "@/lib/lijnen";
import { vandaag } from "@/lib/bestelling";

export type AankoopStatus = { fout?: string; goed?: string };

function ververs(id?: string) {
  revalidatePath("/aankopen");
  if (id) revalidatePath(`/aankopen/${id}`);
  revalidatePath("/bestellingen");
  revalidatePath("/dagboeken");
  revalidatePath("/bank");
  revalidatePath("/rapporten");
  revalidatePath("/");
}

const DATUM = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Een aankoopfactuur bewaren (nieuw of concept). Het is een factuur die
 * we KRIJGEN: het nummer is dat van de leverancier, de lijnen bepalen op
 * welke kostenrekening er geboekt wordt. Een pdf van de leverancier kan
 * als bijlage mee.
 */
export async function aankoopfactuurOpslaan(id: string | null, _v: AankoopStatus, form: FormData): Promise<AankoopStatus> {
  const supabase = await supabaseServer();

  const relatieId = tekst(form, "relatie_id");
  if (!relatieId) return { fout: "Kies een leverancier." };
  const datumIso = tekst(form, "datum");
  if (!datumIso || !DATUM.test(datumIso)) return { fout: "Vul een geldige factuurdatum in." };
  const verval = tekst(form, "vervaldatum");
  if (verval && !DATUM.test(verval)) return { fout: "Ongeldige vervaldatum." };
  const gelezen = leesLijnen(form.get("lijnen"));
  if ("fout" in gelezen) return { fout: gelezen.fout };
  if (gelezen.lijnen.length === 0) return { fout: "Voeg minstens één lijn toe." };

  let bedrijfId: string;
  let gebruikerId: string;
  if (id) {
    const ctx = await huidigeContext();
    gebruikerId = ctx.gebruikerId;
    const { data } = await supabase.from("documenten").select("bedrijf_id, status, soort").eq("id", id).maybeSingle();
    if (!data || (data.soort !== "aankoopfactuur" && data.soort !== "aankoopcreditnota")) return { fout: "Aankoopfactuur niet gevonden." };
    if (data.status !== "concept") return { fout: "Een definitieve aankoopfactuur kan niet meer gewijzigd worden." };
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

  const { data: rel } = await supabase.from("relaties").select("soort").eq("id", relatieId).eq("bedrijf_id", bedrijfId).maybeSingle();
  if (!rel) return { fout: "Die leverancier hoort niet bij dit bedrijf." };
  if (rel.soort !== "leverancier" && rel.soort !== "beide") return { fout: "Deze fiche is geen leverancier." };

  const velden = {
    relatie_id: relatieId,
    extern_nummer: tekst(form, "extern_nummer"),
    datum: datumIso,
    jaar: Number(datumIso.slice(0, 4)),
    vervaldatum: verval,
    opmerking: tekst(form, "opmerking"),
  };

  let docId = id;
  if (id) {
    const { error } = await supabase.from("documenten").update(velden).eq("id", id);
    if (error) return { fout: error.message };
  } else {
    const { data, error } = await supabase
      .from("documenten")
      .insert({ ...velden, bedrijf_id: bedrijfId, soort: "aankoopfactuur", aangemaakt_door: gebruikerId })
      .select("id")
      .single();
    if (error) return { fout: error.message };
    docId = data.id;
  }

  await supabase.from("documentlijnen").delete().eq("document_id", docId);
  const { error: lijnFout } = await supabase.from("documentlijnen").insert(
    gelezen.lijnen.map((l) => ({
      document_id: docId,
      product_id: l.product_id,
      rekening_id: l.rekening_id ?? null,
      omschrijving: l.omschrijving,
      aantal: l.aantal,
      eenheidsprijs: l.eenheidsprijs,
      btw_tarief: l.btw_tarief,
      korting_pct: l.korting_pct,
      volgorde: l.volgorde,
    })),
  );
  if (lijnFout) return { fout: lijnFout.message };

  // Bijlage: de pdf zoals de leverancier ze stuurde.
  const bijlage = form.get("bijlage");
  if (bijlage instanceof File && bijlage.size > 0) {
    if (bijlage.type !== "application/pdf") return { fout: "De bijlage moet een pdf zijn. De factuur zelf is wel bewaard." };
    const pad = `${bedrijfId}/${docId}-bijlage.pdf`;
    const { error } = await supabase.storage
      .from("documenten")
      .upload(pad, await bijlage.arrayBuffer(), { contentType: "application/pdf", upsert: true });
    if (error) return { fout: `De factuur is bewaard, maar de bijlage niet: ${error.message}` };
    await supabase.from("documenten").update({ pdf_pad: pad }).eq("id", docId);
  }

  ververs(docId!);
  if (!id) redirect(`/aankopen/${docId}`);
  return { goed: "Bewaard." };
}

/** Definitief: de factuur komt in het dagboek aankopen. */
export async function aankoopfactuurDefinitief(id: string): Promise<AankoopStatus> {
  await huidigeContext();
  const supabase = await supabaseServer();
  const { error } = await supabase.rpc("document_definitief", { p_id: id });
  if (error) {
    const fout = error.message.includes("een_actief_document_per_bestelling")
      ? "Er is al een aankoopfactuur voor deze bestelling."
      : error.message;
    return { fout };
  }
  ververs(id);
  return {};
}

/** Een concept verwijderen, met de bijlage. */
export async function aankoopfactuurVerwijderen(id: string): Promise<AankoopStatus> {
  await huidigeContext();
  const supabase = await supabaseServer();
  const { data: d } = await supabase.from("documenten").select("status, pdf_pad, bestelling_id").eq("id", id).maybeSingle();
  if (!d) return { fout: "Niet gevonden." };
  if (d.status !== "concept") return { fout: "Een definitieve aankoopfactuur kan niet verwijderd worden." };
  const { error } = await supabase.from("documenten").delete().eq("id", id);
  if (error) return { fout: error.message };
  if (d.pdf_pad) await supabase.storage.from("documenten").remove([d.pdf_pad]);
  ververs();
  redirect(d.bestelling_id ? `/bestellingen/${d.bestelling_id}` : "/aankopen");
}

/**
 * Een creditnota van de leverancier registreren bij een definitieve
 * aankoopfactuur. Ze begint met de lijnen van de factuur; de student
 * houdt over wat de leverancier crediteert.
 */
export async function aankoopcreditnotaMaken(factuurId: string): Promise<AankoopStatus> {
  const ctx = await huidigeContext();
  const supabase = await supabaseServer();
  const { data: f } = await supabase.from("documenten").select("*, documentlijnen(*)").eq("id", factuurId).maybeSingle();
  if (!f || f.soort !== "aankoopfactuur" || f.status !== "definitief") {
    return { fout: "Een creditnota van een leverancier hoort bij een definitieve aankoopfactuur." };
  }
  const datumIso = vandaag();
  const { data: cn, error } = await supabase
    .from("documenten")
    .insert({
      bedrijf_id: f.bedrijf_id,
      soort: "aankoopcreditnota",
      relatie_id: f.relatie_id,
      bron_document_id: f.id,
      bestelling_id: f.bestelling_id,
      datum: datumIso,
      jaar: Number(datumIso.slice(0, 4)),
      aangemaakt_door: ctx.gebruikerId,
    })
    .select("id")
    .single();
  if (error) return { fout: error.message };

  type L = { product_id: string | null; rekening_id: string | null; omschrijving: string; aantal: number; eenheidsprijs: number; btw_tarief: number; korting_pct: number; volgorde: number };
  const lijnen = ((f.documentlijnen ?? []) as L[]).map((l) => ({
    document_id: cn.id,
    product_id: l.product_id,
    rekening_id: l.rekening_id,
    omschrijving: l.omschrijving,
    aantal: l.aantal,
    eenheidsprijs: l.eenheidsprijs,
    btw_tarief: l.btw_tarief,
    korting_pct: l.korting_pct,
    volgorde: l.volgorde,
  }));
  if (lijnen.length) {
    const { error: e2 } = await supabase.from("documentlijnen").insert(lijnen);
    if (e2) return { fout: e2.message };
  }
  ververs(cn.id);
  redirect(`/aankopen/${cn.id}`);
}
