import "server-only";

import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "@/lib/env";

// Verbinding met de SERVICE ROLE-sleutel. Deze omzeilt Row Level
// Security volledig en mag daarom nooit in de browser terechtkomen.
//
// De import van "server-only" bovenaan is de vangrail: probeert iemand
// dit bestand ooit vanuit een client component te gebruiken, dan faalt
// de build in plaats van de sleutel stilletjes mee te sturen.
//
// Alleen het gebruikersbeheer van de docent gebruikt dit: accounts
// aanmaken en wachtwoorden resetten kan niet met de gewone sleutel.
export function supabaseAdmin() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error(
      "Omgevingsvariabele SUPABASE_SERVICE_ROLE_KEY ontbreekt. " +
        "Zet hem in .env.local (lokaal) of bij Vercel onder Settings -> Environment Variables.",
    );
  }

  return createClient(SUPABASE_URL, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
