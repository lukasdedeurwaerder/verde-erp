// Migraties uitvoeren op de Supabase-databank.
//
//   npm.cmd run migreer
//
// Leest DATABASE_URL uit .env.local, houdt in de tabel _migraties bij
// welke bestanden al gedraaid zijn, en voert de nieuwe uit in
// alfabetische volgorde. Elk bestand draait in één transactie: gaat er
// iets mis, dan wordt alles van dat bestand teruggedraaid.

const fs = require("node:fs");
const path = require("node:path");
const postgres = require("postgres");

function leesEnv() {
  const pad = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(pad)) {
    console.error("Geen .env.local gevonden. Kopieer .env.local.voorbeeld en vul de waarden in.");
    process.exit(1);
  }
  for (const regel of fs.readFileSync(pad, "utf8").split(/\r?\n/)) {
    const m = regel.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
  }
}

async function main() {
  leesEnv();
  const url = process.env.DATABASE_URL;
  if (!url || url.includes("WACHTWOORD")) {
    console.error("DATABASE_URL ontbreekt of bevat nog de plaatshouder WACHTWOORD.");
    process.exit(1);
  }

  // onnotice: Postgres-meldingen als "extension already exists" niet tonen.
  const sql = postgres(url, { ssl: "require", max: 1, onnotice: () => {} });

  try {
    await sql`create table if not exists _migraties (naam text primary key, uitgevoerd_op timestamptz not null default now())`;
    const gedaan = new Set((await sql`select naam from _migraties`).map((r) => r.naam));

    const map = path.join(__dirname, "..", "supabase", "migrations");
    const bestanden = fs.readdirSync(map).filter((b) => b.endsWith(".sql")).sort();

    let aantal = 0;
    for (const bestand of bestanden) {
      if (gedaan.has(bestand)) continue;
      const inhoud = fs.readFileSync(path.join(map, bestand), "utf8");
      process.stdout.write(`Uitvoeren: ${bestand} … `);
      await sql.begin(async (tx) => {
        await tx.unsafe(inhoud);
        await tx`insert into _migraties (naam) values (${bestand})`;
      });
      console.log("klaar");
      aantal++;
    }

    console.log(aantal === 0 ? "Alles was al up-to-date." : `${aantal} migratie(s) uitgevoerd.`);
  } finally {
    await sql.end();
  }
}

main().catch((fout) => {
  console.error("\nMislukt:", fout.message);
  process.exit(1);
});
