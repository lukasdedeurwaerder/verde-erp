import Link from "next/link";
import { notFound } from "next/navigation";
import { huidigeContext } from "@/lib/sessie";
import { supabaseServer } from "@/lib/supabase/server";
import { bestellingNummer, datum, DOCUMENT_LABEL, DOCUMENT_STATUS_KLASSE, DOCUMENT_STATUS_LABEL } from "@/lib/bestelling";
import { euro } from "@/lib/geld";
import { lijnExcl, totalen } from "@/lib/lijnen";
import type { Document, Lijn } from "@/lib/types";
import { DocumentActies } from "./Acties";

type Rij = Document & {
  documentlijnen: Lijn[];
  relaties: { naam: string; gemeente: string | null } | null;
  bestellingen: { id: string; jaar: number; nummer: number; soort: string } | null;
};

export default async function DocumentPagina({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await huidigeContext();
  const supabase = await supabaseServer();

  const { data } = await supabase
    .from("documenten")
    .select("*, documentlijnen(*), relaties(naam, gemeente), bestellingen(id, jaar, nummer, soort)")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const d = data as unknown as Rij;
  const lijnen = [...(d.documentlijnen ?? [])].sort((a, b) => a.volgorde - b.volgorde);
  const som = totalen(lijnen);
  const bedrijf = ctx.bedrijven.find((b) => b.id === d.bedrijf_id);
  const vervalLabel = d.soort === "offerte" ? "Geldig tot" : d.soort === "bestelbon" ? "Gewenste levering" : "Vervaldatum";

  return (
    <>
      <div className="schermkop">
        <div>
          <h1>
            {DOCUMENT_LABEL[d.soort]} {d.nummer}
          </h1>
          <p>
            {bedrijf?.naam} · {d.relaties?.naam}
            {" · "}
            <span className={DOCUMENT_STATUS_KLASSE[d.status]}>{DOCUMENT_STATUS_LABEL[d.status]}</span>
          </p>
        </div>
        <div className="schermkop__acties">
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

      <div className="tweekolom tweekolom--breed">
        <div>
          <div className="kaart">
            <div className="formulier__kolommen formulier__kolommen--3" style={{ marginBottom: 14 }}>
              <div>
                <div className="label">Datum</div>
                <div>{datum(d.datum)}</div>
              </div>
              {d.vervaldatum && (
                <div>
                  <div className="label">{vervalLabel}</div>
                  <div>{datum(d.vervaldatum)}</div>
                </div>
              )}
              {d.definitief_op && (
                <div>
                  <div className="label">Definitief sinds</div>
                  <div>{new Date(d.definitief_op).toLocaleString("nl-BE", { dateStyle: "short", timeStyle: "short" })}</div>
                </div>
              )}
            </div>

            <table className="tabel">
              <thead>
                <tr>
                  <th>Omschrijving</th>
                  <th className="getal">Aantal</th>
                  <th className="getal">Prijs</th>
                  <th className="getal">Korting</th>
                  <th className="getal">Btw</th>
                  <th className="getal">Totaal excl.</th>
                </tr>
              </thead>
              <tbody>
                {lijnen.map((l, i) => (
                  <tr key={l.id ?? i}>
                    <td>{l.omschrijving}</td>
                    <td className="getal">{String(l.aantal).replace(".", ",")}</td>
                    <td className="getal">{euro(l.eenheidsprijs)}</td>
                    <td className="getal">{l.korting_pct ? `${l.korting_pct} %` : ""}</td>
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

            {d.opmerking && (
              <p style={{ marginTop: 12 }}>
                <span className="label">Opmerking</span>
                <br />
                {d.opmerking}
              </p>
            )}
          </div>

          <div className="kaart pdfkader">
            <iframe src={`/documenten/${d.id}/pdf#toolbar=0`} title="Voorbeeld van de pdf" />
          </div>
        </div>

        <DocumentActies document={d} />
      </div>
    </>
  );
}
