"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { vereistDocent } from "@/lib/sessie";
import { tekst, verplicht, vinkje } from "@/lib/formulier";
import { leesGetal } from "@/lib/geld";

export type Status = { fout?: string; goed?: string };

function ververs() {
  revalidatePath("/", "layout");
}

// ---------- Dossier ----------

export async function instellingenOpslaan(_v: Status, form: FormData): Promise<Status> {
  await vereistDocent();
  const supabase = await supabaseServer();

  const termijn = leesGetal(form.get("betaaltermijn_dagen"));
  const { error } = await supabase
    .from("instellingen")
    .update({
      moeder_naam: verplicht(form, "moeder_naam") || "Verde",
      iban: tekst(form, "iban"),
      bic: tekst(form, "bic"),
      betaaltermijn_dagen: termijn !== null && termijn >= 0 ? Math.round(termijn) : 30,
      factuur_voettekst: tekst(form, "factuur_voettekst"),
    })
    .eq("id", 1);

  if (error) return { fout: error.message };
  ververs();
  return { goed: "Instellingen bewaard." };
}

// ---------- Bedrijven ----------

export async function bedrijfOpslaan(id: string, _v: Status, form: FormData): Promise<Status> {
  await vereistDocent();
  const supabase = await supabaseServer();

  const naam = verplicht(form, "naam");
  if (!naam) return { fout: "Vul een naam in." };
  const kleur = tekst(form, "kleur") ?? "#2563eb";
  if (!/^#[0-9a-fA-F]{6}$/.test(kleur)) return { fout: "Ongeldige kleur." };

  const { error } = await supabase
    .from("bedrijven")
    .update({
      naam,
      kleur,
      straat: tekst(form, "straat"),
      postcode: tekst(form, "postcode"),
      gemeente: tekst(form, "gemeente"),
      btw_nummer: tekst(form, "btw_nummer"),
      email: tekst(form, "email"),
      telefoon: tekst(form, "telefoon"),
    })
    .eq("id", id);

  if (error) return { fout: error.message };
  ververs();
  return { goed: "Bedrijf bewaard." };
}

// ---------- Gebruikers ----------

/**
 * Een account aanmaken met een startwachtwoord. Gaat via de
 * service-role-sleutel: met de gewone sleutel kan dat niet, en we willen
 * geen uitnodigingsmails (het gratis Supabase-plan verstuurt er maar
 * een paar per uur).
 */
export async function gebruikerAanmaken(_v: Status, form: FormData): Promise<Status> {
  const ctx = await vereistDocent();

  const naam = verplicht(form, "naam");
  const email = verplicht(form, "email").toLowerCase();
  const wachtwoord = String(form.get("wachtwoord") ?? "");
  const rol = tekst(form, "rol") === "docent" ? "docent" : "student";
  const bedrijfId = tekst(form, "bedrijf_id");

  if (!naam || !email) return { fout: "Vul een naam en e-mailadres in." };
  if (wachtwoord.length < 8) return { fout: "Het startwachtwoord moet minstens 8 tekens lang zijn." };
  if (rol === "student" && !bedrijfId) return { fout: "Kies voor een student een bedrijf." };
  if (bedrijfId && !ctx.bedrijven.some((b) => b.id === bedrijfId)) return { fout: "Onbekend bedrijf." };

  const admin = supabaseAdmin();
  const { error } = await admin.auth.admin.createUser({
    email,
    password: wachtwoord,
    email_confirm: true,
    user_metadata: { naam, rol, bedrijf_id: rol === "student" ? bedrijfId : null },
  });

  if (error) {
    const fout = error.message.includes("already been registered")
      ? "Er bestaat al een account met dit e-mailadres."
      : error.message;
    return { fout };
  }

  ververs();
  return { goed: `Account voor ${naam} aangemaakt.` };
}

export async function gebruikerBijwerken(id: string, _v: Status, form: FormData): Promise<Status> {
  const ctx = await vereistDocent();
  const supabase = await supabaseServer();

  const naam = verplicht(form, "naam");
  const rol = tekst(form, "rol") === "docent" ? "docent" : "student";
  const bedrijfId = tekst(form, "bedrijf_id");
  const actief = vinkje(form, "actief");

  if (!naam) return { fout: "Vul een naam in." };
  if (rol === "student" && !bedrijfId) return { fout: "Kies voor een student een bedrijf." };
  if (id === ctx.gebruikerId && (rol !== "docent" || !actief)) {
    return { fout: "Je kunt je eigen docentenaccount niet omzetten of uitschakelen." };
  }

  const { error } = await supabase
    .from("profielen")
    .update({ naam, rol, bedrijf_id: rol === "student" ? bedrijfId : null, actief })
    .eq("id", id);

  if (error) return { fout: error.message };
  ververs();
  return { goed: "Bewaard." };
}

export async function wachtwoordInstellen(id: string, _v: Status, form: FormData): Promise<Status> {
  await vereistDocent();
  const wachtwoord = String(form.get("wachtwoord") ?? "");
  if (wachtwoord.length < 8) return { fout: "Minstens 8 tekens." };

  const admin = supabaseAdmin();
  const { error } = await admin.auth.admin.updateUserById(id, { password: wachtwoord });
  if (error) return { fout: error.message };
  return { goed: "Nieuw wachtwoord ingesteld." };
}

export async function gebruikerVerwijderen(id: string, _v: Status, _form: FormData): Promise<Status> {
  const ctx = await vereistDocent();
  if (id === ctx.gebruikerId) return { fout: "Je kunt jezelf niet verwijderen." };

  // Het profiel verdwijnt mee (on delete cascade). Heeft de student al
  // bestellingen aangemaakt, dan blokkeert de databank dit: zet het
  // account dan gewoon op inactief.
  const admin = supabaseAdmin();
  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) {
    return { fout: "Verwijderen lukt niet (er hangen al gegevens aan dit account). Zet het op inactief." };
  }
  ververs();
  return { goed: "Account verwijderd." };
}
