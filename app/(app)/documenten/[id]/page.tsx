import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { huidigeContext } from "@/lib/sessie";
import { supabaseServer } from "@/lib/supabase/server";
import {
  bestellingNummer,
  datum,
  DOCUMENT_LABEL,
  DOCUMENT_STATUS_KLASSE,
  DOCUMENT_STATUS_LABEL,
  gestructureerdeMededeling,
  toontPrijzen,
} from "@/lib/bestelling";
import { aantal, euro } from "@/lib/geld";
import { cent, lijnExcl, totalen } from "@/lib/lijnen";
import type { Document, Lijn } from "@/lib/types";
import type { ProductKeuze } from "../../bestellingen/LijnenEditor";
import { DocumentActies } from "./Acties";
import { CreditnotaFormulier } from "./CreditnotaFormulier";
import { BOEKING_SELECT, BoekingWeergave, type BoekingMetLijnen } from "../../dagboeken/BoekingWeergave";

type Rij = Document & {
  documentlijnen: Lijn[];
  relaties: { naam: string; gemeente: string | null } | null;
  bestellingen: { id: string; jaar: number; nummer: number; soort: string } | null;
  bedrijven: { naam: string; volgorde: number } | null;
};

type Verwant = Pick<Document, "id" | "soort" | "nummer" | "status" | "datum" | "totaal_incl">;

const VERVAL_LABEL: Partial<Record<Document["soort"], string>> = {
  offerte: "Geldig tot",
  bestelbon: "Gewenste levering",
  factuur: "Vervaldatum",
};

const SOORT_UITLEG: Partial<Record<Document["soort"], string>> = {
  leverbon: "Bij definitief maken gaan de goederen uit voorraad en wordt de bestelling ‘geleverd’.",
  ontvangstbon: "Bij definitief maken komen de goederen in voorraad en wordt de bestelling ‘geleverd’.",
  factuur: "Bij definitief maken wordt de bestelling ‘gefactureerd’. Een definitieve factuur corrigeer je met een creditnota.",
  creditnota: "Pas de lijnen aan tot ze tonen wat je crediteert. Vink ‘retour’ aan als de goederen terug in voorraad gaan.",
};

export default async function DocumentPagina({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await huidigeContext();
  const supabase = await supabaseServer();

  const { data } = await supabase
    .from("documenten")
    .select("*, documentlijnen(*), relaties(naam, gemeente), bestellingen(id, jaar, nummer, soort), bedrijven(naam, volgorde)")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  if (data.soort === "aankoopfactuur" || data.soort === "aankoopcreditnota") redirect(`/aankopen/${id}`);
  const d = data as unknown as Rij;
  const lijnen = [...(d.documentlijnen ?? [])].sort((a, b) => a.volgorde - b.volgorde);
  const som = totalen(lijnen);
  const prijzen = toontPrijzen(d.soort);
  const bewerkbareCreditnota = d.soort === "creditnota" && d.status === "concept";

  // Wat erbij hoort: de factuur van een creditnota, de creditnota's van
  // een factuur, en de voorraadbewegingen die dit document veroorzaakte.
  const [bronQ, creditQ, mutQ] = await Promise.all([
    d.bron_document_id
      ? supabase.from("documenten").select("id, soort, nummer, status, datum, totaal_incl").eq("id", d.bron_document_id).maybeSingle()
      : Promise.resolve({ data: null }),
    d.soort === "factuur"
      ? supabase.from("documenten").select("id, soort, nummer, status, datum, totaal_incl").eq("bron_document_id", d.id).order("aangemaakt_op")
      : Promise.resolve({ data: [] }),
    d.status !== "concept"
      ? supabase.from("voorraadmutaties").select("id, aantal, soort, datum, opmerking, producten(id, naam, eenheid)").eq("document_id", d.id).order("aangemaakt_op")
      : Promise.resolve({ data: [] }),
  ]);
  const bron = bronQ.data as Verwant | null;
  const creditnotas = (creditQ.data ?? []) as Verwant[];
  const mutaties = (mutQ.data ?? []) as unknown as {
    id: string;
    aantal: number;
    soort: string;
    datum: string;
    opmerking: string | null;
    producten: { id: string; naam: string; eenheid: string } | null;
  }[];

  const gecrediteerd = cent(creditnotas.filter((c) => c.status === "definitief").reduce((t, c) => t + Number(c.totaal_incl), 0));
  const nogTeCrediteren = cent(Number(d.totaal_incl) - gecrediteerd);

  // Concept-leverbon: vooraf tonen of er genoeg voorraad is.
  const productIds = [...new Set(lijnen.map((l) => l.product_id).filter((x): x is string => !!x))];
  let voorraad: Map<string, { voorraad: number; bijhouden: boolean; eenheid: string }> = new Map();
  if (d.soort === "leverbon" && d.status === "concept" && productIds.length > 0) {
    const { data: ps } = await supabase.from("producten").select("id, voorraad, voorraad_bijhouden, eenheid").in("id", productIds);
    voorraad = new Map((ps ?? []).map((p) => [p.id, { voorraad: Number(p.voorraad), bijhouden: p.voorraad_bijhouden, eenheid: p.eenheid }]));
  }
  const nodig = new Map<string, number>();
  for (const l of lijnen) if (l.product_id) nodig.set(l.product_id, (nodig.get(l.product_id) ?? 0) + Number(l.aantal));
  const tekort = [...nodig.entries()].filter(([pid, n]) => {
    const v = voorraad.get(pid);
    return v && v.bijhouden && v.voorraad < n;
  });

  // Producten voor de lijnen-editor van een creditnota, en hoeveel er
  // van de factuur nog gecrediteerd kan worden.
  let producten: ProductKeuze[] = [];
  let maxCredit: number | null = null;
  if (bewerkbareCreditnota && bron) {
    const { data: zussen } = await supabase
      .from("documenten")
      .select("totaal_incl")
      .eq("bron_document_id", bron.id)
      .eq("status", "definitief");
    maxCredit = cent(Number(bron.totaal_incl) - (zussen ?? []).reduce((t, z) => t + Number(z.totaal_incl), 0));
  }
  if (bewerkbareCreditnota) {
    const { data: ps } = await supabase
      .from("producten")
      .select("id, naam, code, eenheid, verkoopprijs, aankoopprijs, btw_tarief")
      .eq("bedrijf_id", d.bedrijf_id)
      .eq("actief", true)
      .order("naam");
    producten = (ps ?? []) as ProductKeuze[];
  }

  // Geboekt in het dagboek verkopen, en betalingen via de bank.
  let boekingen: BoekingMetLijnen[] = [];
  if ((d.soort === "factuur" || d.soort === "creditnota") && d.status === "definitief") {
    const { data: bk } = await supabase.from("boekingen").select(BOEKING_SELECT).eq("document_id", d.id).order("datum").order("aangemaakt_op");
    boekingen = (bk ?? []) as unknown as BoekingMetLijnen[];
  }
  const openstaand = cent(Number(d.totaal_incl) - Number(d.betaald) - gecrediteerd);

  const mededeling =
    d.soort === "factuur" && d.volgnummer && d.bedrijven
      ? gestructureerdeMededeling(d.bedrijven.volgorde, d.jaar, d.volgnummer)
      : null;

  return (
    <>
      <div className="schermkop">
        <div>
          <h1>
            {DOCUMENT_LABEL[d.soort]} {d.nummer}
          </h1>
          <p>
            {d.bedrijven?.naam ?? ctx.bedrijf?.naam} · {d.relaties?.naam}
            {" · "}
            <span className={DOCUMENT_STATUS_KLASSE[d.status]}>{DOCUMENT_STATUS_LABEL[d.status]}</span>
          </p>
        </div>
        <div className="schermkop__acties">
          {bron && (
            <Link href={`/documenten/${bron.id}`} className="knop">
              ← {DOCUMENT_LABEL[bron.soort]} {bron.nummer}
            </Link>
          )}
          {d.bestellingen && (
            <Link href={`/bestellingen/${d.bestellingen.id}`} className="knop">
              ← Bestelling {bestellingNummer(d.bestellingen)}
            </Link>
          )}
          <Link href="/documenten" className="knop">
            Alle documenten
          </Link>
        </div>
      </div>

      {d.status === "concept" && SOORT_UITLEG[d.soort] && (
        <p className="melding-info" style={{ marginBottom: 16 }}>{SOORT_UITLEG[d.soort]}</p>
      )}
      {tekort.length > 0 && (
        <div className="foutmelding" style={{ marginBottom: 16 }}>
          Te weinig voorraad om deze leverbon definitief te maken:
          <ul style={{ margin: "6px 0 0", paddingLeft: 20 }}>
            {tekort.map(([pid, n]) => {
              const l = lijnen.find((x) => x.product_id === pid);
              const v = voorraad.get(pid)!;
              return (
                <li key={pid}>
                  {l?.omschrijving}: nodig {aantal(n)}, in voorraad {aantal(v.voorraad)} {v.eenheid}.{" "}
                  <Link href={`/voorraad/${pid}`}>Voorraad bekijken</Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="tweekolom tweekolom--breed">
        <div>
          {bewerkbareCreditnota ? (
            <CreditnotaFormulier document={d} lijnen={lijnen} producten={producten} factuurNummer={bron?.nummer ?? null} maxCredit={maxCredit} />
          ) : (
            <div className="kaart">
              <div className="formulier__kolommen formulier__kolommen--3" style={{ marginBottom: 14 }}>
                <div>
                  <div className="label">Datum</div>
                  <div>{datum(d.datum)}</div>
                </div>
                {d.vervaldatum && VERVAL_LABEL[d.soort] && (
                  <div>
                    <div className="label">{VERVAL_LABEL[d.soort]}</div>
                    <div>{datum(d.vervaldatum)}</div>
                  </div>
                )}
                {mededeling && (
                  <div>
                    <div className="label">Gestructureerde mededeling</div>
                    <div style={{ fontVariantNumeric: "tabular-nums" }}>{mededeling}</div>
                  </div>
                )}
                {bron && (
                  <div>
                    <div className="label">Betreft</div>
                    <div>
                      <Link href={`/documenten/${bron.id}`}>
                        {DOCUMENT_LABEL[bron.soort]} {bron.nummer}
                      </Link>
                    </div>
                  </div>
                )}
                {d.soort === "creditnota" && (
                  <div>
                    <div className="label">Retour in voorraad</div>
                    <div>{d.voorraad_terug ? "Ja" : "Nee"}</div>
                  </div>
                )}
                {d.definitief_op && (
                  <div>
                    <div className="label">Definitief sinds</div>
                    <div>{new Date(d.definitief_op).toLocaleString("nl-BE", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Brussels" })}</div>
                  </div>
                )}
              </div>

              <table className="tabel">
                <thead>
                  <tr>
                    <th>Omschrijving</th>
                    <th className="getal">Aantal</th>
                    {prijzen && (
                      <>
                        <th className="getal">Prijs</th>
                        <th className="getal">Korting</th>
                        <th className="getal">Btw</th>
                        <th className="getal">Totaal excl.</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {lijnen.map((l, i) => (
                    <tr key={l.id ?? i}>
                      <td>{l.omschrijving}</td>
                      <td className="getal">{aantal(l.aantal)}</td>
                      {prijzen && (
                        <>
                          <td className="getal">{euro(l.eenheidsprijs)}</td>
                          <td className="getal">{l.korting_pct ? `${aantal(l.korting_pct)} %` : ""}</td>
                          <td className="getal">{l.btw_tarief} %</td>
                          <td className="getal">{euro(lijnExcl(l))}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>

              {prijzen && (
                <div className="lijnen__onder">
                  <span />
                  <table className="totalen">
                    <tbody>
                      <tr>
                        <td>Totaal excl. btw</td>
                        <td className="getal">{euro(som.excl)}</td>
                      </tr>
                      {som.perTarief.map((t) => (
                        <tr key={t.tarief}>
                          <td>Btw {t.tarief} % op {euro(t.grondslag)}</td>
                          <td className="getal">{euro(t.btw)}</td>
                        </tr>
                      ))}
                      <tr className="totalen__incl">
                        <td>Totaal incl. btw</td>
                        <td className="getal">{euro(som.incl)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}

              {d.opmerking && (
                <p style={{ marginTop: 12 }}>
                  <span className="label">Opmerking</span>
                  <br />
                  {d.opmerking}
                </p>
              )}
            </div>
          )}

          {mutaties.length > 0 && (
            <div className="kaart">
              <div className="kaart__kop">
                <h2>Voorraadbewegingen</h2>
              </div>
              <table className="tabel">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Omschrijving</th>
                    <th className="getal">Aantal</th>
                  </tr>
                </thead>
                <tbody>
                  {mutaties.map((m) => (
                    <tr key={m.id}>
                      <td>
                        {m.producten && <Link href={`/voorraad/${m.producten.id}`}>{m.producten.naam}</Link>}
                      </td>
                      <td>{m.opmerking}</td>
                      <td className="getal" style={{ color: Number(m.aantal) < 0 ? "var(--fout)" : "var(--goed)" }}>
                        {Number(m.aantal) > 0 ? "+" : ""}
                        {aantal(m.aantal)} {m.producten?.eenheid}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {d.soort === "factuur" && d.status === "definitief" && (
            <div className="kaart">
              <div className="kaart__kop">
                <h2>Creditnota&apos;s</h2>
                <span className="hulptekst">
                  gecrediteerd {euro(gecrediteerd)} · nog mogelijk {euro(nogTeCrediteren)}
                </span>
              </div>
              {creditnotas.length === 0 ? (
                <p className="hulptekst">Nog geen creditnota&apos;s bij deze factuur.</p>
              ) : (
                <table className="tabel">
                  <tbody>
                    {creditnotas.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <Link href={`/documenten/${c.id}`} className="rij">
                            {c.nummer}
                          </Link>
                          <div className="hulptekst">{datum(c.datum)}</div>
                        </td>
                        <td>
                          <span className={DOCUMENT_STATUS_KLASSE[c.status]}>{DOCUMENT_STATUS_LABEL[c.status]}</span>
                        </td>
                        <td className="getal">{euro(c.totaal_incl)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {d.soort === "factuur" && d.status === "definitief" && (
            <div className="kaart">
              <div className="kaart__kop">
                <h2>Betaling</h2>
                {openstaand > 0 ? (
                  <Link href={`/bank?document=${d.id}`} className="knop knop--primair knop--klein">
                    Betaling boeken
                  </Link>
                ) : (
                  <span className="badge badge--goed">{openstaand === 0 ? "volledig betaald" : `${euro(-openstaand)} te veel betaald`}</span>
                )}
              </div>
              <table className="totalen">
                <tbody>
                  <tr>
                    <td>Factuur</td>
                    <td className="getal">{euro(d.totaal_incl)}</td>
                  </tr>
                  {gecrediteerd > 0 && (
                    <tr>
                      <td>Gecrediteerd</td>
                      <td className="getal">− {euro(gecrediteerd)}</td>
                    </tr>
                  )}
                  <tr>
                    <td>Ontvangen</td>
                    <td className="getal">− {euro(d.betaald)}</td>
                  </tr>
                  <tr className="totalen__incl">
                    <td>Nog te ontvangen</td>
                    <td className="getal">{euro(Math.max(openstaand, 0))}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {boekingen.length > 0 && (
            <div className="kaart">
              <div className="kaart__kop">
                <h2>Boekingen</h2>
              </div>
              {boekingen.map((b) => (
                <BoekingWeergave key={b.id} boeking={b} />
              ))}
            </div>
          )}

          <div className="kaart pdfkader">
            <iframe src={`/documenten/${d.id}/pdf#toolbar=0`} title="Voorbeeld van de pdf" key={d.bijgewerkt_op} />
          </div>
        </div>

        <DocumentActies document={d} magCrediteren={d.soort === "factuur" && d.status === "definitief" && nogTeCrediteren > 0} />
      </div>
    </>
  );
}
