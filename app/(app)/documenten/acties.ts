"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { huidigeContext } from "@/lib/sessie";
import { haalPdfGegevens, maakPdf } from "@/lib/pdf/maak";
import { tekst, vinkje } from "@/lib/formulier";
import { leesLijnen } from "@/lib/lijnen";
import { vandaag } from "@/lib/bestelling";

export type DocumentResultaat = { fout?: string; melding?: string };

function ververs(id: string, bestellingId?: string | null) {
  revalidatePath("/documenten");
  revalidatePath(`/documenten/${id}`);
  revalidatePath("/bestellingen");
  revalidatePath("/voorraad", "layout");
  revalidatePath("/producten");
  revalidatePath("/");
  if (bestellingId) revalidatePath(`/bestellingen/${bestellingId}`);
}

/**
 * De Engelse standaardmeldingen van de databank die een student kan
 * tegenkomen, in gewone taal. Onze eigen meldingen (uit de functies
 * document_definitief en document_annuleren) zijn al Nederlands.
 */
function vertaal(melding: string): string {
  if (melding.includes("een_actief_document_per_bestelling")) {
    return "Er is al een lopend document van deze soort voor deze bestelling.";
  }
  return melding;
}

/**
 * Definitief maken. De databankfunctie doet in één keer alles wat bij
 * deze stap hoort: de status, de voorraad (leverbon, ontvangstbon,
 * retour) en de status van de bestelling. Daarna maken en bewaren we de
 * pdf. Lukt dat bewaren niet, dan blijft het document toch definitief:
 * de pdf wordt dan bij het openen opnieuw gemaakt, met dezelfde inhoud.
 */
export async function documentDefinitiefMaken(id: string): Promise<DocumentResultaat> {
  await huidigeContext();
  const supabase = await supabaseServer();

  const { data: d } = await supabase.from("documenten").select("bedrijf_id, bestelling_id").eq("id", id).maybeSingle();
  if (!d) return { fout: "Document niet gevonden." };

  const { error } = await supabase.rpc("document_definitief", { p_id: id });
  if (error) return { fout: vertaal(error.message) };

  let melding: string | undefined;
  const gegevens = await haalPdfGegevens(supabase, id);
  if (gegevens) {
    const pdf = await maakPdf(gegevens);
    const pad = `${d.bedrijf_id}/${id}.pdf`;
    const { error: opslagFout } = await supabase.storage
      .from("documenten")
      .upload(pad, pdf, { contentType: "application/pdf", upsert: true });
    if (opslagFout) {
      melding = "Het document is definitief, maar de pdf kon niet bewaard worden. Hij wordt bij het openen opnieuw gemaakt.";
    } else {
      await supabase.from("documenten").update({ pdf_pad: pad }).eq("id", id);
    }
  }

  ververs(id, d.bestelling_id);
  return { melding };
}

/**
 * Annuleren. Een definitieve leverbon of ontvangstbon zet de voorraad
 * terug; een definitieve factuur of creditnota kan niet (daarvoor maak
 * je een creditnota). Het nummer blijft altijd bestaan.
 */
export async function documentAnnuleren(id: string): Promise<DocumentResultaat> {
  await huidigeContext();
  const supabase = await supabaseServer();
  const { data: d } = await supabase.from("documenten").select("bestelling_id").eq("id", id).maybeSingle();
  const { error } = await supabase.rpc("document_annuleren", { p_id: id });
  if (error) return { fout: vertaal(error.message) };
  ververs(id, d?.bestelling_id);
  return {};
}

/** Een concept verwijderen. Definitieve documenten kun je alleen annuleren. */
export async function documentVerwijderen(id: string): Promise<DocumentResultaat> {
  await huidigeContext();
  const supabase = await supabaseServer();
  const { data: d } = await supabase.from("documenten").select("status, bestelling_id, bron_document_id").eq("id", id).maybeSingle();
  if (!d) return { fout: "Document niet gevonden." };
  if (d.status !== "concept") return { fout: "Een definitief document kun je niet verwijderen, wel annuleren." };
  const { error } = await supabase.from("documenten").delete().eq("id", id);
  if (error) return { fout: vertaal(error.message) };
  ververs(id, d.bestelling_id);
  if (d.bron_document_id) redirect(`/documenten/${d.bron_document_id}`);
  redirect(d.bestelling_id ? `/bestellingen/${d.bestelling_id}` : "/documenten");
}

/** Zolang het concept is: de lijnen opnieuw overnemen uit de bestelling. */
export async function lijnenVernieuwen(id: string): Promise<DocumentResultaat> {
  await huidigeContext();
  const supabase = await supabaseServer();
  const { data: d } = await supabase
    .from("documenten")
    .select("status, soort, bestelling_id, bestellingen(opmerking, bestellijnen(*))")
    .eq("id", id)
    .maybeSingle();
  if (!d) return { fout: "Document niet gevonden." };
  if (d.status !== "concept") return { fout: "Alleen bij een concept." };
  if (d.soort === "creditnota") return { fout: "Een creditnota volgt de factuur, niet de bestelling." };
  type L = { product_id: string | null; omschrijving: string; aantal: number; eenheidsprijs: number; btw_tarief: number; korting_pct: number; volgorde: number };
  const bron = d.bestellingen as unknown as { opmerking: string | null; bestellijnen: L[] } | null;
  if (!bron) return { fout: "Dit document hangt niet aan een bestelling." };

  await supabase.from("documentlijnen").delete().eq("document_id", id);
  const lijnen = (bron.bestellijnen ?? []).map((l) => ({
    document_id: id,
    product_id: l.product_id,
    omschrijving: l.omschrijving,
    aantal: l.aantal,
    eenheidsprijs: l.eenheidsprijs,
    btw_tarief: l.btw_tarief,
    korting_pct: l.korting_pct,
    volgorde: l.volgorde,
  }));
  if (lijnen.length > 0) {
    const { error } = await supabase.from("documentlijnen").insert(lijnen);
    if (error) return { fout: error.message };
  }
  await supabase.from("documenten").update({ opmerking: bron.opmerking }).eq("id", id);

  ververs(id, d.bestelling_id);
  return {};
}

// ---------- Creditnota ----------

/**
 * Een creditnota maken bij een definitieve factuur. Ze begint met alle
 * lijnen van de factuur; de student haalt weg of vermindert wat niet
 * gecrediteerd wordt.
 */
export async function creditnotaMaken(factuurId: string): Promise<DocumentResultaat> {
  const ctx = await huidigeContext();
  const supabase = await supabaseServer();

  const { data: f } = await supabase
    .from("documenten")
    .select("*, documentlijnen(*)")
    .eq("id", factuurId)
    .maybeSingle();
  if (!f) return { fout: "Factuur niet gevonden." };
  if (f.soort !== "factuur" || f.status !== "definitief") {
    return { fout: "Een creditnota maak je bij een definitieve factuur." };
  }

  const datumIso = vandaag();
  const { data: cn, error } = await supabase
    .from("documenten")
    .insert({
      bedrijf_id: f.bedrijf_id,
      soort: "creditnota",
      bestelling_id: f.bestelling_id,
      relatie_id: f.relatie_id,
      bron_document_id: f.id,
      datum: datumIso,
      jaar: Number(datumIso.slice(0, 4)),
      aangemaakt_door: ctx.gebruikerId,
    })
    .select("id")
    .single();
  if (error) return { fout: vertaal(error.message) };

  type L = { product_id: string | null; omschrijving: string; aantal: number; eenheidsprijs: number; btw_tarief: number; korting_pct: number; volgorde: number };
  const lijnen = ((f.documentlijnen ?? []) as L[]).map((l) => ({
    document_id: cn.id,
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

  ververs(cn.id, f.bestelling_id);
  redirect(`/documenten/${cn.id}`);
}

/** Een concept-creditnota bewaren: lijnen, datum, opmerking en retour. */
export async function creditnotaOpslaan(id: string, _v: DocumentResultaat, form: FormData): Promise<DocumentResultaat> {
  await huidigeContext();
  const supabase = await supabaseServer();

  const { data: d } = await supabase.from("documenten").select("soort, status, bestelling_id").eq("id", id).maybeSingle();
  if (!d) return { fout: "Document niet gevonden." };
  if (d.soort !== "creditnota" || d.status !== "concept") return { fout: "Alleen een concept-creditnota kan bewerkt worden." };

  const datumIso = tekst(form, "datum");
  if (!datumIso || !/^\d{4}-\d{2}-\d{2}$/.test(datumIso)) return { fout: "Vul een geldige datum in." };
  const gelezen = leesLijnen(form.get("lijnen"));
  if ("fout" in gelezen) return { fout: gelezen.fout };
  if (gelezen.lijnen.length === 0) return { fout: "Een creditnota heeft minstens één lijn." };

  const { error } = await supabase
    .from("documenten")
    .update({ datum: datumIso, opmerking: tekst(form, "opmerking"), voorraad_terug: vinkje(form, "voorraad_terug") })
    .eq("id", id);
  if (error) return { fout: error.message };

  await supabase.from("documentlijnen").delete().eq("document_id", id);
  const { error: lijnFout } = await supabase
    .from("documentlijnen")
    .insert(gelezen.lijnen.map((l) => ({ ...l, document_id: id })));
  if (lijnFout) return { fout: lijnFout.message };

  ververs(id, d.bestelling_id);
  return { melding: "Bewaard." };
}
