import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import type { Bedrijf, Instellingen, Profiel } from "@/lib/types";

// Wie is ingelogd, en in welk bedrijf werkt die?
//
// Voor een STUDENT ligt dat vast: het bedrijf uit het profiel. Voor de
// DOCENT is het een keuze in de bovenbalk, bewaard in een cookie. De
// docent kan ook "Verde (alles)" kiezen: dan is `bedrijf` null en tonen
// de lijsten beide dochters naast elkaar, zonder knoppen om iets nieuws
// te maken. Aanmaken doe je altijd in één bepaald bedrijf.

export const COOKIE_BEDRIJF = "verde-bedrijf";
export const ALLES = "alles";

export type Context = {
  gebruikerId: string;
  email: string;
  profiel: Profiel;
  isDocent: boolean;
  bedrijven: Bedrijf[];
  /** Het actieve bedrijf, of null voor het geconsolideerde zicht (docent). */
  bedrijf: Bedrijf | null;
  instellingen: Instellingen;
};

export const huidigeContext = cache(async (): Promise<Context> => {
  const supabase = await supabaseServer();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profiel }, { data: bedrijven }, { data: instellingen }] =
    await Promise.all([
      supabase.from("profielen").select("*").eq("id", user.id).maybeSingle(),
      supabase.from("bedrijven").select("*").order("volgorde"),
      supabase.from("instellingen").select("*").eq("id", 1).single(),
    ]);

  if (!profiel || !profiel.actief) {
    // Het account bestaat bij Supabase, maar er hoort geen (actief)
    // profiel bij. Uitloggen en terug naar het inlogscherm met uitleg.
    await supabase.auth.signOut();
    redirect("/login?reden=geen-profiel");
  }

  // Alleen actieve bedrijven in de keuze. Een inactief bedrijf (bv. een
  // tijdelijk testbedrijf) verschijnt niet, behalve voor wie erin werkt.
  const lijst = ((bedrijven ?? []) as Bedrijf[]).filter(
    (b) => b.actief || b.id === profiel.bedrijf_id,
  );
  const isDocent = profiel.rol === "docent";

  let bedrijf: Bedrijf | null;
  if (isDocent) {
    const keuze = (await cookies()).get(COOKIE_BEDRIJF)?.value;
    if (keuze === ALLES) {
      bedrijf = null;
    } else {
      bedrijf = lijst.find((b) => b.id === keuze) ?? lijst[0] ?? null;
    }
  } else {
    bedrijf = lijst.find((b) => b.id === profiel.bedrijf_id) ?? null;
  }

  return {
    gebruikerId: user.id,
    email: user.email ?? "",
    profiel: profiel as Profiel,
    isDocent,
    bedrijven: lijst,
    bedrijf,
    instellingen: instellingen as Instellingen,
  };
});

/**
 * Voor schermen en acties die iets aanmaken of wijzigen: er moet één
 * bedrijf actief zijn. In het geconsolideerde zicht mag dat niet.
 */
export async function vereistBedrijf(): Promise<Context & { bedrijf: Bedrijf }> {
  const ctx = await huidigeContext();
  if (!ctx.bedrijf) {
    throw new Error("Kies eerst een bedrijf in de bovenbalk.");
  }
  return ctx as Context & { bedrijf: Bedrijf };
}

/** Alleen de docent mag hier komen. */
export async function vereistDocent(): Promise<Context> {
  const ctx = await huidigeContext();
  if (!ctx.isDocent) redirect("/");
  return ctx;
}
