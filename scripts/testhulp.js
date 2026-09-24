// Gedeelde hulp voor de testscripts.
//
// Elke test werkt in eigen, TIJDELIJKE testbedrijven. Die staan op
// inactief, dus niemand ziet ze in de app, en na afloop wordt alles wat
// eraan hangt verwijderd: gegevens, bestanden, testaccounts en de
// bedrijven zelf. Echte gegevens van de dochters worden nooit aangeraakt.

const fs = require("node:fs");
const path = require("node:path");
const postgres = require("postgres");
const { createClient } = require("@supabase/supabase-js");

function leesEnv() {
  const pad = path.join(__dirname, "..", ".env.local");
  for (const r of fs.readFileSync(pad, "utf8").split(/\r?\n/)) {
    const m = r.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
leesEnv();

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const WACHTWOORD = "Test-wachtwoord-1234";

const admin = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const sql = postgres(process.env.DATABASE_URL, { ssl: "require", max: 1, onnotice: () => {} });

let fouten = 0;
function check(naam, ok, extra = "") {
  console.log((ok ? "OK  " : "FOUT") + " " + naam + (extra ? "  (" + extra + ")" : ""));
  if (!ok) fouten++;
}

/** Maak `aantal` testbedrijven, elk met één studentenaccount. */
async function maakTestomgeving(aantal) {
  await ruimRestenOp();
  const stempel = Date.now().toString(36);
  const bedrijven = [];
  for (let i = 0; i < aantal; i++) {
    const [b] = await sql`
      insert into bedrijven (naam, kleur, volgorde, actief)
      values (${"TEST " + stempel + "-" + i + " (wordt verwijderd)"}, '#999999', 999, false)
      returning id`;
    const email = `test-${stempel}-${i}@verde-test.invalid`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: WACHTWOORD,
      email_confirm: true,
      user_metadata: { naam: "Teststudent " + i, rol: "student", bedrijf_id: b.id },
    });
    if (error) throw error;
    const client = createClient(URL_, ANON, { auth: { persistSession: false } });
    const { data: sessie, error: fout } = await client.auth.signInWithPassword({ email, password: WACHTWOORD });
    if (fout) throw fout;
    bedrijven.push({ id: b.id, gebruikerId: data.user.id, email, client, sessie: sessie.session });
  }
  return bedrijven;
}

/** Alles van de testbedrijven verwijderen, in de juiste volgorde. */
async function ruimOp(bedrijven) {
  const ids = bedrijven.map((b) => b.id);
  if (ids.length === 0) return;

  for (const bucket of ["productfotos", "documenten"]) {
    for (const id of ids) {
      const { data } = await admin.storage.from(bucket).list(id);
      if (data && data.length) await admin.storage.from(bucket).remove(data.map((f) => `${id}/${f.name}`));
    }
  }

  await sql.begin(async (tx) => {
    await tx`delete from boekingen where bedrijf_id in ${tx(ids)}`;
    await tx`delete from voorraadmutaties where bedrijf_id in ${tx(ids)}`;
    // Creditnota's eerst: ze verwijzen naar hun factuur.
    await tx`delete from documenten where bedrijf_id in ${tx(ids)} and bron_document_id is not null`;
    await tx`delete from documenten where bedrijf_id in ${tx(ids)}`;
    await tx`delete from bestellingen where bedrijf_id in ${tx(ids)}`;
    await tx`delete from producten where bedrijf_id in ${tx(ids)}`;
    await tx`delete from productcategorieen where bedrijf_id in ${tx(ids)}`;
    await tx`delete from relaties where bedrijf_id in ${tx(ids)}`;
    await tx`delete from nummerreeksen where bedrijf_id in ${tx(ids)}`;
    await tx`delete from logboek where bedrijf_id in ${tx(ids)}`;
  });

  for (const b of bedrijven) if (b.gebruikerId) await admin.auth.admin.deleteUser(b.gebruikerId);
  await sql`delete from bedrijven where id in ${sql(ids)}`;
}

/**
 * Vangnet: testbedrijven die een eerder, afgebroken script liet staan.
 * Herkenbaar aan hun naam en aan inactief; nooit een echt bedrijf.
 */
async function ruimRestenOp() {
  const resten = await sql`
    select b.id, p.id as gebruiker_id
    from bedrijven b left join profielen p on p.bedrijf_id = b.id
    where b.naam like 'TEST % (wordt verwijderd)' and not b.actief`;
  if (resten.length === 0) return;
  const perBedrijf = new Map();
  for (const r of resten) {
    if (!perBedrijf.has(r.id)) perBedrijf.set(r.id, { id: r.id, gebruikerIds: [] });
    if (r.gebruiker_id) perBedrijf.get(r.id).gebruikerIds.push(r.gebruiker_id);
  }
  const lijst = [...perBedrijf.values()];
  // ruimOp verwacht één gebruiker per bedrijf; de rest verwijderen we hier.
  for (const b of lijst) for (const g of b.gebruikerIds.slice(1)) await admin.auth.admin.deleteUser(g);
  await ruimOp(lijst.map((b) => ({ id: b.id, gebruikerId: b.gebruikerIds[0] })).map((b) => b.gebruikerId ? b : { ...b, gebruikerId: null }));
  console.log(`(${lijst.length} achtergebleven testbedrijf/-bedrijven opgeruimd)`);
}

/** Cookie zoals @supabase/ssr hem zet, om de echte site aan te spreken. */
function sessieCookie(sessie) {
  const ref = URL_.match(/https:\/\/([a-z0-9]+)\./)[1];
  const waarde = "base64-" + Buffer.from(JSON.stringify(sessie)).toString("base64url");
  const stukken = waarde.match(/.{1,3180}/g);
  return stukken.length === 1
    ? `sb-${ref}-auth-token=${waarde}`
    : stukken.map((s, i) => `sb-${ref}-auth-token.${i}=${s}`).join("; ");
}

async function einde() {
  await sql.end();
  console.log(fouten === 0 ? "\nAlles in orde." : "\n" + fouten + " fout(en).");
  process.exit(fouten ? 1 : 0);
}

module.exports = { admin, sql, check, maakTestomgeving, ruimOp, ruimRestenOp, sessieCookie, einde, WACHTWOORD };
