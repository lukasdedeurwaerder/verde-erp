// Test van de databank tegen het ECHTE Supabase-project:
//
//   npm.cmd run test:databank
//
// Werkt in twee tijdelijke testbedrijven (zie testhulp.js), controleert
// de afscherming tussen bedrijven, de triggers, de voorraad (fase 3) en
// de boekhouding (fase 4: automatische boekingen, betalingen, balans), en
// ruimt daarna alles op. Veilig om te draaien terwijl er gewerkt wordt.

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

    // ---------- Boekhouding (fase 4) ----------
    const { data: rek } = await admin.from("rekeningen").select("id,nummer");
    const r = Object.fromEntries(rek.map((x) => [x.nummer, x.id]));
    const lijnenVan = async (docId, dagboek) => {
      const { data } = await cA.from("boekingen").select("id, boekingslijnen(debet, credit, rekeningen(nummer))").eq("document_id", docId).eq("dagboek", dagboek);
      if (!data || data.length !== 1) return null;
      const uit = {};
      for (const l of data[0].boekingslijnen) uit[l.rekeningen.nummer] = Number(l.debet) - Number(l.credit);
      return uit;
    };

    const bf = await lijnenVan(f.id, "verkoop");
    check("factuur geboekt: 400 D 36,30 / 700 C 30 / 451 C 6,30", bf && bf["400"] === 36.3 && bf["700"] === -30 && bf["451"] === -6.3, JSON.stringify(bf));
    const bc = await lijnenVan(cn1.id, "verkoop");
    check("creditnota omgekeerd geboekt: 400 C 12,10", bc && bc["400"] === -12.1 && bc["700"] === 10 && bc["451"] === 2.1, JSON.stringify(bc));

    const open = async (id) => Number((await cA.rpc("openstaand", { p_id: id })).data);
    check("openstaand factuur = 36,30 - 12,10 = 24,20", (await open(f.id)) === 24.2, String(await open(f.id)));

    const { error: eTeVeelBet } = await cA.rpc("betaling_boeken", { p_bedrijf: A.id, p_datum: "2026-09-25", p_uittreksel: "1", p_omschrijving: "", p_bedrag: 30, p_document: f.id, p_rekening: null });
    check("meer ontvangen dan openstaat geweigerd", !!eTeVeelBet, eTeVeelBet && eTeVeelBet.message);
    const { data: betId, error: eBet } = await cA.rpc("betaling_boeken", { p_bedrijf: A.id, p_datum: "2026-09-25", p_uittreksel: "1", p_omschrijving: "", p_bedrag: 24.2, p_document: f.id, p_rekening: null });
    check("betaling van de klant geboekt", !eBet, eBet && eBet.message);
    check("factuur volledig betaald", (await open(f.id)) === 0, String(await open(f.id)));

    const { error: eBvoorA } = await cB.rpc("betaling_boeken", { p_bedrijf: A.id, p_datum: "2026-09-25", p_uittreksel: "1", p_omschrijving: "Sluip", p_bedrag: 5, p_document: null, p_rekening: r["100"] });
    check("B kan niet boeken voor A", !!eBvoorA, eBvoorA && eBvoorA.message);

    const { error: eKap } = await cA.rpc("betaling_boeken", { p_bedrijf: A.id, p_datum: "2026-09-01", p_uittreksel: "0", p_omschrijving: "Inbreng kapitaal", p_bedrag: 500, p_document: null, p_rekening: r["100"] });
    check("kapitaalinbreng via bank geboekt", !eKap, eKap && eKap.message);

    // Aankoopfactuur zonder nummer van de leverancier: geweigerd.
    const { data: af } = await cA.from("documenten").insert({ bedrijf_id: A.id, soort: "aankoopfactuur", relatie_id: lev.id }).select().single();
    check("aankoopfactuur krijgt nummer AF-jaar-0001", /^AF-\d{4}-0001$/.test(af.nummer), af.nummer);
    await cA.from("documentlijnen").insert([
      { document_id: af.id, product_id: prod.id, omschrijving: "Inkoop", aantal: 10, eenheidsprijs: 4, btw_tarief: 21 },
      { document_id: af.id, rekening_id: r["610"], omschrijving: "Huur standje", aantal: 1, eenheidsprijs: 50, btw_tarief: 21 },
    ]);
    const { error: eZonderNr } = await cA.rpc("document_definitief", { p_id: af.id });
    check("aankoopfactuur zonder leveranciersnummer geweigerd", !!eZonderNr && eZonderNr.message.includes("leverancier"), eZonderNr && eZonderNr.message);
    await cA.from("documenten").update({ extern_nummer: "2026/1234" }).eq("id", af.id);
    const { error: eAf } = await cA.rpc("document_definitief", { p_id: af.id });
    check("aankoopfactuur definitief", !eAf, eAf && eAf.message);
    const ba = await lijnenVan(af.id, "aankoop");
    check("aankoop geboekt: 604 D 40 / 610 D 50 / 411 D 18,90 / 440 C 108,90", ba && ba["604"] === 40 && ba["610"] === 50 && ba["411"] === 18.9 && ba["440"] === -108.9, JSON.stringify(ba));
    const { error: eAfPos } = await cA.rpc("betaling_boeken", { p_bedrijf: A.id, p_datum: "2026-09-26", p_uittreksel: "2", p_omschrijving: "", p_bedrag: 50, p_document: af.id, p_rekening: null });
    check("aankoopfactuur met positief bedrag geweigerd", !!eAfPos, eAfPos && eAfPos.message);
    const { error: eAfBet } = await cA.rpc("betaling_boeken", { p_bedrijf: A.id, p_datum: "2026-09-26", p_uittreksel: "2", p_omschrijving: "", p_bedrag: -108.9, p_document: af.id, p_rekening: null });
    check("leverancier betaald", !eAfBet && (await open(af.id)) === 0, eAfBet ? eAfBet.message : String(await open(af.id)));

    // Verkoop- en aankoopboekingen kunnen niet los verwijderd worden, betalingen wel.
    const { data: vb } = await cA.from("boekingen").select("id").eq("document_id", f.id).eq("dagboek", "verkoop").single();
    const { error: eVerw } = await cA.rpc("boeking_verwijderen", { p_id: vb.id });
    check("verkoopboeking los verwijderen geweigerd", !!eVerw, eVerw && eVerw.message);
    const { error: eBetVerw } = await cA.rpc("boeking_verwijderen", { p_id: betId });
    check("betaling verwijderen zet factuur weer open (24,20)", !eBetVerw && (await open(f.id)) === 24.2, eBetVerw ? eBetVerw.message : String(await open(f.id)));

    // Divers: uit evenwicht geweigerd, in evenwicht aanvaard.
    const { error: eDivScheef } = await cA.rpc("divers_boeken", { p_bedrijf: A.id, p_datum: "2026-09-30", p_omschrijving: "Scheef", p_lijnen: [{ rekening_id: r["630"], debet: 10 }, { rekening_id: r["2409"], credit: 9 }] });
    check("diverse boeking uit evenwicht geweigerd", !!eDivScheef && eDivScheef.message.includes("evenwicht"), eDivScheef && eDivScheef.message);
    const { error: eDiv } = await cA.rpc("divers_boeken", { p_bedrijf: A.id, p_datum: "2026-09-30", p_omschrijving: "Afschrijving", p_lijnen: [{ rekening_id: r["630"], debet: 10 }, { rekening_id: r["2409"], credit: 10 }] });
    check("diverse boeking in evenwicht aanvaard", !eDiv, eDiv && eDiv.message);

    // Voorraad op de balans: 16 stuks x 4 = 64 op 340.
    const { data: verschil, error: eVb } = await cA.rpc("voorraad_op_balans", { p_bedrijf: A.id, p_datum: "2026-09-30" });
    check("voorraad op balans: 16 x 4 = 64", !eVb && Number(verschil) === 64, eVb ? eVb.message : String(verschil));

    // Balans sluit: activa = passiva + resultaat.
    const { data: saldi } = await cA.rpc("saldi_tot", { p_bedrijf: A.id, p_tot: null });
    const som = (soort) => saldi.filter((x) => x.soort === soort).reduce((t, x) => t + Number(x.saldo), 0);
    const activa = som("actief"), passiva = som("passief"), resultaat = som("opbrengst") - som("kost");
    check("balans sluit: activa = passiva + resultaat", Math.abs(activa - passiva - resultaat) < 0.005, `${activa.toFixed(2)} = ${passiva.toFixed(2)} + ${resultaat.toFixed(2)}`);
    const s340 = saldi.find((x) => x.nummer === "340");
    check("rekening 340 staat op 64", s340 && Number(s340.saldo) === 64, JSON.stringify(s340));

    const { data: saldiB } = await cB.rpc("saldi_tot", { p_bedrijf: A.id, p_tot: null });
    check("B ziet saldi van A niet", saldiB.length === 0);
    const { error: eGedeeld } = await cB.rpc("gedeelde_bankrekening", {});
    check("gedeelde bankrekening leesbaar", !eGedeeld, eGedeeld && eGedeeld.message);

    // ---------- Aankoopcreditnota (fase 5) ----------
    const { data: acn } = await cA.from("documenten").insert({ bedrijf_id: A.id, soort: "aankoopcreditnota", relatie_id: lev.id, bron_document_id: af.id }).select().single();
    check("aankoopcreditnota krijgt nummer ACN-jaar-0001", /^ACN-\d{4}-0001$/.test(acn.nummer), acn.nummer);
    await cA.from("documentlijnen").insert({ document_id: acn.id, rekening_id: r["610"], omschrijving: "Korting huur", aantal: 1, eenheidsprijs: 10, btw_tarief: 21 });
    const { error: eAcnZonder } = await cA.rpc("document_definitief", { p_id: acn.id });
    check("aankoopcreditnota zonder nummer leverancier geweigerd", !!eAcnZonder, eAcnZonder && eAcnZonder.message);
    await cA.from("documenten").update({ extern_nummer: "CN-55" }).eq("id", acn.id);
    const { error: eAcn } = await cA.rpc("document_definitief", { p_id: acn.id });
    check("aankoopcreditnota definitief", !eAcn, eAcn && eAcn.message);
    const bacn = await lijnenVan(acn.id, "aankoop");
    check("aankoopcreditnota omgekeerd: 440 D 12,10 / 610 C 10 / 411 C 2,10", bacn && bacn["440"] === 12.1 && bacn["610"] === -10 && bacn["411"] === -2.1, JSON.stringify(bacn));
    check("aankoopfactuur was betaald: nu 12,10 te veel", (await open(af.id)) === -12.1, String(await open(af.id)));
    const { error: eTerug } = await cA.rpc("betaling_boeken", { p_bedrijf: A.id, p_datum: "2026-09-30", p_uittreksel: "5", p_omschrijving: "", p_bedrag: 12.1, p_document: af.id, p_rekening: null });
    check("leverancier betaalt 12,10 terug", !eTerug && (await open(af.id)) === 0, eTerug ? eTerug.message : String(await open(af.id)));

    // ---------- Logboek (fase 5) ----------
    const { data: log } = await cA.from("logboek").select("actie, onderwerp, gebruiker_id").eq("bedrijf_id", A.id);
    const heeft = (actie, woord) => log.some((l) => l.actie === actie && (l.onderwerp ?? "").includes(woord) && l.gebruiker_id === A.gebruikerId);
    check("logboek: klant aangemaakt door A", heeft("aangemaakt", "Testklant"));
    check("logboek: factuur definitief", heeft("definitief", "F-"));
    check("logboek: bankverrichting", heeft("aangemaakt", "Bankverrichting"));
    check("logboek: geen regels voor automatische voorraadupdates", !log.some((l) => l.actie === "gewijzigd" && (l.onderwerp ?? "").startsWith("Product")));
    const { error: eLogSchrijf } = await cA.from("logboek").insert({ bedrijf_id: A.id, actie: "vals", onderwerp: "x" });
    check("student kan niet in het logboek schrijven", !!eLogSchrijf);
    await cA.from("logboek").delete().eq("bedrijf_id", A.id);
    const { count: nogLog } = await admin.from("logboek").select("id", { count: "exact", head: true }).eq("bedrijf_id", A.id);
    check("student kan het logboek niet wissen", (nogLog ?? 0) === log.length, `${nogLog} van ${log.length}`);
    const { data: logB } = await cB.from("logboek").select("id").eq("bedrijf_id", A.id);
    check("B ziet het logboek van A niet", logB.length === 0);
    const { data: act } = await cA.rpc("activiteit_per_persoon", { p_bedrijf: A.id });
    const mij = (act ?? []).find((x) => x.gebruiker_id === A.gebruikerId);
    check("activiteit per persoon telt de acties van A", mij && Number(mij.aantal) >= 10, JSON.stringify(mij));

    // ---------- Opslag ----------
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    const { error: eUp } = await cA.storage.from("productfotos").upload(`${A.id}/${prod.id}.jpg`, jpeg, { contentType: "image/jpeg", upsert: true });
    check("A uploadt foto in eigen map", !eUp, eUp && eUp.message);
    const { error: eUp2 } = await cA.storage.from("productfotos").upload(`${B.id}/sluip.jpg`, jpeg, { contentType: "image/jpeg" });
    check("A kan niet in map van B uploaden", !!eUp2);
  } catch (e) {
    // Een fout midden in de test telt als mislukt, ook al ruimen we netjes op.
    check("test liep volledig door", false, e.message);
  } finally {
    await ruimOp(bedrijven);
    await einde();
  }
})().catch((e) => {
  console.error("Script mislukt:", e.message);
  process.exit(1);
});
