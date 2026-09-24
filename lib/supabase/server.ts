import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/env";

// Verbinding vanuit de SERVER, namens de ingelogde gebruiker.
// Leest de sessie uit de cookies. Row Level Security geldt hier
// gewoon: een student komt niet bij het andere bedrijf.
export async function supabaseServer() {
  const cookieStore = await cookies();

  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Vanuit een Server Component mag je geen cookies schrijven.
          // Geen probleem: de middleware ververst de sessie al.
        }
      },
    },
  });
}
