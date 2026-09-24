"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { huidigeContext } from "@/lib/sessie";
import { haalPdfGegevens, maakPdf } from "@/lib/pdf/maak";

export type DocumentResultaat = { fout?: string };

function ververs(id: string, bestellingId?: string | null) {
  revalidatePath("/documenten");
  revalidatePath(`/documenten/${id}`);
  revalidatePath("/bestellingen");
  if (bestellingId) revalidatePath(`/bestellingen/${bestellingId}`);
}

/**
 * Definitief maken: de pdf wordt gemaakt en bewaard in de opslag, en het
 * document kan daarna niet meer veranderen. Dat is het moment waarop je
 * het naar de klant of leverancier stuurt.
 */
export async function documentDefinitiefMaken(id: string): Promise<DocumentResultaat> {
  await huidigeContext();
  const supabase = await supabaseServer();

  const { data: d } = await supabase.from("documenten").select("id, status, bedrijf_id, bestelling_id").eq("id", id).maybeSingle();
  if (!d) return { fout: "Document niet gevonden." };
  if (d.status !== "concept") return { fout: "Alleen een concept kan definitief gemaakt worden." };

  // Eerst de status, dan de pdf: de pdf moet "definitief" tonen, niet "concept".
  const { error } = await supabase
    .from("documenten")
    .update({ status: "definitief", definitief_op: new Date().toISOString() })
    .eq("id", id);
  if (error) return { fout: error.message };

  const gegevens = await haalPdfGegevens(supabase, id);
  if (!gegevens) return { fout: "Kon de gegevens voor de pdf niet ophalen." };
  const pdf = await maakPdf(gegevens);

  const pad = `${d.bedrijf_id}/${id}.pdf`;
  const { error: opslagFout } = await supabase.storage
    .from("documenten")
    .upload(pad, pdf, { contentType: "application/pdf", upsert: true });
  if (opslagFout) {
    // Terugdraaien: liever een concept dan een definitief document zonder pdf.
    await supabase.from("documenten").update({ status: "concept", definitief_op: null }).eq("id", id);
    return { fout: `De pdf kon niet bewaard worden: ${opslagFout.message}` };
  }
  await supabase.from("documenten").update({ pdf_pad: pad }).eq("id", id);

  ververs(id, d.bestelling_id);
  return {};
}

/** Annuleren: het nummer blijft bestaan, het document telt niet meer mee. */
export async function documentAnnuleren(id: string): Promise<DocumentResultaat> {
  await huidigeContext();
  const supabase = await supabaseServer();
  const { data: d } = await supabase.from("documenten").select("bestelling_id").eq("id", id).maybeSingle();
  const { error } = await supabase.from("documenten").update({ status: "geannuleerd" }).eq("id", id);
  if (error) return { fout: error.message };
  ververs(id, d?.bestelling_id);
  return {};
}

/** Een concept verwijderen. Definitieve documenten kun je alleen annuleren. */
export async function documentVerwijderen(id: string): Promise<DocumentResultaat> {
  await huidigeContext();
  const supabase = await supabaseServer();
  const { data: d } = await supabase.from("documenten").select("status, bestelling_id").eq("id", id).maybeSingle();
  if (!d) return { fout: "Document niet gevonden." };
  if (d.status !== "concept") return { fout: "Een definitief document kun je niet verwijderen, wel annuleren." };
  const { error } = await supabase.from("documenten").delete().eq("id", id);
  if (error) return { fout: error.message };
  ververs(id, d.bestelling_id);
  redirect(d.bestelling_id ? `/bestellingen/${d.bestelling_id}` : "/documenten");
}

/** Zolang het concept is: de lijnen opnieuw overnemen uit de bestelling. */
export async function lijnenVernieuwen(id: string): Promise<DocumentResultaat> {
  await huidigeContext();
  const supabase = await supabaseServer();
  const { data: d } = await supabase
    .from("documenten")
    .select("status, bestelling_id, bestellingen(opmerking, bestellijnen(*))")
    .eq("id", id)
    .maybeSingle();
  if (!d) return { fout: "Document niet gevonden." };
  if (d.status !== "concept") return { fout: "Alleen bij een concept." };
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
