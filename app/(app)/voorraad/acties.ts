"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { huidigeContext } from "@/lib/sessie";
import { tekst } from "@/lib/formulier";
import { leesGetal } from "@/lib/geld";
import { cent } from "@/lib/lijnen";
import { vandaag } from "@/lib/bestelling";

export type VoorraadStatus = { fout?: string; goed?: string };

/**
 * De voorraad met de hand aanpassen, zonder document. Twee manieren:
 *
 *   beginvoorraad  "er komen N stuks bij" (de start van het project)
 *   telling        "we hebben er N geteld"; het verschil met wat het
 *                  systeem denkt, wordt een correctie
 *
 * Leveringen en ontvangsten gaan NIET hier langs, maar via leverbonnen
 * en ontvangstbonnen: dan blijft elke beweging aan een document gekoppeld.
 */
export async function voorraadAanpassen(productId: string, _v: VoorraadStatus, form: FormData): Promise<VoorraadStatus> {
  const ctx = await huidigeContext();
  const supabase = await supabaseServer();

  const { data: p } = await supabase
    .from("producten")
    .select("id, bedrijf_id, voorraad, voorraad_bijhouden, eenheid")
    .eq("id", productId)
    .maybeSingle();
  if (!p) return { fout: "Product niet gevonden." };
  if (!p.voorraad_bijhouden) return { fout: "Voor dit product wordt geen voorraad bijgehouden." };

  const wijze = tekst(form, "wijze");
  const getal = leesGetal(form.get("aantal"));
  if (getal === null) return { fout: "Vul een aantal in." };
  const opmerking = tekst(form, "opmerking");
  const datumIso = tekst(form, "datum") ?? vandaag();

  let aantal: number;
  let soort: "beginvoorraad" | "correctie";
  let uitleg: string;
  if (wijze === "telling") {
    if (getal < 0) return { fout: "Een telling kan niet negatief zijn." };
    aantal = cent(getal - Number(p.voorraad));
    soort = "correctie";
    uitleg = `Telling: ${getal} ${p.eenheid} geteld`;
    if (aantal === 0) return { goed: "De telling klopt met de voorraad; er is niets aangepast." };
  } else {
    if (getal <= 0) return { fout: "De beginvoorraad moet groter zijn dan 0." };
    aantal = cent(getal);
    soort = "beginvoorraad";
    uitleg = "Beginvoorraad";
  }

  const { error } = await supabase.from("voorraadmutaties").insert({
    bedrijf_id: p.bedrijf_id,
    product_id: p.id,
    datum: datumIso,
    aantal,
    soort,
    opmerking: opmerking ? `${uitleg}. ${opmerking}` : uitleg,
    aangemaakt_door: ctx.gebruikerId,
  });
  if (error) return { fout: error.message };

  revalidatePath("/voorraad", "layout");
  revalidatePath("/producten");
  revalidatePath("/");
  return {
    goed:
      soort === "correctie"
        ? `Voorraad gecorrigeerd met ${aantal > 0 ? "+" : ""}${String(aantal).replace(".", ",")} ${p.eenheid}.`
        : `${String(aantal).replace(".", ",")} ${p.eenheid} toegevoegd.`,
  };
}
