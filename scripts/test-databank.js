// Test van de databank tegen het ECHTE Supabase-project:
//
//   npm.cmd run test:databank
//
// Maakt twee tijdelijke studentenaccounts (één per dochter), controleert
// dat ze elkaars gegevens niet zien, dat de triggers (nummering,
// voorraad, documenttotalen, evenwicht van boekingen) werken en dat de
// opslag per bedrijf afgeschermd is. Ruimt daarna alles weer op.
// Draai dit niet terwijl studenten aan het werk zijn: de opruimstap
// verwijdert alle gegevens van Dochter A.
const fs = require("node:fs");
const path = require("node:path");
const map = path.join(__dirname, "..");
const { createClient } = require("@supabase/supabase-js");
for (const r of fs.readFileSync(path.join(map, ".env.local"), "utf8").split(/\r?\n/)) { const m = r.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m) process.env[m[1]] = m[2]; }
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
let fouten = 0;
const check = (naam, ok, extra = "") => { console.log((ok ? "OK  " : "FOUT") + " " + naam + (extra ? "  (" + extra + ")" : "")); if (!ok) fouten++; };

(async () => {
  const { data: bedrijven } = await admin.from("bedrijven").select("id,naam").order("volgorde");
  const [A, B] = bedrijven;
  const ww = "Test-wachtwoord-1234";
  const mk = async (naam, email, bedrijf) => {
    const { data, error } = await admin.auth.admin.createUser({ email, password: ww, email_confirm: true, user_metadata: { naam, rol: "student", bedrijf_id: bedrijf } });
    if (error) throw error; return data.user.id;
  };
  const idA = await mk("Test A", "test-a@verde-test.invalid", A.id);
  const idB = await mk("Test B", "test-b@verde-test.invalid", B.id);
  try {
    const { data: pA } = await admin.from("profielen").select("*").eq("id", idA).single();
    check("profiel automatisch aangemaakt met bedrijf en e-mail", pA.bedrijf_id === A.id && pA.email === "test-a@verde-test.invalid" && pA.rol === "student");

    const cA = createClient(URL, ANON, { auth: { persistSession: false } });
    const cB = createClient(URL, ANON, { auth: { persistSession: false } });
    check("student A logt in", !(await cA.auth.signInWithPassword({ email: "test-a@verde-test.invalid", password: ww })).error);
    check("student B logt in", !(await cB.auth.signInWithPassword({ email: "test-b@verde-test.invalid", password: ww })).error);

    const { data: rA, error: eA } = await cA.from("relaties").insert({ bedrijf_id: A.id, soort: "klant", naam: "Testklant A" }).select().single();
    check("A maakt klant in eigen bedrijf", !eA, eA && eA.message);
    const { error: eAB } = await cA.from("relaties").insert({ bedrijf_id: B.id, soort: "klant", naam: "Sluipklant" });
    check("A kan GEEN klant in bedrijf B maken", !!eAB);
    const { data: zichtB } = await cB.from("relaties").select("id").eq("id", rA.id);
    check("B ziet de klant van A niet", zichtB.length === 0);
    const { data: zichtA } = await cA.from("relaties").select("id").eq("id", rA.id);
    check("A ziet de eigen klant wel", zichtA.length === 1);

    await cA.from("profielen").update({ rol: "docent", naam: "Test A2" }).eq("id", idA);
    const { data: pA2 } = await admin.from("profielen").select("rol,naam").eq("id", idA).single();
    check("student kan eigen naam wijzigen maar niet de rol", pA2.rol === "student" && pA2.naam === "Test A2", JSON.stringify(pA2));
    await cA.from("bedrijven").update({ naam: "Gekaapt" }).eq("id", A.id);
    const { data: bNa } = await admin.from("bedrijven").select("naam").eq("id", A.id).single();
    check("student kan bedrijfsnaam niet wijzigen", bNa.naam === A.naam);

    const { data: prod, error: eP } = await cA.from("producten").insert({ bedrijf_id: A.id, naam: "Testproduct", code: "T-1", verkoopprijs: 10, btw_tarief: 21 }).select().single();
    check("A maakt product", !eP, eP && eP.message);
    await cA.from("voorraadmutaties").insert([{ bedrijf_id: A.id, product_id: prod.id, aantal: 20, soort: "beginvoorraad" }, { bedrijf_id: A.id, product_id: prod.id, aantal: -3, soort: "levering" }]);
    const { data: prod2 } = await cA.from("producten").select("voorraad").eq("id", prod.id).single();
    check("voorraad = som van mutaties (17)", Number(prod2.voorraad) === 17, String(prod2.voorraad));

    const { data: best, error: eBest } = await cA.from("bestellingen").insert({ bedrijf_id: A.id, soort: "verkoop", relatie_id: rA.id }).select().single();
    check("bestelling krijgt nummer 1", !eBest && best.nummer === 1, eBest ? eBest.message : String(best && best.nummer));
    const { data: best2 } = await cA.from("bestellingen").insert({ bedrijf_id: A.id, soort: "verkoop", relatie_id: rA.id }).select().single();
    check("tweede bestelling krijgt nummer 2", best2.nummer === 2);
    const { data: doc, error: eDoc } = await cA.from("documenten").insert({ bedrijf_id: A.id, soort: "factuur", relatie_id: rA.id, bestelling_id: best.id }).select().single();
    check("factuur krijgt nummer F-jaar-0001", !eDoc && /^F-\d{4}-0001$/.test(doc.nummer), eDoc ? eDoc.message : String(doc && doc.nummer));
    await cA.from("documentlijnen").insert([{ document_id: doc.id, product_id: prod.id, omschrijving: "Testproduct", aantal: 2, eenheidsprijs: 10, btw_tarief: 21 }, { document_id: doc.id, omschrijving: "Korting", aantal: 1, eenheidsprijs: 5, btw_tarief: 21, korting_pct: 100 }]);
    const { data: doc2 } = await cA.from("documenten").select("totaal_excl,totaal_btw,totaal_incl").eq("id", doc.id).single();
    check("documenttotalen 20 / 4,20 / 24,20", Number(doc2.totaal_excl) === 20 && Number(doc2.totaal_btw) === 4.2 && Number(doc2.totaal_incl) === 24.2, JSON.stringify(doc2));

    const { data: rek } = await admin.from("rekeningen").select("id,nummer").in("nummer", ["400", "700", "451"]);
    const r = Object.fromEntries(rek.map((x) => [x.nummer, x.id]));
    const { data: boek } = await cA.from("boekingen").insert({ bedrijf_id: A.id, dagboek: "verkoop", omschrijving: "Test", document_id: doc.id }).select().single();
    const { error: eL1 } = await cA.from("boekingslijnen").insert([{ boeking_id: boek.id, rekening_id: r["400"], debet: 24.2 }, { boeking_id: boek.id, rekening_id: r["700"], credit: 20 }, { boeking_id: boek.id, rekening_id: r["451"], credit: 4.2 }]);
    check("boeking in evenwicht wordt aanvaard", !eL1, eL1 && eL1.message);
    const { error: eL2 } = await cA.from("boekingslijnen").insert([{ boeking_id: boek.id, rekening_id: r["400"], debet: 1 }]);
    check("boeking uit evenwicht wordt geweigerd", !!eL2 && eL2.message.includes("evenwicht"), eL2 && eL2.message);
    const { data: saldi } = await cA.from("rekeningsaldi").select("nummer,saldo").eq("bedrijf_id", A.id);
    const s400 = saldi.find((s) => s.nummer === "400"), s700 = saldi.find((s) => s.nummer === "700");
    check("rekeningsaldi: 400 = 24,20 en 700 = 20", s400 && Number(s400.saldo) === 24.2 && s700 && Number(s700.saldo) === 20, JSON.stringify(saldi));
    const { data: saldiB } = await cB.from("rekeningsaldi").select("nummer").eq("bedrijf_id", A.id);
    check("B ziet saldi van A niet", saldiB.length === 0);

    const { error: eUp } = await cA.storage.from("productfotos").upload(A.id + "/" + prod.id + ".jpg", Buffer.from([0xff, 0xd8, 0xff, 0xd9]), { contentType: "image/jpeg", upsert: true });
    check("A uploadt productfoto in eigen map", !eUp, eUp && eUp.message);
    const { error: eUp2 } = await cA.storage.from("productfotos").upload(B.id + "/sluip.jpg", Buffer.from([0xff, 0xd8, 0xff, 0xd9]), { contentType: "image/jpeg" });
    check("A kan NIET in map van B uploaden", !!eUp2);
    await cA.storage.from("productfotos").remove([A.id + "/" + prod.id + ".jpg"]);
  } finally {
    await admin.from("boekingen").delete().eq("bedrijf_id", A.id);
    await admin.from("documenten").delete().eq("bedrijf_id", A.id);
    await admin.from("bestellingen").delete().eq("bedrijf_id", A.id);
    await admin.from("voorraadmutaties").delete().eq("bedrijf_id", A.id);
    await admin.from("producten").delete().eq("bedrijf_id", A.id);
    await admin.from("relaties").delete().eq("bedrijf_id", A.id);
    await admin.from("nummerreeksen").delete().eq("bedrijf_id", A.id);
    await admin.auth.admin.deleteUser(idA);
    await admin.auth.admin.deleteUser(idB);
    console.log(fouten === 0 ? "\nAlles in orde." : "\n" + fouten + " fout(en).");
  }
})().catch((e) => { console.error("Script mislukt:", e.message); process.exit(1); });
