"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { huidigeContext, vereistBedrijf } from "@/lib/sessie";
import { tekst } from "@/lib/formulier";
import { leesGetal } from "@/lib/geld";
import { cent } from "@/lib/lijnen";
import { vandaag } from "@/lib/bestelling";

export type BoekStatus = { fout?: string; goed?: string };

function ververs() {
  revalidatePath("/bank");
  revalidatePath("/dagboeken");
  revalidatePath("/rapporten");
  revalidatePath("/grootboek", "layout");
  revalidatePath("/aankopen", "layout");
  revalidatePath("/documenten", "layout");
  revalidatePath("/");
}

const DATUM = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Een regel van het rekeninguittreksel boeken. Het bedrag wordt positief
 * ingevuld; de richting (ontvangst of uitgave) bepaalt het teken. De
 * databankfunctie betaling_boeken controleert de rest: niet meer
 * ontvangen dan er openstaat, alleen voor het eigen bedrijf, ...
 */
export async function betalingBoeken(_v: BoekStatus, form: FormData): Promise<BoekStatus> {
  let ctx;
  try {
    ctx = await vereistBedrijf();
  } catch (e) {
    return { fout: e instanceof Error ? e.message : "Kies eerst een bedrijf." };
  }
  const supabase = await supabaseServer();

  const datumIso = tekst(form, "datum");
  if (!datumIso || !DATUM.test(datumIso)) return { fout: "Vul de datum van het uittreksel in." };
  const bedrag = leesGetal(form.get("bedrag"));
  if (bedrag === null || bedrag <= 0) return { fout: "Vul een bedrag groter dan 0 in." };
  const richting = tekst(form, "richting");
  if (richting !== "in" && richting !== "uit") return { fout: "Kies of het geld binnenkomt of buitengaat." };

  const koppeling = tekst(form, "koppeling");
  let document: string | null = null;
  let rekening: string | null = null;
  if (koppeling === "factuur") document = tekst(form, "factuur_id");
  else if (koppeling === "aankoop") document = tekst(form, "aankoop_id");
  else rekening = tekst(form, "rekening_id");
  if (koppeling === "factuur" && !document) return { fout: "Kies de factuur die betaald wordt." };
  if (koppeling === "aankoop" && !document) return { fout: "Kies de aankoopfactuur die je betaalt." };
  if (koppeling === "rekening" && !rekening) return { fout: "Kies een tegenrekening." };

  const { error } = await supabase.rpc("betaling_boeken", {
    p_bedrijf: ctx.bedrijf.id,
    p_datum: datumIso,
    p_uittreksel: tekst(form, "uittreksel") ?? "",
    p_omschrijving: tekst(form, "omschrijving") ?? "",
    p_bedrag: cent(richting === "in" ? bedrag : -bedrag),
    p_document: document,
    p_rekening: rekening,
  });
  if (error) return { fout: error.message };

  ververs();
  return { goed: "Geboekt in het financieel dagboek." };
}

/**
 * Een diverse boeking met vrije lijnen. De lijnen komen als JSON:
 * [{ rekening_id, omschrijving, debet, credit }, ...].
 */
export async function diversBoeken(_v: BoekStatus, form: FormData): Promise<BoekStatus> {
  let ctx;
  try {
    ctx = await vereistBedrijf();
  } catch (e) {
    return { fout: e instanceof Error ? e.message : "Kies eerst een bedrijf." };
  }
  const supabase = await supabaseServer();

  const datumIso = tekst(form, "datum");
  if (!datumIso || !DATUM.test(datumIso)) return { fout: "Vul een datum in." };
  const omschrijving = tekst(form, "omschrijving");
  if (!omschrijving) return { fout: "Geef de boeking een omschrijving." };

  let ruw: unknown;
  try {
    ruw = JSON.parse(String(form.get("lijnen") ?? "[]"));
  } catch {
    return { fout: "De lijnen konden niet gelezen worden." };
  }
  if (!Array.isArray(ruw)) return { fout: "De lijnen konden niet gelezen worden." };

  const lijnen: { rekening_id: string; omschrijving: string | null; debet: number; credit: number }[] = [];
  for (const [i, r] of ruw.entries()) {
    const o = r as Record<string, unknown>;
    const debet = cent(Number(String(o.debet ?? "").replace(",", ".")) || 0);
    const credit = cent(Number(String(o.credit ?? "").replace(",", ".")) || 0);
    const rek = typeof o.rekening_id === "string" ? o.rekening_id : "";
    if (!rek && !debet && !credit) continue;
    if (!rek) return { fout: `Lijn ${i + 1}: kies een rekening.` };
    if (debet < 0 || credit < 0) return { fout: `Lijn ${i + 1}: bedragen zijn positief; kies debet of credit.` };
    if (debet > 0 && credit > 0) return { fout: `Lijn ${i + 1}: vul debet óf credit in, niet allebei.` };
    if (!debet && !credit) return { fout: `Lijn ${i + 1}: vul een bedrag in.` };
    lijnen.push({ rekening_id: rek, omschrijving: typeof o.omschrijving === "string" ? o.omschrijving : null, debet, credit });
  }
  if (lijnen.length < 2) return { fout: "Een boeking heeft minstens twee lijnen." };
  const d = cent(lijnen.reduce((t, l) => t + l.debet, 0));
  const c = cent(lijnen.reduce((t, l) => t + l.credit, 0));
  if (d !== c) return { fout: `Niet in evenwicht: debet ${d.toFixed(2)} en credit ${c.toFixed(2)}.` };

  const { error } = await supabase.rpc("divers_boeken", {
    p_bedrijf: ctx.bedrijf.id,
    p_datum: datumIso,
    p_omschrijving: omschrijving,
    p_lijnen: lijnen,
  });
  if (error) return { fout: error.message };

  ververs();
  return { goed: "Geboekt in het dagboek diverse verrichtingen." };
}

/** Een financiële of diverse boeking verwijderen. */
export async function boekingVerwijderen(id: string): Promise<BoekStatus> {
  await huidigeContext();
  const supabase = await supabaseServer();
  const { error } = await supabase.rpc("boeking_verwijderen", { p_id: id });
  if (error) return { fout: error.message };
  ververs();
  return { goed: "Boeking verwijderd." };
}

/** De voorraad op de balans (rekening 340) gelijkzetten met de werkelijke voorraad. */
export async function voorraadOpBalans(_v: BoekStatus, form: FormData): Promise<BoekStatus> {
  let ctx;
  try {
    ctx = await vereistBedrijf();
  } catch (e) {
    return { fout: e instanceof Error ? e.message : "Kies eerst een bedrijf." };
  }
  const supabase = await supabaseServer();
  const datumIso = tekst(form, "datum") ?? vandaag();
  const { data, error } = await supabase.rpc("voorraad_op_balans", { p_bedrijf: ctx.bedrijf.id, p_datum: datumIso });
  if (error) return { fout: error.message };
  ververs();
  const verschil = Number(data);
  if (verschil === 0) return { goed: "De balans toonde de voorraad al correct; er is niets geboekt." };
  return {
    goed: `Geboekt: de voorraad op de balans ${verschil > 0 ? "steeg" : "daalde"} met ${Math.abs(verschil).toFixed(2).replace(".", ",")} euro.`,
  };
}
