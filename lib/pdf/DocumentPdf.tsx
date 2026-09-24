import { Document as PdfDocument, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { datum, DOCUMENT_LABEL, toontPrijzen } from "@/lib/bestelling";
import { euro } from "@/lib/geld";
import { lijnExcl, totalen } from "@/lib/lijnen";
import type { Bedrijf, Document, DocumentSoort, Instellingen, Lijn, Relatie } from "@/lib/types";

// De opmaak van elk document: offerte, bestelbon, en straks leverbon,
// factuur en creditnota. Eén sjabloon, met per soort een andere titel en
// een ander onderschrift. Bedragen en totalen komen uit lib/lijnen, dus
// de pdf toont exact wat de databank bewaart.

export type PdfGegevens = {
  document: Document;
  lijnen: Lijn[];
  relatie: Relatie;
  bedrijf: Bedrijf;
  instellingen: Instellingen;
  /** Het nummer van de bestelling waar het document uit komt, bv. 2026-0007. */
  bestellingNummer: string | null;
  verantwoordelijke: string | null;
  /** Creditnota: de factuur waarop ze betrekking heeft. */
  bron: { nummer: string | null; datum: string } | null;
  /** Factuur: de gestructureerde mededeling voor de betaling. */
  mededeling: string | null;
};

const s = StyleSheet.create({
  pagina: { padding: 48, fontSize: 10, fontFamily: "Helvetica", color: "#16181d" },
  kop: { flexDirection: "row", justifyContent: "space-between", marginBottom: 28 },
  bedrijf: { fontSize: 16, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  klein: { fontSize: 9, color: "#5b6170", lineHeight: 1.4 },
  titel: { fontSize: 22, fontFamily: "Helvetica-Bold", textAlign: "right" },
  nummer: { fontSize: 11, textAlign: "right", marginTop: 4 },
  concept: { fontSize: 11, textAlign: "right", marginTop: 4, color: "#b91c1c", fontFamily: "Helvetica-Bold" },
  blokken: { flexDirection: "row", justifyContent: "space-between", marginBottom: 24 },
  blok: { width: "48%" },
  blokTitel: { fontSize: 8, color: "#8f95a3", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 },
  blokTekst: { marginBottom: 2 },
  gegevensRij: { flexDirection: "row", marginBottom: 2 },
  gegevensLabel: { width: 110, color: "#5b6170" },
  tabel: { marginTop: 8 },
  rij: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#e7eaf0", paddingVertical: 5 },
  kopRij: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#16181d", paddingBottom: 4, marginBottom: 2 },
  kopCel: { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#5b6170", textTransform: "uppercase" },
  cOms: { flex: 1 },
  cAantal: { width: 55, textAlign: "right" },
  cPrijs: { width: 70, textAlign: "right" },
  cKorting: { width: 50, textAlign: "right" },
  cBtw: { width: 40, textAlign: "right" },
  cTotaal: { width: 75, textAlign: "right" },
  totalen: { marginTop: 12, alignSelf: "flex-end", width: 240 },
  totaalRij: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  totaalIncl: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, borderTopWidth: 1, borderTopColor: "#16181d", marginTop: 4, fontFamily: "Helvetica-Bold", fontSize: 11 },
  opmerking: { marginTop: 24 },
  betaling: { marginTop: 18, padding: 10, borderWidth: 0.5, borderColor: "#d8dce4", borderRadius: 4, width: 300 },
  betaalRij: { flexDirection: "row", marginBottom: 2 },
  betaalLabel: { width: 130, color: "#5b6170" },
  handtekeningen: { flexDirection: "row", justifyContent: "space-between", marginTop: 40 },
  handtekening: { width: "45%", borderTopWidth: 0.5, borderTopColor: "#16181d", paddingTop: 4, fontSize: 9, color: "#5b6170" },
  voet: { position: "absolute", left: 48, right: 48, bottom: 32, fontSize: 8, color: "#8f95a3", textAlign: "center", borderTopWidth: 0.5, borderTopColor: "#e7eaf0", paddingTop: 8, lineHeight: 1.4 },
});

const ONDERSCHRIFT: Partial<Record<DocumentSoort, string>> = {
  offerte: "Deze offerte is geldig tot de vermelde datum. Prijzen zijn in euro, exclusief btw tenzij anders vermeld.",
  bestelbon: "Gelieve deze bestelbon te bevestigen en de gewenste leverdatum te respecteren.",
  leverbon: "Gelieve de goederen bij ontvangst te controleren en de leverbon te ondertekenen.",
  ontvangstbon: "Intern document: bevestiging van de ontvangen goederen.",
  factuur: "Gelieve te betalen voor de vervaldatum met vermelding van het factuurnummer.",
  creditnota: "Dit bedrag wordt in mindering gebracht op de vermelde factuur.",
};

function adres(r: { straat: string | null; postcode: string | null; gemeente: string | null; land: string }): string[] {
  const regels: string[] = [];
  if (r.straat) regels.push(r.straat);
  const plaats = [r.postcode, r.gemeente].filter(Boolean).join(" ");
  if (plaats) regels.push(plaats);
  if (r.land && r.land !== "België") regels.push(r.land);
  return regels;
}

export function DocumentPdf({ document: d, lijnen, relatie, bedrijf, instellingen, bestellingNummer, verantwoordelijke, bron, mededeling }: PdfGegevens) {
  const som = totalen(lijnen);
  const titel = DOCUMENT_LABEL[d.soort];
  const concept = d.status !== "definitief";
  const vervalLabel = d.soort === "offerte" ? "Geldig tot" : d.soort === "bestelbon" ? "Gewenste levering" : "Vervaldatum";
  const prijzen = toontPrijzen(d.soort);
  const naarLabel = d.soort === "bestelbon" || d.soort === "ontvangstbon" ? "Leverancier" : "Klant";

  return (
    <PdfDocument title={`${titel} ${d.nummer ?? ""}`} author={bedrijf.naam}>
      <Page size="A4" style={s.pagina}>
        <View style={s.kop}>
          <View>
            <Text style={s.bedrijf}>{bedrijf.naam}</Text>
            <Text style={s.klein}>Dochteronderneming van {instellingen.moeder_naam}</Text>
            {adres(bedrijf).map((r) => (
              <Text key={r} style={s.klein}>{r}</Text>
            ))}
            {bedrijf.btw_nummer && <Text style={s.klein}>Btw {bedrijf.btw_nummer}</Text>}
            {bedrijf.email && <Text style={s.klein}>{bedrijf.email}</Text>}
            {bedrijf.telefoon && <Text style={s.klein}>{bedrijf.telefoon}</Text>}
          </View>
          <View>
            <Text style={s.titel}>{titel}</Text>
            <Text style={s.nummer}>{d.nummer}</Text>
            {concept && <Text style={s.concept}>{d.status === "geannuleerd" ? "GEANNULEERD" : "CONCEPT"}</Text>}
          </View>
        </View>

        <View style={s.blokken}>
          <View style={s.blok}>
            <Text style={s.blokTitel}>{naarLabel}</Text>
            <Text style={[s.blokTekst, { fontFamily: "Helvetica-Bold" }]}>{relatie.naam}</Text>
            {relatie.contactpersoon && <Text style={s.blokTekst}>T.a.v. {relatie.contactpersoon}</Text>}
            {adres(relatie).map((r) => (
              <Text key={r} style={s.blokTekst}>{r}</Text>
            ))}
            {relatie.btw_nummer && <Text style={s.blokTekst}>Btw {relatie.btw_nummer}</Text>}
          </View>
          <View style={s.blok}>
            <View style={s.gegevensRij}>
              <Text style={s.gegevensLabel}>Datum</Text>
              <Text>{datum(d.datum)}</Text>
            </View>
            {d.vervaldatum && (
              <View style={s.gegevensRij}>
                <Text style={s.gegevensLabel}>{vervalLabel}</Text>
                <Text>{datum(d.vervaldatum)}</Text>
              </View>
            )}
            {bron && (
              <View style={s.gegevensRij}>
                <Text style={s.gegevensLabel}>Betreft factuur</Text>
                <Text>
                  {bron.nummer} van {datum(bron.datum)}
                </Text>
              </View>
            )}
            {bestellingNummer && (
              <View style={s.gegevensRij}>
                <Text style={s.gegevensLabel}>Bestelling</Text>
                <Text>{bestellingNummer}</Text>
              </View>
            )}
            {verantwoordelijke && (
              <View style={s.gegevensRij}>
                <Text style={s.gegevensLabel}>Uw contact</Text>
                <Text>{verantwoordelijke}</Text>
              </View>
            )}
          </View>
        </View>

        <View style={s.tabel}>
          <View style={s.kopRij}>
            <Text style={[s.cOms, s.kopCel]}>Omschrijving</Text>
            <Text style={[s.cAantal, s.kopCel]}>Aantal</Text>
            {prijzen && (
              <>
                <Text style={[s.cPrijs, s.kopCel]}>Prijs</Text>
                <Text style={[s.cKorting, s.kopCel]}>Korting</Text>
                <Text style={[s.cBtw, s.kopCel]}>Btw</Text>
                <Text style={[s.cTotaal, s.kopCel]}>Totaal</Text>
              </>
            )}
          </View>
          {lijnen.map((l, i) => (
            <View key={l.id ?? i} style={s.rij} wrap={false}>
              <Text style={s.cOms}>{l.omschrijving}</Text>
              <Text style={s.cAantal}>{String(l.aantal).replace(".", ",")}</Text>
              {prijzen && (
                <>
                  <Text style={s.cPrijs}>{euro(l.eenheidsprijs)}</Text>
                  <Text style={s.cKorting}>{l.korting_pct ? `${String(l.korting_pct).replace(".", ",")} %` : ""}</Text>
                  <Text style={s.cBtw}>{l.btw_tarief} %</Text>
                  <Text style={s.cTotaal}>{euro(lijnExcl(l))}</Text>
                </>
              )}
            </View>
          ))}
        </View>

        {prijzen && (
        <View style={s.totalen}>
          <View style={s.totaalRij}>
            <Text>Totaal excl. btw</Text>
            <Text>{euro(som.excl)}</Text>
          </View>
          {som.perTarief.map((t) => (
            <View key={t.tarief} style={s.totaalRij}>
              <Text>Btw {t.tarief} % op {euro(t.grondslag)}</Text>
              <Text>{euro(t.btw)}</Text>
            </View>
          ))}
          <View style={s.totaalIncl}>
            <Text>Totaal incl. btw</Text>
            <Text>{euro(som.incl)}</Text>
          </View>
        </View>
        )}

        {d.soort === "factuur" && (
          <View style={s.betaling} wrap={false}>
            <Text style={s.blokTitel}>Betaling</Text>
            <View style={s.betaalRij}>
              <Text style={s.betaalLabel}>Te betalen</Text>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>{euro(som.incl)}</Text>
            </View>
            {d.vervaldatum && (
              <View style={s.betaalRij}>
                <Text style={s.betaalLabel}>Uiterlijk op</Text>
                <Text>{datum(d.vervaldatum)}</Text>
              </View>
            )}
            {instellingen.iban && (
              <View style={s.betaalRij}>
                <Text style={s.betaalLabel}>Rekeningnummer</Text>
                <Text>{instellingen.iban}</Text>
              </View>
            )}
            {mededeling && (
              <View style={s.betaalRij}>
                <Text style={s.betaalLabel}>Mededeling</Text>
                <Text style={{ fontFamily: "Helvetica-Bold" }}>{mededeling}</Text>
              </View>
            )}
          </View>
        )}

        {!prijzen && (
          <View style={s.handtekeningen} wrap={false}>
            <Text style={s.handtekening}>Voor {d.soort === "leverbon" ? "levering" : "ontvangst"}: naam en handtekening</Text>
            <Text style={s.handtekening}>Datum</Text>
          </View>
        )}

        {d.opmerking && (
          <View style={s.opmerking}>
            <Text style={s.blokTitel}>Opmerking</Text>
            <Text>{d.opmerking}</Text>
          </View>
        )}

        <View style={s.voet} fixed>
          {ONDERSCHRIFT[d.soort] && <Text>{ONDERSCHRIFT[d.soort]}</Text>}
          {instellingen.iban && (
            <Text>
              Bankrekening {instellingen.iban}
              {instellingen.bic ? ` (BIC ${instellingen.bic})` : ""}
            </Text>
          )}
          {instellingen.factuur_voettekst && <Text>{instellingen.factuur_voettekst}</Text>}
        </View>
      </Page>
    </PdfDocument>
  );
}
