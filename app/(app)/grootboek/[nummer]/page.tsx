import Link from "next/link";
import { notFound } from "next/navigation";
import { huidigeContext } from "@/lib/sessie";
import { supabaseServer } from "@/lib/supabase/server";
import { boekingNummer, datum, documentPad } from "@/lib/bestelling";
import { euro } from "@/lib/geld";
import { cent } from "@/lib/lijnen";
import type { Dagboek, DocumentSoort, Rekening } from "@/lib/types";

type Lijn = {
  id: string;
  omschrijving: string | null;
  debet: number;
  credit: number;
  boekingen: {
    id: string;
    bedrijf_id: string;
    dagboek: Dagboek;
    jaar: number;
    nummer: number;
    datum: string;
    omschrijving: string;
    aangemaakt_op: string;
    documenten: { id: string; soort: DocumentSoort; nummer: string | null } | null;
  };
};

// Het grootboek van één rekening: elke boeking die ze raakt, met het
// lopende saldo. Zo zie je waar een bedrag op de balans vandaan komt.
export default async function GrootboekPagina({ params }: { params: Promise<{ nummer: string }> }) {
  const { nummer } = await params;
  const ctx = await huidigeContext();
  const supabase = await supabaseServer();

  const { data: rek } = await supabase.from("rekeningen").select("*").eq("nummer", nummer).maybeSingle();
  if (!rek) notFound();
  const r = rek as Rekening;

  let q = supabase
    .from("boekingslijnen")
    .select("id, omschrijving, debet, credit, boekingen!inner(id, bedrijf_id, dagboek, jaar, nummer, datum, omschrijving, aangemaakt_op, documenten(id, soort, nummer))")
    .eq("rekening_id", r.id);
  if (ctx.bedrijf) q = q.eq("boekingen.bedrijf_id", ctx.bedrijf.id);
  const { data, error } = await q;

  const lijnen = ((data ?? []) as unknown as Lijn[]).sort(
    (a, b) => a.boekingen.datum.localeCompare(b.boekingen.datum) || a.boekingen.aangemaakt_op.localeCompare(b.boekingen.aangemaakt_op),
  );
  const debetKant = r.soort === "actief" || r.soort === "kost";
  let saldo = 0;
  const metSaldo = lijnen.map((l) => {
    saldo = cent(saldo + (debetKant ? 1 : -1) * (Number(l.debet) - Number(l.credit)));
    return { ...l, saldo };
  });
  const totD = cent(lijnen.reduce((t, l) => t + Number(l.debet), 0));
  const totC = cent(lijnen.reduce((t, l) => t + Number(l.credit), 0));
  const bedrijfVan = (id: string) => ctx.bedrijven.find((b) => b.id === id);

  const SOORT: Record<Rekening["soort"], string> = {
    actief: "Balans · activa (saldo staat normaal in debet)",
    passief: "Balans · passiva (saldo staat normaal in credit)",
    kost: "Resultatenrekening · kost (debet)",
    opbrengst: "Resultatenrekening · opbrengst (credit)",
  };

  return (
    <>
      <div className="schermkop">
        <div>
          <h1>
            {r.nummer} {r.naam}
          </h1>
          <p>
            {SOORT[r.soort]} · {ctx.bedrijf ? ctx.bedrijf.naam : "alle dochters"}
          </p>
        </div>
        <div className="schermkop__acties">
          <Link href="/rapporten" className="knop">
            ← Balans en resultaat
          </Link>
        </div>
      </div>

      {error && <p className="foutmelding">{error.message}</p>}

      <div className="tabelkader">
        <table className="tabel">
          <thead>
            <tr>
              <th>Datum</th>
              <th>Boeking</th>
              <th>Omschrijving</th>
              {!ctx.bedrijf && <th>Bedrijf</th>}
              <th className="getal">Debet</th>
              <th className="getal">Credit</th>
              <th className="getal">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {metSaldo.length === 0 && (
              <tr>
                <td colSpan={7} className="leeg">
                  Nog niets geboekt op deze rekening.
                </td>
              </tr>
            )}
            {metSaldo.map((l) => {
              const b = l.boekingen;
              const bd = bedrijfVan(b.bedrijf_id);
              return (
                <tr key={l.id}>
                  <td>{datum(b.datum)}</td>
                  <td>
                    <Link href={`/dagboeken?dagboek=${b.dagboek}`}>{boekingNummer(b)}</Link>
                  </td>
                  <td>
                    {b.omschrijving}
                    {b.documenten && (
                      <>
                        {" · "}
                        <Link href={documentPad(b.documenten)}>{b.documenten.nummer}</Link>
                      </>
                    )}
                    {l.omschrijving && <div className="hulptekst">{l.omschrijving}</div>}
                  </td>
                  {!ctx.bedrijf && (
                    <td>
                      {bd && (
                        <span className="badge badge--bedrijf" style={{ background: bd.kleur }}>
                          {bd.naam}
                        </span>
                      )}
                    </td>
                  )}
                  <td className="getal">{Number(l.debet) ? euro(l.debet) : ""}</td>
                  <td className="getal">{Number(l.credit) ? euro(l.credit) : ""}</td>
                  <td className="getal">{euro(l.saldo)}</td>
                </tr>
              );
            })}
            {metSaldo.length > 0 && (
              <tr style={{ fontWeight: 700 }}>
                <td colSpan={ctx.bedrijf ? 3 : 4}>Totaal</td>
                <td className="getal">{euro(totD)}</td>
                <td className="getal">{euro(totC)}</td>
                <td className="getal">{euro(saldo)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
