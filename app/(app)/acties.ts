"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { ALLES, COOKIE_BEDRIJF, huidigeContext } from "@/lib/sessie";

/** De docent kiest in de bovenbalk in welk bedrijf die werkt. */
export async function kiesBedrijf(bedrijfId: string) {
  const ctx = await huidigeContext();
  if (!ctx.isDocent) return;

  const geldig = bedrijfId === ALLES || ctx.bedrijven.some((b) => b.id === bedrijfId);
  if (!geldig) return;

  (await cookies()).set(COOKIE_BEDRIJF, bedrijfId, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  revalidatePath("/", "layout");
}

export async function uitloggen() {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  redirect("/login");
}
