"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { vereistDocent } from "@/lib/sessie";
import { tekst, verplicht, vinkje } from "@/lib/formulier";

export type RekStatus = { fout?: string; goed?: string };

const SOORTEN = ["actief", "passief", "kost", "opbrengst"];

function ververs() {
  revalidatePath("/rekeningen");
  revalidatePath("/rapporten");
  revalidatePath("/dagboeken");
  revalidatePath("/bank");
  revalidatePath("/aankopen", "layout");
}

/** Welke soort een rekening normaal heeft, afgeleid van de klasse. */
function verwachteSoort(nummer: string): string | null {
  const k = nummer[0];
  if (k === "6") return "kost";
  if (k === "7") return "opbrengst";
  if (k === "1") return "passief";
  if (k === "2" || k === "3" || k === "5") return "actief";
  return null; // klasse 4 kan allebei zijn
}

export async function rekeningToevoegen(_v: RekStatus, form: FormData): Promise<RekStatus> {
  await vereistDocent();
  const supabase = await supabaseServer();
  const nummer = verplicht(form, "nummer").replace(/\s/g, "");
  const naam = verplicht(form, "naam");
  const soort = tekst(form, "soort") ?? verwachteSoort(nummer);
  if (!/^[1-7]\d{2,5}$/.test(nummer)) return { fout: "Een rekeningnummer begint met 1 tot 7 en telt 3 tot 6 cijfers." };
  if (!naam) return { fout: "Geef de rekening een naam." };
  if (!soort || !SOORTEN.includes(soort)) return { fout: "Kies of het een actief, passief, kost of opbrengst is." };

  const { error } = await supabase.from("rekeningen").insert({ nummer, naam, soort });
  if (error) return { fout: error.message.includes("duplicate") ? `Rekening ${nummer} bestaat al.` : error.message };
  ververs();
  return { goed: `Rekening ${nummer} ${naam} toegevoegd.` };
}

export async function rekeningBijwerken(id: string, _v: RekStatus, form: FormData): Promise<RekStatus> {
  await vereistDocent();
  const supabase = await supabaseServer();
  const naam = verplicht(form, "naam");
  const soort = tekst(form, "soort");
  if (!naam) return { fout: "Een rekening heeft een naam." };
  if (!soort || !SOORTEN.includes(soort)) return { fout: "Ongeldige soort." };
  const { error } = await supabase.from("rekeningen").update({ naam, soort, actief: vinkje(form, "actief") }).eq("id", id);
  if (error) return { fout: error.message };
  ververs();
  return { goed: "Bewaard." };
}

/** Verwijderen kan alleen als er nooit op geboekt werd; anders uitschakelen. */
export async function rekeningVerwijderen(id: string, _v: RekStatus, _f: FormData): Promise<RekStatus> {
  await vereistDocent();
  const supabase = await supabaseServer();
  const { error } = await supabase.from("rekeningen").delete().eq("id", id);
  if (error) return { fout: "Op deze rekening is al geboekt. Schakel ze uit in plaats van ze te verwijderen." };
  ververs();
  return { goed: "Verwijderd." };
}

/** De rekeningen die de automatische boekingen gebruiken. */
export async function standaardrekeningenOpslaan(_v: RekStatus, form: FormData): Promise<RekStatus> {
  await vereistDocent();
  const supabase = await supabaseServer();
  const velden = ["rek_klanten", "rek_leveranciers", "rek_btw_te_betalen", "rek_btw_terug", "rek_bank", "rek_omzet", "rek_aankopen"] as const;
  const waarden: Record<string, string> = {};
  for (const v of velden) {
    const w = tekst(form, v);
    if (!w) return { fout: "Kies voor elke standaardrekening een rekening." };
    waarden[v] = w;
  }
  const { data: bestaand } = await supabase.from("rekeningen").select("nummer").in("nummer", Object.values(waarden));
  if ((bestaand ?? []).length !== new Set(Object.values(waarden)).size) return { fout: "Een van de gekozen rekeningen bestaat niet." };
  const { error } = await supabase.from("instellingen").update(waarden).eq("id", 1);
  if (error) return { fout: error.message };
  ververs();
  return { goed: "Standaardrekeningen bewaard. Ze gelden voor alles wat vanaf nu geboekt wordt." };
}
