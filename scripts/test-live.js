// Test van de LIVE site (of een lokale productieversie) met een
// tijdelijk studentenaccount:
//
//   npm.cmd run test:live                      -> https://verde-ondernemen.vercel.app
//   npm.cmd run test:live -- http://localhost:3100
//
// Logt in via Supabase, zet de sessie in de cookie zoals @supabase/ssr
// dat doet, en haalt kanban, bestelling, document en pdf op. Ruimt
// daarna alles op. Niet draaien terwijl studenten aan het werk zijn:
// de opruimstap wist de nummerreeksen van Dochter A.
const fs = require("node:fs"), path = require("node:path");
const map = path.join(__dirname, "..");
const { createClient } = require("@supabase/supabase-js");
for (const r of fs.readFileSync(path.join(map, ".env.local"), "utf8").split(/\r?\n/)) { const m = r.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m) process.env[m[1]] = m[2]; }
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SITE = process.argv[2] || "https://verde-ondernemen.vercel.app";
const admin = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
let fouten = 0;
const check = (naam, ok, extra = "") => { console.log((ok ? "OK  " : "FOUT") + " " + naam + (extra ? "  (" + extra + ")" : "")); if (!ok) fouten++; };

(async () => {
  const { data: bedrijven } = await admin.from("bedrijven").select("id").order("volgorde");
  const A = bedrijven[0].id;
  const ww = "Test-wachtwoord-1234";
  const { data: u, error: eU } = await admin.auth.admin.createUser({ email: "test-live@verde-test.invalid", password: ww, email_confirm: true, user_metadata: { naam: "Test Live", rol: "student", bedrijf_id: A } });
  if (eU) throw eU;
  const uid = u.user.id;
  try {
    const { data: rel } = await admin.from("relaties").insert({ bedrijf_id: A, soort: "klant", naam: "Livetest klant" }).select().single();
    const { data: best } = await admin.from("bestellingen").insert({ bedrijf_id: A, soort: "verkoop", relatie_id: rel.id, verantwoordelijke_id: uid }).select().single();
    await admin.from("bestellijnen").insert([{ bestelling_id: best.id, omschrijving: "Testlijn", aantal: 2, eenheidsprijs: 10, btw_tarief: 21, korting_pct: 0 }]);
    const { data: doc } = await admin.from("documenten").insert({ bedrijf_id: A, soort: "offerte", bestelling_id: best.id, relatie_id: rel.id }).select().single();
    await admin.from("documentlijnen").insert([{ document_id: doc.id, omschrijving: "Testlijn", aantal: 2, eenheidsprijs: 10, btw_tarief: 21, korting_pct: 0 }]);

    const c = createClient(URL_, ANON, { auth: { persistSession: false } });
    const { data: sess, error: eS } = await c.auth.signInWithPassword({ email: "test-live@verde-test.invalid", password: ww });
    check("testaccount logt in", !eS, eS && eS.message);
    const ref = URL_.match(/https:\/\/([a-z0-9]+)\./)[1];
    const waarde = "base64-" + Buffer.from(JSON.stringify(sess.session)).toString("base64url");
    // @supabase/ssr knipt lange cookies in stukken van 3180 tekens: naam.0, naam.1, ...
    const stukken = waarde.match(/.{1,3180}/g);
    const cookie = stukken.length === 1 ? `sb-${ref}-auth-token=${waarde}` : stukken.map((s, i) => `sb-${ref}-auth-token.${i}=${s}`).join("; ");
    const haal = (pad) => fetch(SITE + pad, { headers: { cookie }, redirect: "manual" });

    let r = await haal("/bestellingen");
    let t = await r.text();
    check("kanban-scherm laadt (200)", r.status === 200, String(r.status));
    check("kanban toont de testbestelling", t.includes("Livetest klant"));
    r = await haal("/documenten/" + doc.id);
    t = await r.text();
    check("documentscherm laadt", r.status === 200 && t.includes("Offerte"), String(r.status));
    r = await haal("/documenten/" + doc.id + "/pdf");
    const bytes = Buffer.from(await r.arrayBuffer());
    check("pdf-route geeft een pdf", r.status === 200 && (r.headers.get("content-type") || "").includes("pdf") && bytes.subarray(0, 4).toString() === "%PDF", r.status + " " + r.headers.get("content-type") + " " + bytes.length + " bytes");
    r = await haal("/bestellingen/" + best.id);
    t = await r.text();
    check("bestelscherm laadt met lijnen-editor", r.status === 200 && t.includes("Lijn toevoegen"), String(r.status));
    r = await fetch(SITE + "/documenten/" + doc.id + "/pdf", { redirect: "manual" });
    check("pdf zonder login wordt geweigerd", r.status === 307 || r.status === 302, String(r.status));
  } finally {
    await admin.from("documenten").delete().eq("bedrijf_id", A).eq("relatie_id", (await admin.from("relaties").select("id").eq("naam", "Livetest klant").single()).data.id);
    await admin.from("bestellingen").delete().eq("bedrijf_id", A).eq("verantwoordelijke_id", uid);
    await admin.from("relaties").delete().eq("naam", "Livetest klant");
    await admin.from("nummerreeksen").delete().eq("bedrijf_id", A);
    await admin.auth.admin.deleteUser(uid);
    console.log(fouten === 0 ? "\nAlles in orde." : "\n" + fouten + " fout(en).");
    process.exit(fouten ? 1 : 0);
  }
})().catch((e) => { console.error("Script mislukt:", e.message); process.exit(1); });
