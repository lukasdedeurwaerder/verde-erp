"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { huidigeContext, vereistBedrijf } from "@/lib/sessie";
import { tekst, verplicht, vinkje } from "@/lib/formulier";
import { leesGetal } from "@/lib/geld";
import type { RelatieSoort } from "@/lib/types";
import { padVoor, type Pagina } from "./soort";

export type RelatieStatus = { fout?: string };

const SOORTEN: RelatieSoort[] = ["klant", "leverancier", "beide"];

export async function relatieOpslaan(
  pagina: Pagina,
  id: string | null,
  _vorige: RelatieStatus,
  form: FormData,
): Promise<RelatieStatus> {
  const naam = verplicht(form, "naam");
  if (!naam) return { fout: "Vul een naam in." };

  const soortRuw = tekst(form, "soort") as RelatieSoort | null;
  const soort = soortRuw && SOORTEN.includes(soortRuw) ? soortRuw : pagina;

  const betaaltermijn = leesGetal(form.get("betaaltermijn_dagen"));
  if (betaaltermijn !== null && (betaaltermijn < 0 || !Number.isInteger(betaaltermijn))) {
    return { fout: "De betaaltermijn moet een geheel aantal dagen zijn." };
  }

  const velden = {
    soort,
    naam,
    contactpersoon: tekst(form, "contactpersoon"),
    email: tekst(form, "email"),
    telefoon: tekst(form, "telefoon"),
    straat: tekst(form, "straat"),
    postcode: tekst(form, "postcode"),
    gemeente: tekst(form, "gemeente"),
    land: tekst(form, "land") ?? "België",
    btw_nummer: tekst(form, "btw_nummer"),
    betaaltermijn_dagen: betaaltermijn,
    opmerkingen: tekst(form, "opmerkingen"),
  };

  const supabase = await supabaseServer();

  if (id) {
    const { error } = await supabase
      .from("relaties")
      .update({ ...velden, actief: vinkje(form, "actief") })
      .eq("id", id);
    if (error) return { fout: error.message };
  } else {
    // Nieuw: altijd in het actieve bedrijf. In het geconsolideerde zicht
    // kan dat niet, en dat zegt vereistBedrijf() dan ook.
    let ctx;
    try {
      ctx = await vereistBedrijf();
    } catch (e) {
      return { fout: e instanceof Error ? e.message : "Kies eerst een bedrijf." };
    }
    const { error } = await supabase.from("relaties").insert({
      ...velden,
      bedrijf_id: ctx.bedrijf.id,
      aangemaakt_door: ctx.gebruikerId,
    });
    if (error) return { fout: error.message };
  }

  revalidatePath("/klanten");
  revalidatePath("/leveranciers");
  revalidatePath("/");
  redirect(padVoor(pagina));
}

/**
 * Verwijderen. Zit de relatie al aan een bestelling of document vast,
 * dan weigert de databank dat (en terecht: dan klopt de boekhouding
 * niet meer). In dat geval zetten we ze op inactief.
 */
export async function relatieVerwijderen(pagina: Pagina, id: string): Promise<RelatieStatus> {
  await huidigeContext();
  const supabase = await supabaseServer();

  const { error } = await supabase.from("relaties").delete().eq("id", id);

  if (error) {
    const { error: fout2 } = await supabase
      .from("relaties")
      .update({ actief: false })
      .eq("id", id);
    if (fout2) return { fout: fout2.message };
  }

  revalidatePath("/klanten");
  revalidatePath("/leveranciers");
  revalidatePath("/");
  redirect(padVoor(pagina));
}
