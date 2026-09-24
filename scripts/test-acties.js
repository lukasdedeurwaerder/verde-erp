// Test van de SERVERACTIES: precies wat de knoppen in de app doen.
//
//   npm.cmd run test:acties -- http://localhost:3100   (lokale server)
//   npm.cmd run test:live                              (de echte site)
//
// Roept de acties aan zoals de browser dat doet (met de kop Next-Action
// en de sessiecookie van een tijdelijk studentenaccount) en controleert
// daarna in de databank wat er gebeurd is. Werkt in een tijdelijk
// testbedrijf dat na afloop volledig verdwijnt.

const { sql, check, maakTestomgeving, ruimOp, sessieCookie, einde } = require("./testhulp");

const SITE = process.argv[2] || "http://localhost:3100";

/**
 * De code van elke actie verschilt per build. We halen ze daarom van de
 * site zelf: de JavaScript van een pagina bevat voor elke actie die de
 * pagina gebruikt een regel createServerReference("<code>", ..., "<naam>").
 */
const ACTIE = {};
const gelezen = new Set();
async function leesActies(pagina, cookie) {
  const html = await (await fetch(SITE + pagina, { headers: { cookie } })).text();
  const bronnen = [...html.matchAll(/src="(\/_next\/static\/chunks\/[^"]+\.js)"/g)].map((m) => m[1]);
  for (const bron of bronnen) {
    if (gelezen.has(bron)) continue;
    gelezen.add(bron);
    const js = await (await fetch(SITE + bron)).text();
    for (const m of js.matchAll(/createServerReference\)\("([0-9a-f]+)",[^)]*?"(\w+)"\)/g)) ACTIE[m[2]] = m[1];
  }
}

/**
 * Een serveractie aanroepen. Gewone argumenten gaan als JSON; een
 * formulier gaat zoals React het verstuurt: veld "0" met de argumenten,
 * waarin "$K1" naar de formuliervelden met voorvoegsel "_1_" verwijst.
 */
async function actie(cookie, pagina, naam, args, formulier) {
  if (!ACTIE[naam]) await leesActies(pagina, cookie);
  if (!ACTIE[naam]) throw new Error(`Actie ${naam} niet gevonden op ${pagina}`);
  const kop = { "Next-Action": ACTIE[naam], cookie, Origin: SITE, Accept: "text/x-component" };
  let body;
  if (formulier) {
    // Veld "0" moet als LAATSTE: de server leest het formulier terwijl het
    // binnenkomt en zoekt de velden op zodra hij "0" tegenkomt. De browser
    // stuurt het ook zo.
    body = new FormData();
    for (const [k, v] of Object.entries(formulier)) body.append("_1_" + k, v);
    body.append("0", JSON.stringify([...args, "$K1"]));
  } else {
    body = JSON.stringify(args);
    kop["Content-Type"] = "text/plain;charset=UTF-8";
  }
  const r = await fetch(SITE + pagina, { method: "POST", headers: kop, body, redirect: "manual" });
  const tekst = await r.text();
  const doorsturen = r.headers.get("x-action-redirect");
  const fout = tekst.match(/"fout":"([^"]*)"/);
  return { status: r.status, doorsturen: doorsturen ? doorsturen.split(";")[0] : null, fout: fout ? fout[1] : null, tekst };
}

(async () => {
  const [T] = await maakTestomgeving(1);
  const c = T.client;
  const cookie = sessieCookie(T.sessie);
  const voorraad = async (pid) => Number((await sql`select voorraad from producten where id = ${pid}`)[0].voorraad);

  try {
    // Gegevens klaarzetten zoals een student ze zou invoeren.
    const { data: klant } = await c.from("relaties").insert({ bedrijf_id: T.id, soort: "klant", naam: "Actietest klant", betaaltermijn_dagen: 14 }).select().single();
    const { data: prod } = await c.from("producten").insert({ bedrijf_id: T.id, naam: "Actietest product", verkoopprijs: 12.5, aankoopprijs: 5, btw_tarief: 21 }).select().single();
    const { data: dienst } = await c.from("producten").insert({ bedrijf_id: T.id, naam: "Actietest dienst", verkoopprijs: 40, btw_tarief: 21, voorraad_bijhouden: false }).select().single();

    // ---------- Voorraad: beginvoorraad en telling (formulieractie) ----------
    let r = await actie(cookie, `/voorraad/${prod.id}`, "voorraadAanpassen", [prod.id, {}], { wijze: "beginvoorraad", aantal: "10", datum: "2026-09-24", opmerking: "" });
    check("beginvoorraad via formulier", !r.fout && (await voorraad(prod.id)) === 10, r.fout ?? String(await voorraad(prod.id)));
    r = await actie(cookie, `/voorraad/${prod.id}`, "voorraadAanpassen", [prod.id, {}], { wijze: "telling", aantal: "9", datum: "2026-09-24", opmerking: "1 kapot" });
    check("telling 9 geeft correctie -1", !r.fout && (await voorraad(prod.id)) === 9, r.fout ?? String(await voorraad(prod.id)));

    // ---------- Bestelling met een product en een dienst ----------
    const { data: best } = await c.from("bestellingen").insert({ bedrijf_id: T.id, soort: "verkoop", relatie_id: klant.id }).select().single();
    await c.from("bestellijnen").insert([
      { bestelling_id: best.id, product_id: prod.id, omschrijving: "Actietest product", aantal: 4, eenheidsprijs: 12.5, btw_tarief: 21, volgorde: 0 },
      { bestelling_id: best.id, product_id: dienst.id, omschrijving: "Actietest dienst", aantal: 1, eenheidsprijs: 40, btw_tarief: 21, volgorde: 1 },
    ]);

    // Een bestelbon hoort niet bij een verkooporder.
    r = await actie(cookie, `/bestellingen/${best.id}`, "documentMakenVanBestelling", [best.id, "bestelbon"]);
    check("bestelbon bij verkooporder geweigerd", !!r.fout, r.fout);

    // ---------- Leverbon ----------
    r = await actie(cookie, `/bestellingen/${best.id}`, "documentMakenVanBestelling", [best.id, "leverbon"]);
    const lbId = r.doorsturen && r.doorsturen.split("/").pop();
    check("leverbon maken stuurt door naar het document", !!lbId && r.doorsturen.startsWith("/documenten/"), r.fout ?? r.doorsturen);
    r = await actie(cookie, `/bestellingen/${best.id}`, "documentMakenVanBestelling", [best.id, "leverbon"]);
    check("tweede leverbon geweigerd", !!r.fout, r.fout);

    let pagina = await (await fetch(`${SITE}/documenten/${lbId}`, { headers: { cookie } })).text();
    check("leverbonscherm toont uitleg over voorraad", pagina.includes("uit voorraad"));

    r = await actie(cookie, `/documenten/${lbId}`, "documentDefinitiefMaken", [lbId]);
    const [lb] = await sql`select status, pdf_pad from documenten where id = ${lbId}`;
    check("leverbon definitief met bewaarde pdf", !r.fout && lb.status === "definitief" && !!lb.pdf_pad, r.fout ?? JSON.stringify(lb));
    check("voorraad 9 - 4 = 5 (dienst telt niet mee)", (await voorraad(prod.id)) === 5, String(await voorraad(prod.id)));
    const [b1] = await sql`select status from bestellingen where id = ${best.id}`;
    check("bestelling geleverd", b1.status === "geleverd", b1.status);

    let pdf = await fetch(`${SITE}/documenten/${lbId}/pdf`, { headers: { cookie } });
    const lbPdf = Buffer.from(await pdf.arrayBuffer());
    check("leverbon-pdf wordt geleverd", pdf.status === 200 && lbPdf.subarray(0, 4).toString() === "%PDF", String(pdf.status));

    // Vergrendeld: lijnen wijzigen mag niet meer, verantwoordelijke wel.
    pagina = await (await fetch(`${SITE}/bestellingen/${best.id}`, { headers: { cookie } })).text();
    check("bestelling toont vergrendeling", pagina.includes("liggen") && pagina.includes("vast"));

    // ---------- Factuur ----------
    r = await actie(cookie, `/bestellingen/${best.id}`, "documentMakenVanBestelling", [best.id, "factuur"]);
    const fId = r.doorsturen && r.doorsturen.split("/").pop();
    check("factuur gemaakt", !!fId, r.fout);
    const [f0] = await sql`select datum, vervaldatum, totaal_incl from documenten where id = ${fId}`;
    const dagen = Math.round((new Date(f0.vervaldatum) - new Date(f0.datum)) / 86400000);
    check("vervaldatum volgt betaaltermijn klant (14 dagen)", dagen === 14, String(dagen));
    check("factuurtotaal (4 x 12,50 + 40) x 1,21 = 108,90", Number(f0.totaal_incl) === 108.9, String(f0.totaal_incl));
    r = await actie(cookie, `/documenten/${fId}`, "documentDefinitiefMaken", [fId]);
    const [b2] = await sql`select status from bestellingen where id = ${best.id}`;
    check("factuur definitief, bestelling gefactureerd", !r.fout && b2.status === "gefactureerd", r.fout ?? b2.status);
    pagina = await (await fetch(`${SITE}/documenten/${fId}`, { headers: { cookie } })).text();
    check("factuurscherm toont gestructureerde mededeling", /\+\+\+\d{3}\/\d{4}\/\d{5}\+\+\+/.test(pagina));
    pdf = await fetch(`${SITE}/documenten/${fId}/pdf`, { headers: { cookie } });
    check("factuur-pdf wordt geleverd", pdf.status === 200, String(pdf.status));
    r = await actie(cookie, `/documenten/${fId}`, "documentAnnuleren", [fId]);
    check("definitieve factuur annuleren geweigerd", !!r.fout, r.fout);

    // ---------- Creditnota ----------
    r = await actie(cookie, `/documenten/${fId}`, "creditnotaMaken", [fId]);
    const cnId = r.doorsturen && r.doorsturen.split("/").pop();
    check("creditnota gemaakt vanuit factuur", !!cnId, r.fout);
    const lijnen = JSON.stringify([{ product_id: prod.id, omschrijving: "Actietest product", aantal: 1, eenheidsprijs: 12.5, btw_tarief: 21, korting_pct: 0 }]);
    r = await actie(cookie, `/documenten/${cnId}`, "creditnotaOpslaan", [cnId, {}], { datum: "2026-09-24", lijnen, opmerking: "1 stuk retour", voorraad_terug: "on" });
    const [cn] = await sql`select totaal_incl, voorraad_terug, opmerking from documenten where id = ${cnId}`;
    check("creditnota bewaard: 1 x 12,50 x 1,21 = 15,13 met retour", !r.fout && Number(cn.totaal_incl) === 15.13 && cn.voorraad_terug, r.fout ?? JSON.stringify(cn));
    r = await actie(cookie, `/documenten/${cnId}`, "documentDefinitiefMaken", [cnId]);
    check("creditnota definitief, retour in voorraad (6)", !r.fout && (await voorraad(prod.id)) === 6, r.fout ?? String(await voorraad(prod.id)));
    pdf = await fetch(`${SITE}/documenten/${cnId}/pdf`, { headers: { cookie } });
    check("creditnota-pdf wordt geleverd", pdf.status === 200, String(pdf.status));

    // ---------- Leverbon annuleren ----------
    r = await actie(cookie, `/documenten/${lbId}`, "documentAnnuleren", [lbId]);
    check("leverbon annuleren zet voorraad terug (10)", !r.fout && (await voorraad(prod.id)) === 10, r.fout ?? String(await voorraad(prod.id)));

    // ---------- Schermen ----------
    for (const pad of ["/voorraad", `/voorraad/${prod.id}`, "/documenten?soort=creditnota", `/bestellingen/${best.id}`]) {
      const p = await fetch(SITE + pad, { headers: { cookie } });
      const t = await p.text();
      check(`scherm ${pad.replace(/[0-9a-f-]{36}/, "…")} laadt`, p.status === 200 && t.includes("Actietest"), String(p.status));
    }
  } finally {
    await ruimOp([T]);
    await einde();
  }
})().catch((e) => {
  console.error("Script mislukt:", e.message);
  process.exit(1);
});
