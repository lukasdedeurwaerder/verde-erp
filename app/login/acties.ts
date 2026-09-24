"use server";

import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

export type LoginStatus = { fout?: string };

export async function inloggen(
  _vorige: LoginStatus,
  formData: FormData,
): Promise<LoginStatus> {
  const email = String(formData.get("email") ?? "").trim();
  const wachtwoord = String(formData.get("wachtwoord") ?? "");

  if (!email || !wachtwoord) {
    return { fout: "Vul een e-mailadres en wachtwoord in." };
  }

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: wachtwoord,
  });

  if (error) {
    const fout =
      error.message === "Invalid login credentials"
        ? "E-mailadres of wachtwoord klopt niet."
        : error.message;
    return { fout };
  }

  // redirect() gooit intern een signaal; hij mag dus niet in een
  // try/catch staan en moet als laatste komen.
  redirect("/");
}
