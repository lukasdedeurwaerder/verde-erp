"use server";

import { supabaseServer } from "@/lib/supabase/server";
import { huidigeContext } from "@/lib/sessie";

export type WachtwoordStatus = { fout?: string; goed?: string };

/** De ingelogde gebruiker wijzigt het eigen wachtwoord. */
export async function wachtwoordWijzigen(
  _vorige: WachtwoordStatus,
  form: FormData,
): Promise<WachtwoordStatus> {
  await huidigeContext();

  const nieuw = String(form.get("nieuw") ?? "");
  const herhaal = String(form.get("herhaal") ?? "");

  if (nieuw.length < 8) return { fout: "Kies een wachtwoord van minstens 8 tekens." };
  if (nieuw !== herhaal) return { fout: "De twee wachtwoorden zijn niet gelijk." };

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.updateUser({ password: nieuw });

  if (error) {
    const fout = error.message.includes("different from the old")
      ? "Het nieuwe wachtwoord moet verschillen van het oude."
      : error.message;
    return { fout };
  }

  return { goed: "Je wachtwoord is gewijzigd." };
}
