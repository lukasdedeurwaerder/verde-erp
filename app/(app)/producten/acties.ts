"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { huidigeContext, vereistBedrijf } from "@/lib/sessie";
import { tekst, verplicht, vinkje } from "@/lib/formulier";
import { leesGetal } from "@/lib/geld";
import { BTW_TARIEVEN } from "@/lib/types";

export type ProductStatus = { fout?: string };

function ververs() {
  revalidatePath("/producten");
  revalidatePath("/");
}

export async function productOpslaan(
  id: string | null,
  _vorige: ProductStatus,
  form: FormData,
): Promise<ProductStatus> {
  const naam = verplicht(form, "naam");
  if (!naam) return { fout: "Vul een naam in." };

  const aankoopprijs = leesGetal(form.get("aankoopprijs")) ?? 0;
  const verkoopprijs = leesGetal(form.get("verkoopprijs")) ?? 0;
  const minVoorraad = leesGetal(form.get("min_voorraad")) ?? 0;
  const btw = leesGetal(form.get("btw_tarief")) ?? 21;

  if (aankoopprijs < 0 || verkoopprijs < 0) return { fout: "Een prijs kan niet negatief zijn." };
  if (!(BTW_TARIEVEN as readonly number[]).includes(btw)) return { fout: "Kies een geldig btw-tarief." };

  const supabase = await supabaseServer();

  // Het bedrijf: van het bestaande product, of het actieve bedrijf.
  let bedrijfId: string;
  let gebruikerId: string;
  if (id) {
    const ctx = await huidigeContext();
    gebruikerId = ctx.gebruikerId;
    const { data } = await supabase.from("producten").select("bedrijf_id").eq("id", id).maybeSingle();
    if (!data) return { fout: "Product niet gevonden." };
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

  // Categorie: bestaande kiezen, of een nieuwe aanmaken als er een naam
  // in het extra veld staat.
  let categorieId = tekst(form, "categorie_id");
  const nieuweCategorie = tekst(form, "nieuwe_categorie");
  if (nieuweCategorie) {
    const { data: bestaande } = await supabase
      .from("productcategorieen")
      .select("id")
      .eq("bedrijf_id", bedrijfId)
      .ilike("naam", nieuweCategorie)
      .maybeSingle();
    if (bestaande) {
      categorieId = bestaande.id;
    } else {
      const { data: nieuw, error } = await supabase
        .from("productcategorieen")
        .insert({ bedrijf_id: bedrijfId, naam: nieuweCategorie })
        .select("id")
        .single();
      if (error) return { fout: `Categorie aanmaken mislukt: ${error.message}` };
      categorieId = nieuw.id;
    }
  }

  const velden = {
    naam,
    code: tekst(form, "code"),
    omschrijving: tekst(form, "omschrijving"),
    categorie_id: categorieId || null,
    eenheid: tekst(form, "eenheid") ?? "stuk",
    aankoopprijs,
    verkoopprijs,
    btw_tarief: btw,
    voorraad_bijhouden: vinkje(form, "voorraad_bijhouden"),
    min_voorraad: minVoorraad,
  };

  let productId = id;
  if (id) {
    const { error } = await supabase
      .from("producten")
      .update({ ...velden, actief: vinkje(form, "actief") })
      .eq("id", id);
    if (error) return { fout: vertaal(error.message) };
  } else {
    const { data, error } = await supabase
      .from("producten")
      .insert({ ...velden, bedrijf_id: bedrijfId, aangemaakt_door: gebruikerId })
      .select("id")
      .single();
    if (error) return { fout: vertaal(error.message) };
    productId = data.id;
  }

  // Foto: een nieuw bestand uploaden, of de bestaande wissen.
  const pad = `${bedrijfId}/${productId}.jpg`;
  const foto = form.get("foto");
  if (foto instanceof File && foto.size > 0) {
    const { error } = await supabase.storage
      .from("productfotos")
      .upload(pad, await foto.arrayBuffer(), { contentType: "image/jpeg", upsert: true });
    if (error) return { fout: `Product bewaard, maar de foto uploaden mislukte: ${error.message}` };

    const { data } = supabase.storage.from("productfotos").getPublicUrl(pad);
    // Het tijdstip erachter dwingt de browser een nieuwe versie te laden
    // als je later een andere foto kiest (zelfde pad, andere inhoud).
    await supabase
      .from("producten")
      .update({ foto_url: `${data.publicUrl}?v=${Date.now()}` })
      .eq("id", productId);
  } else if (vinkje(form, "foto_wissen")) {
    await supabase.from("producten").update({ foto_url: null }).eq("id", productId);
    await supabase.storage.from("productfotos").remove([pad]);
  }

  ververs();
  redirect("/producten");
}

/**
 * Verwijderen. Zit het product al in een bestelling, document of
 * voorraadmutatie, dan weigert de databank dat en zetten we het inactief.
 */
export async function productVerwijderen(id: string): Promise<ProductStatus> {
  await huidigeContext();
  const supabase = await supabaseServer();

  const { data } = await supabase.from("producten").select("bedrijf_id").eq("id", id).maybeSingle();
  const { error } = await supabase.from("producten").delete().eq("id", id);

  if (error) {
    const { error: fout2 } = await supabase.from("producten").update({ actief: false }).eq("id", id);
    if (fout2) return { fout: fout2.message };
  } else if (data) {
    await supabase.storage.from("productfotos").remove([`${data.bedrijf_id}/${id}.jpg`]);
  }

  ververs();
  redirect("/producten");
}

function vertaal(melding: string): string {
  if (melding.includes("producten_code_uniek")) {
    return "Er bestaat al een product met deze code in dit bedrijf.";
  }
  return melding;
}
