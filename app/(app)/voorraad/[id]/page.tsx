import Link from "next/link";
import { notFound } from "next/navigation";
import { huidigeContext } from "@/lib/sessie";
import { supabaseServer } from "@/lib/supabase/server";
import { datum, DOCUMENT_LABEL, vandaag } from "@/lib/bestelling";
import { aantal, euro } from "@/lib/geld";
import { cent } from "@/lib/lijnen";
import type { DocumentSoort } from "@/lib/types";
import { VoorraadFormulier } from "./Formulier";

const SOORT_LABEL: Record<string, string> = {
  beginvoorraad: "Beginvoorraad",
  levering: "Levering",
  ontvangst: "Ontvangst",
  correctie: "Correctie",
  retour: "Retour",
};

type Mutatie = {
  id: string;
  datum: string;
  aantal: number;
  soort: string;
  opmerking: string | null;
  aangemaakt_op: string;
  documenten: { id: string; soort: DocumentSoort; nummer: string | null } | null;
  profielen: { naam: string } | null;
};

// De voorraadkaart van één product: elke beweging met het lopende saldo,
// zoals een magazijnfiche op papier.
export default async function VoorraadProduct({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await huidigeContext();
  const supabase = await supabaseServer();

  const { data: p } = await supabase
    .from("producten")
    .select("id, bedrijf_id, naam, code, eenheid, voorraad, min_voorraad, aankoopprijs, voorraad_bijhouden")
    .eq("id", id)
    .maybeSingle();
  if (!p) notFound();

  const { data: m } = await supabase
    .from("voorraadmutaties")
    .select("id, datum, aantal, soort, opmerking, aangemaakt_op, documenten(id, soort, nummer), profielen:aangemaakt_door(naam)")
    .eq("product_id", id)
    .order("datum")
    .order("aangemaakt_op");
  const mutaties = (m ?? []) as unknown as Mutatie[];

  let saldo = 0;
  const metSaldo = mutaties.map((x) => {
    saldo = cent(saldo + Number(x.aantal));
    return { ...x, saldo };
  });
  const bedrijf = ctx.bedrijven.find((b) => b.id === p.bedrijf_id);

  return (
    <>
      <div className="schermkop">
        <div>
          <h1>{p.naam}</h1>
          <p>
            {bedrijf?.naam}
            {p.code && ` · ${p.code}`}
          </p>
        </div>
        <div className="schermkop__acties">
          <Link href={`/producten/${p.id}`} className="knop">
            Productfiche
          </Link>
          <Link href="/voorraad" className="knop">
            ← Voorraad
          </Link>
        </div>
      </div>

      {!p.voorraad_bijhouden ? (
        <p className="melding-info">Voor dit product wordt geen voorraad bijgehouden (bv. een dienst). Pas dat aan op de productfiche.</p>
      ) : (
        <>
          <div className="tegels">
            <div className="tegel">
              <div className="tegel__label">Voorraad</div>
              <div className="tegel__getal" style={{ color: Number(p.voorraad) <= Number(p.min_voorraad) ? "var(--waarschuwing)" : undefined }}>
                {aantal(p.voorraad)} {p.eenheid}
              </div>
              <div className="tegel__sub">minimum {aantal(p.min_voorraad)}</div>
            </div>
            <div className="tegel">
              <div className="tegel__label">Waarde tegen aankoopprijs</div>
              <div className="tegel__getal">{euro(cent(Math.max(0, Number(p.voorraad)) * Number(p.aankoopprijs)))}</div>
              <div className="tegel__sub">{euro(p.aankoopprijs)} per {p.eenheid}</div>
            </div>
          </div>

          <div className="tweekolom">
            <div className="tabelkader">
              <table className="tabel">
                <thead>
                  <tr>
                    <th>Datum</th>
                    <th>Soort</th>
                    <th>Document of opmerking</th>
                    <th className="getal">In / uit</th>
                    <th className="getal">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {metSaldo.length === 0 && (
                    <tr>
                      <td colSpan={5} className="leeg">
                        Nog geen bewegingen. Registreer rechts een beginvoorraad.
                      </td>
                    </tr>
                  )}
                  {[...metSaldo].reverse().map((x) => (
                    <tr key={x.id}>
                      <td>{datum(x.datum)}</td>
                      <td>{SOORT_LABEL[x.soort] ?? x.soort}</td>
                      <td>
                        {x.documenten ? (
                          <Link href={`/documenten/${x.documenten.id}`}>
                            {DOCUMENT_LABEL[x.documenten.soort]} {x.documenten.nummer}
                          </Link>
                        ) : null}
                        {x.opmerking && (!x.documenten || x.soort === "correctie") && (
                          <div className={x.documenten ? "hulptekst" : undefined}>{x.opmerking}</div>
                        )}
                        {x.profielen && <div className="hulptekst">door {x.profielen.naam}</div>}
                      </td>
                      <td className="getal" style={{ color: Number(x.aantal) < 0 ? "var(--fout)" : "var(--goed)" }}>
                        {Number(x.aantal) > 0 ? "+" : ""}
                        {aantal(x.aantal)}
                      </td>
                      <td className="getal">{aantal(x.saldo)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="kaart">
              <div className="kaart__kop">
                <h2>Voorraad aanpassen</h2>
              </div>
              <VoorraadFormulier productId={p.id} eenheid={p.eenheid} vandaag={vandaag()} />
            </div>
          </div>
        </>
      )}
    </>
  );
}
