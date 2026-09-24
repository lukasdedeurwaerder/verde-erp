// Test van de databank tegen het ECHTE Supabase-project:
//
//   npm.cmd run test:databank
//
// Werkt in twee tijdelijke testbedrijven (zie testhulp.js), controleert
// de afscherming tussen bedrijven, de triggers en de functies van fase 3
// (voorraad bij leverbon en ontvangstbon, factuur, creditnota), en ruimt
// daarna alles op. Veilig om te draaien terwijl er gewerkt wordt.

const { admin, check, maakTestomgeving, ruimOp, einde } = require("./testhulp");

(async () => {
  const bedrijven = await maakTestomgeving(2);
  const [A, B] = bedrijven;
  const cA = A.client;
  const cB = B.client;

  try {
    // ---------- Afscherming ----------
    const { data: pA } = await admin.from("profielen").select("*").eq("id", A.gebruikerId).single();
    check("profiel automatisch aangemaakt met bedrijf", pA.bedrijf_id === A.id && pA.rol === "student");

    const { data: klant, error: eK } = await cA.from("relaties").insert({ bedrijf_id: A.id, soort: "klant", naam: "Testklant" }).select().single();
    check("A maakt klant in eigen bedrijf", !eK, eK && eK.message);
    const { error: eKB } = await cA.from("relaties").insert({ bedrijf_id: B.id, soort: "klant", naam: "Sluipklant" });
    check("A kan GEEN klant in bedrijf B maken", !!eKB);
    const { data: zicht } = await cB.from("relaties").select("id").eq("id", klant.id);
    check("B ziet de klant van A niet", zicht.length === 0);

    await cA.from("profielen").update({ rol: "docent", naam: "Andere naam" }).eq("id", A.gebruikerId);
    const { data: pA2 } = await admin.from("profielen").select("rol,naam").eq("id", A.gebruikerId).single();
    check("student wijzigt eigen naam maar niet de rol", pA2.rol === "student" && pA2.naam === "Andere naam");

    // ---------- Product, voorraad, nummering ----------
    const { data: prod } = await cA.from("producten").insert({ bedrijf_id: A.id, naam: "Testproduct", verkoopprijs: 10, aankoopprijs: 4, btw_tarief: 21 }).select().single();
    await cA.from("voorraadmutaties").insert({ bedrijf_id: A.id, product_id: prod.id, aantal: 5, soort: "beginvoorraad" });
    const voorraad = async () => Number((await cA.from("producten").select("voorraad").eq("id", prod.id).single()).data.voorraad);
    check("beginvoorraad 5", (await voorraad()) === 5);

    const { data: best } = await cA.from("bestellingen").insert({ bedrijf_id: A.id, soort: "verkoop", relatie_id: klant.id }).select().single();
    check("bestelling krijgt nummer 1", best.nummer === 1, String(best.nummer));

    const maakDoc = async (soort, extra = {}) => {
      const { data, error } = await cA.from("documenten").insert({ bedrijf_id: A.id, soort, relatie_id: klant.id, bestelling_id: best.id, ...extra }).select().single();
      if (error) return { error };
      return { data };
    };

    // ---------- Leverbon: te weinig voorraad ----------
    const { data: lb1 } = await maakDoc("leverbon");
    check("leverbon krijgt nummer LB-jaar-0001", /^LB-\d{4}-0001$/.test(lb1.nummer), lb1.nummer);
    await cA.from("documentlijnen").insert({ document_id: lb1.id, product_id: prod.id, omschrijving: "Testproduct", aantal: 8, eenheidsprijs: 10, btw_tarief: 21 });
    const { error: eTekort } = await cA.rpc("document_definitief", { p_id: lb1.id });
    check("leverbon met te weinig voorraad geweigerd", !!eTekort && eTekort.message.includes("Onvoldoende voorraad"), eTekort && eTekort.message);
    check("voorraad ongewijzigd na weigering", (await voorraad()) === 5);

    const { error: eDubbel } = await maakDoc("leverbon");
    check("tweede lopende leverbon voor dezelfde bestelling geweigerd", !!eDubbel.error || !!eDubbel);

    // ---------- Leverbon: genoeg voorraad ----------
    await cA.from("documentlijnen").update({ aantal: 3 }).eq("document_id", lb1.id);
    const { error: eLb } = await cA.rpc("document_definitief", { p_id: lb1.id });
    check("leverbon definitief", !eLb, eLb && eLb.message);
    check("voorraad 5 - 3 = 2", (await voorraad()) === 2, String(await voorraad()));
    const { data: bNa } = await cA.from("bestellingen").select("status").eq("id", best.id).single();
    check("bestelling staat op geleverd", bNa.status === "geleverd", bNa.status);

    // ---------- Leverbon annuleren ----------
    const { error: eAn } = await cA.rpc("document_annuleren", { p_id: lb1.id });
    check("leverbon annuleren", !eAn, eAn && eAn.message);
    check("voorraad terug op 5", (await voorraad()) === 5, String(await voorraad()));
    const { data: bNa2 } = await cA.from("bestellingen").select("status").eq("id", best.id).single();
    check("bestelling terug op klaar", bNa2.status === "klaar", bNa2.status);

    // ---------- Factuur en creditnota ----------
    const { data: f } = await maakDoc("factuur");
    await cA.from("documentlijnen").insert({ document_id: f.id, product_id: prod.id, omschrijving: "Testproduct", aantal: 3, eenheidsprijs: 10, btw_tarief: 21 });
    const { error: eF } = await cA.rpc("document_definitief", { p_id: f.id });
    check("factuur definitief", !eF, eF && eF.message);
    const { data: fNa } = await cA.from("documenten").select("totaal_incl").eq("id", f.id).single();
    check("factuur 3 x 10 + 21 % = 36,30", Number(fNa.totaal_incl) === 36.3, String(fNa.totaal_incl));
    const { error: eFan } = await cA.rpc("document_annuleren", { p_id: f.id });
    check("definitieve factuur annuleren geweigerd", !!eFan && eFan.message.includes("creditnota"), eFan && eFan.message);

    const { error: eZonder } = await cA.from("documenten").insert({ bedrijf_id: A.id, soort: "creditnota", relatie_id: klant.id });
    check("creditnota zonder factuur geweigerd", !!eZonder);
    const { error: eFzonder } = await cA.from("documenten").insert({ bedrijf_id: A.id, soort: "factuur", relatie_id: klant.id });
    check("factuur zonder bestelling geweigerd", !!eFzonder);

    const { data: cn1 } = await maakDoc("creditnota", { bron_document_id: f.id, voorraad_terug: true });
    await cA.from("documentlijnen").insert({ document_id: cn1.id, product_id: prod.id, omschrijving: "Retour", aantal: 1, eenheidsprijs: 10, btw_tarief: 21 });
    const { error: eCn } = await cA.rpc("document_definitief", { p_id: cn1.id });
    check("creditnota met retour definitief", !eCn, eCn && eCn.message);
    check("voorraad +1 door retour (6)", (await voorraad()) === 6, String(await voorraad()));

    const { data: cn2 } = await maakDoc("creditnota", { bron_document_id: f.id });
    await cA.from("documentlijnen").insert({ document_id: cn2.id, omschrijving: "Te veel", aantal: 3, eenheidsprijs: 10, btw_tarief: 21 });
    const { error: eTeVeel } = await cA.rpc("document_definitief", { p_id: cn2.id });
    check("meer crediteren dan de factuur geweigerd", !!eTeVeel && eTeVeel.message.includes("Te veel"), eTeVeel && eTeVeel.message);

    // ---------- Ontvangstbon ----------
    const { data: lev } = await cA.from("relaties").insert({ bedrijf_id: A.id, soort: "leverancier", naam: "Testleverancier" }).select().single();
    const { data: ak } = await cA.from("bestellingen").insert({ bedrijf_id: A.id, soort: "aankoop", relatie_id: lev.id }).select().single();
    const { data: ob } = await cA.from("documenten").insert({ bedrijf_id: A.id, soort: "ontvangstbon", relatie_id: lev.id, bestelling_id: ak.id }).select().single();
    await cA.from("documentlijnen").insert({ document_id: ob.id, product_id: prod.id, omschrijving: "Testproduct", aantal: 10, eenheidsprijs: 4, btw_tarief: 21 });
    const { error: eOb } = await cA.rpc("document_definitief", { p_id: ob.id });
    check("ontvangstbon definitief", !eOb, eOb && eOb.message);
    check("voorraad +10 (16)", (await voorraad()) === 16, String(await voorraad()));

    // ---------- B kan niets van A ----------
    const { error: eBdef } = await cB.rpc("document_definitief", { p_id: cn2.id });
    check("B kan document van A niet definitief maken", !!eBdef, eBdef && eBdef.message);

    // ---------- Boekhouding: evenwicht en saldi ----------
    const { data: rek } = await admin.from("rekeningen").select("id,nummer").in("nummer", ["400", "700", "451"]);
    const r = Object.fromEntries(rek.map((x) => [x.nummer, x.id]));
    const { data: boek } = await cA.from("boekingen").insert({ bedrijf_id: A.id, dagboek: "verkoop", omschrijving: "Test", document_id: f.id }).select().single();
    const { error: eL1 } = await cA.from("boekingslijnen").insert([
      { boeking_id: boek.id, rekening_id: r["400"], debet: 36.3 },
      { boeking_id: boek.id, rekening_id: r["700"], credit: 30 },
      { boeking_id: boek.id, rekening_id: r["451"], credit: 6.3 },
    ]);
    check("boeking in evenwicht aanvaard", !eL1, eL1 && eL1.message);
    const { error: eL2 } = await cA.from("boekingslijnen").insert([{ boeking_id: boek.id, rekening_id: r["400"], debet: 1 }]);
    check("boeking uit evenwicht geweigerd", !!eL2 && eL2.message.includes("evenwicht"));
    const { data: saldiB } = await cB.from("rekeningsaldi").select("nummer").eq("bedrijf_id", A.id);
    check("B ziet saldi van A niet", saldiB.length === 0);

    // ---------- Opslag ----------
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    const { error: eUp } = await cA.storage.from("productfotos").upload(`${A.id}/${prod.id}.jpg`, jpeg, { contentType: "image/jpeg", upsert: true });
    check("A uploadt foto in eigen map", !eUp, eUp && eUp.message);
    const { error: eUp2 } = await cA.storage.from("productfotos").upload(`${B.id}/sluip.jpg`, jpeg, { contentType: "image/jpeg" });
    check("A kan niet in map van B uploaden", !!eUp2);
  } finally {
    await ruimOp(bedrijven);
    await einde();
  }
})().catch((e) => {
  console.error("Script mislukt:", e.message);
  process.exit(1);
});
