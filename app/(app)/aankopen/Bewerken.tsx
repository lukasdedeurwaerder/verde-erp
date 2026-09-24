import Link from "next/link";
import { notFound } from "next/navigation";
import { huidigeContext } from "@/lib/sessie";
import { supabaseServer } from "@/lib/supabase/server";
import { bestellingNummer, datum, DOCUMENT_STATUS_KLASSE, DOCUMENT_STATUS_LABEL, vandaag } from "@/lib/bestelling";
import { aankoopRekeningen, documentenMetSaldo, rekeningen } from "@/lib/boekhouding";
import { aantal, euro } from "@/lib/geld";
import { lijnExcl, totalen } from "@/lib/lijnen";
import type { Document, Lijn } from "@/lib/types";
import type { ProductKeuze } from "../bestellingen/LijnenEditor";
import { BOEKING_SELECT, BoekingWeergave, type BoekingMetLijnen } from "../dagboeken/BoekingWeergave";
import { AankoopFormulier } from "./Formulier";
import { CreditnotaKnop } from "./CreditnotaKnop";

type Rij = Document & {
  documentlijnen: Lijn[];
  relaties: { naam: string } | null;
  bestellingen: { id: string; jaar: number; nummer: number } | null;
};

export async function AankoopBewerken({ id }: { id: string | null }) {
  const ctx = await huidigeContext();
  const supabase = await supabaseServer();

  let d: Rij | null = null;
  if (id) {
    const { data } = await supabase
      .from("documenten")
      .select("*, documentlijnen(*), relaties(naam), bestellingen(id, jaar, nummer)")
      .eq("id", id)
      .in("soort", ["aankoopfactuur", "aankoopcreditnota"])
      .maybeSingle();
    if (!data) notFound();
    d = data as unknown as Rij;
  }
  const bedrijfId = d?.bedrijf_id ?? ctx.bedrijf?.id ?? null;
  if (!bedrijfId) {
    return (
      <>
        <div className="schermkop">
          <h1>Aankoopfactuur registreren</h1>
        </div>
        <p className="melding-info">Kies eerst in de bovenbalk voor welk bedrijf je deze aankoopfactuur registreert.</p>
      </>
    );
  }
  const lijnen = [...(d?.documentlijnen ?? [])].sort((a, b) => a.volgorde - b.volgorde);
  const bedrijf = ctx.bedrijven.find((b) => b.id === bedrijfId);
  const credit = d?.soort === "aankoopcreditnota";
  const soortNaam = credit ? "Creditnota van leverancier" : "Aankoopfactuur";

  // Bij een creditnota: de aankoopfactuur waar ze bij hoort.
  let bron: { id: string; nummer: string | null; extern_nummer: string | null } | null = null;
  if (d?.bron_document_id) {
    const { data: b } = await supabase.from("documenten").select("id, nummer, extern_nummer").eq("id", d.bron_document_id).maybeSingle();
    bron = b ?? null;
  }

  const kop = (
    <div className="schermkop">
      <div>
        <h1>{d ? `${soortNaam} ${d.nummer}` : "Aankoopfactuur registreren"}</h1>
        <p>
          {bedrijf?.naam}
          {d?.relaties && ` · ${d.relaties.naam}`}
          {d && (
            <>
              {" · "}
              <span className={DOCUMENT_STATUS_KLASSE[d.status]}>{DOCUMENT_STATUS_LABEL[d.status]}</span>
            </>
          )}
        </p>
      </div>
      <div className="schermkop__acties">
        {bron && (
          <Link href={`/aankopen/${bron.id}`} className="knop">
            ← Aankoopfactuur {bron.nummer}
          </Link>
        )}
        {d?.bestellingen && (
          <Link href={`/bestellingen/${d.bestellingen.id}`} className="knop">
            ← Bestelling {bestellingNummer(d.bestellingen)}
          </Link>
        )}
        <Link href="/aankopen" className="knop">
          Alle aankoopfacturen
        </Link>
      </div>
    </div>
  );

  // Concept of nieuw: het formulier.
  if (!d || d.status === "concept") {
    const [{ data: lev }, { data: prod }, reks] = await Promise.all([
      supabase.from("relaties").select("id, naam").eq("bedrijf_id", bedrijfId).eq("actief", true).in("soort", ["leverancier", "beide"]).order("naam"),
      supabase.from("producten").select("id, naam, code, eenheid, verkoopprijs, aankoopprijs, btw_tarief").eq("bedrijf_id", bedrijfId).eq("actief", true).order("naam"),
      rekeningen(supabase),
    ]);
    return (
      <>
        {kop}
        {d && (
          <p className="melding-info" style={{ marginBottom: 16 }}>
            {credit
              ? `Concept. Deze creditnota vermindert aankoopfactuur ${bron?.nummer ?? ""}${bron?.extern_nummer ? ` (${bron.extern_nummer})` : ""}. Houd de lijnen over die de leverancier crediteert en maak ze dan definitief.`
              : "Concept. Controleer de lijnen met de factuur van de leverancier en maak ze dan definitief: ze komt in het dagboek aankopen."}
          </p>
        )}
        <AankoopFormulier
          document={d}
          lijnen={lijnen}
          leveranciers={lev ?? []}
          producten={(prod ?? []) as ProductKeuze[]}
          rekeningen={aankoopRekeningen(reks)}
          vandaag={vandaag()}
        />
      </>
    );
  }

  // Definitief: bekijken, met de boeking en de betalingen.
  const som = totalen(lijnen);
  const reks = await rekeningen(supabase);
  const rekNaam = new Map(reks.map((r) => [r.id, `${r.nummer} ${r.naam}`]));
  const [{ data: boekingen }, saldi, { data: cns }] = await Promise.all([
    supabase.from("boekingen").select(BOEKING_SELECT).eq("document_id", d.id).order("datum").order("aangemaakt_op"),
    documentenMetSaldo(supabase, "aankoopfactuur", d.bedrijf_id),
    supabase.from("documenten").select("id, nummer, extern_nummer, status, totaal_incl").eq("bron_document_id", d.id).order("aangemaakt_op"),
  ]);
  const saldo = saldi.find((s) => s.id === d!.id);
  const creditnotas = (cns ?? []) as { id: string; nummer: string; extern_nummer: string | null; status: string; totaal_incl: number }[];
  const bk = (boekingen ?? []) as unknown as BoekingMetLijnen[];

  return (
    <>
      {kop}
      <div className="tweekolom tweekolom--breed">
        <div>
          <div className="kaart">
            <div className="formulier__kolommen formulier__kolommen--3" style={{ marginBottom: 14 }}>
              {bron && (
                <div>
                  <div className="label">Betreft aankoopfactuur</div>
                  <div>
                    <Link href={`/aankopen/${bron.id}`}>{bron.nummer}</Link>
                  </div>
                </div>
              )}
              <div>
                <div className="label">Nummer leverancier</div>
                <div>{d.extern_nummer}</div>
              </div>
              <div>
                <div className="label">Factuurdatum</div>
                <div>{datum(d.datum)}</div>
              </div>
              <div>
                <div className="label">Vervaldatum</div>
                <div>{datum(d.vervaldatum) || "—"}</div>
              </div>
            </div>
            <table className="tabel">
              <thead>
                <tr>
                  <th>Omschrijving</th>
                  <th>Rekening</th>
                  <th className="getal">Aantal</th>
                  <th className="getal">Prijs</th>
                  <th className="getal">Btw</th>
                  <th className="getal">Totaal excl.</th>
                </tr>
              </thead>
              <tbody>
                {lijnen.map((l, i) => (
                  <tr key={l.id ?? i}>
                    <td>{l.omschrijving}</td>
                    <td className="hulptekst">{l.rekening_id ? rekNaam.get(l.rekening_id) : "604 (standaard)"}</td>
                    <td className="getal">{aantal(l.aantal)}</td>
                    <td className="getal">{euro(l.eenheidsprijs)}</td>
                    <td className="getal">{l.btw_tarief} %</td>
                    <td className="getal">{euro(lijnExcl(l))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="lijnen__onder">
              <span />
              <table className="totalen">
                <tbody>
                  <tr>
                    <td>Totaal excl. btw</td>
                    <td className="getal">{euro(som.excl)}</td>
                  </tr>
                  <tr>
                    <td>{credit ? "Btw" : "Aftrekbare btw"}</td>
                    <td className="getal">{euro(som.btw)}</td>
                  </tr>
                  <tr className="totalen__incl">
                    <td>Totaal incl. btw</td>
                    <td className="getal">{euro(som.incl)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="kaart">
            <div className="kaart__kop">
              <h2>Boekingen</h2>
            </div>
            {bk.map((b) => (
              <BoekingWeergave key={b.id} boeking={b} />
            ))}
          </div>
        </div>

        <div className="kaart">
          <div className="kaart__kop">
            <h2>{credit ? "Creditnota" : "Betaling"}</h2>
          </div>
          {credit ? (
            <p className="hulptekst">
              Deze creditnota vermindert wat er op aankoopfactuur {bron?.nummer} te betalen is. Was die al betaald, dan boek je
              de terugbetaling van de leverancier bij Bank, op de aankoopfactuur.
            </p>
          ) : saldo && saldo.openstaand > 0 ? (
            <>
              <p>
                Nog te betalen: <strong>{euro(saldo.openstaand)}</strong>
              </p>
              <p className="hulptekst" style={{ margin: "8px 0 12px" }}>
                Staat de betaling op het rekeninguittreksel? Boek ze bij Bank.
              </p>
              <Link href={`/bank?document=${d.id}`} className="knop knop--primair" style={{ width: "100%" }}>
                Betaling boeken
              </Link>
            </>
          ) : saldo && saldo.openstaand < 0 ? (
            <>
              <p>
                Te veel betaald: de leverancier moet <strong>{euro(-saldo.openstaand)}</strong> terugbetalen.
              </p>
              <Link href={`/bank?document=${d.id}`} className="knop knop--primair" style={{ width: "100%", marginTop: 12 }}>
                Terugbetaling boeken
              </Link>
            </>
          ) : (
            <p>
              <span className="badge badge--goed">Volledig betaald</span>
            </p>
          )}
          {!credit && (
            <>
              {creditnotas.length > 0 && (
                <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
                  <span className="label">Creditnota&apos;s van de leverancier</span>
                  {creditnotas.map((c) => (
                    <div key={c.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 14 }}>
                      <span>
                        <Link href={`/aankopen/${c.id}`} style={{ whiteSpace: "nowrap" }}>
                          {c.nummer}
                        </Link>
                        <br />
                        <span className="hulptekst">
                          {c.extern_nummer} · {c.status === "definitief" ? "definitief" : "concept"}
                        </span>
                      </span>
                      <span style={{ whiteSpace: "nowrap" }}>− {euro(c.totaal_incl)}</span>
                    </div>
                  ))}
                </div>
              )}
              <CreditnotaKnop factuurId={d.id} />
            </>
          )}
          {d.pdf_pad && (
            <a href={`/documenten/${d.id}/pdf`} target="_blank" rel="noopener" className="knop" style={{ width: "100%", marginTop: 12 }}>
              Pdf van de leverancier
            </a>
          )}
        </div>
      </div>
    </>
  );
}
