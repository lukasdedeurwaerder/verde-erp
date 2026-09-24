// Een account aanmaken vanaf de commandoregel. Bedoeld voor het
// allereerste docentenaccount; daarna maak je studenten aan in de app
// zelf (Instellingen -> Gebruikers).
//
//   npm.cmd run docent -- "Lukas Dedeurwaerder" lukas@voorbeeld.be StartWachtwoord123
//
// Gebruikt de service-role-sleutel uit .env.local. Het profiel wordt
// automatisch aangemaakt door de trigger in de databank.

const fs = require("node:fs");
const path = require("node:path");
const { createClient } = require("@supabase/supabase-js");

function leesEnv() {
  const pad = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(pad)) {
    console.error("Geen .env.local gevonden.");
    process.exit(1);
  }
  for (const regel of fs.readFileSync(pad, "utf8").split(/\r?\n/)) {
    const m = regel.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
  }
}

async function main() {
  leesEnv();
  const [naam, email, wachtwoord] = process.argv.slice(2);
  if (!naam || !email || !wachtwoord) {
    console.error('Gebruik: npm.cmd run docent -- "Naam" e-mail wachtwoord');
    process.exit(1);
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: wachtwoord,
    email_confirm: true,
    user_metadata: { naam, rol: "docent" },
  });

  if (error) {
    console.error("Mislukt:", error.message);
    process.exit(1);
  }
  console.log(`Docentenaccount aangemaakt voor ${email} (id ${data.user.id}).`);
}

main();
