// Eén plek waar we controleren of de sleutels ingesteld zijn.
// Zonder dit krijg je bij een vergeten variabele een cryptische fout
// ergens diep in Supabase; nu lees je meteen wat er mist.

function vereist(naam: string, waarde: string | undefined): string {
  if (!waarde) {
    throw new Error(
      `Omgevingsvariabele ${naam} ontbreekt. ` +
        `Zet hem in .env.local (lokaal) of bij Vercel onder Settings -> Environment Variables.`,
    );
  }
  return waarde;
}

export const SUPABASE_URL = vereist(
  "NEXT_PUBLIC_SUPABASE_URL",
  process.env.NEXT_PUBLIC_SUPABASE_URL,
);

export const SUPABASE_ANON_KEY = vereist(
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);
