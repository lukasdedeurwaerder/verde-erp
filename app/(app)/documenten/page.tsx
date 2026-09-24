import Link from "next/link";
import { huidigeContext } from "@/lib/sessie";
import { supabaseServer } from "@/lib/supabase/server";
import { datum, DOCUMENT_LABEL, DOCUMENT_STATUS_KLASSE, DOCUMENT_STATUS_LABEL } from "@/lib/bestelling";
import { euro } from "@/lib/geld";
import { DOCUMENT_SOORTEN, type Document, type DocumentSoort } from "@/lib/types";

export const metadata = { title: "Documenten" };

type Rij = Document & { relaties: { naam: string } | null };

// Welke soorten er nu al gemaakt kunnen worden. Elke fase voegt er toe.
const BESCHIKBAAR: DocumentSoort[] = ["offerte", "bestelbon"];

export default async function DocumentenPagina({
  searchParams,
}: {
  searchParams: Promise<{ soort?: string; q?: string }>;
}) {
  const { soort, q } = await searchParams;
  const zoek = (q ?? "").trim();
  const ctx = await huidigeContext();
  const supabase = await supabaseServer();

  let query = supabase
    .from("documenten")
    .select("*, relaties(naam)")
    .order("datum", { ascending: false })
    .order("aangemaakt_op", { ascending: false });
  if (ctx.bedrijf) query = query.eq("bedrijf_id", ctx.bedrijf.id);
  if (soort && (DOCUMENT_SOORTEN as readonly string[]).includes(soort)) query = query.eq("soort", soort);
  if (zoek) query = query.ilike("nummer", `%${zoek}%`);

  const { data, error } = await query;
  const rijen = (data ?? []) as unknown as Rij[];
  const bedrijfVan = (id: string) => ctx.bedrijven.find((b) => b.id === id);

  return (
    <>
      <div className="schermkop">
        <div>
          <h1>Documenten</h1>
          <p>Offertes en bestelbonnen. Een document maak je vanuit een bestelling.</p>
        </div>
      </div>

      <form className="zoekbalk" method="get">
        <span className="schakel">
          <Link href="/documenten" className={`knop knop--klein${!soort ? " knop--primair" : ""}`}>
            Alles
          </Link>
          {BESCHIKBAAR.map((s) => (
            <Link key={s} href={`/documenten?soort=${s}`} className={`knop knop--klein${soort === s ? " knop--primair" : ""}`}>
              {DOCUMENT_LABEL[s]}s
            </Link>
          ))}
        </span>
        {soort && <input type="hidden" name="soort" value={soort} />}
        <input type="search" name="q" className="veld" placeholder="Zoek op nummer" defaultValue={zoek} />
        <button type="submit" className="knop">
          Zoeken
        </button>
      </form>

      {error && <p className="foutmelding">{error.message}</p>}

      <div className="tabelkader">
        <table className="tabel">
          <thead>
            <tr>
              <th>Nummer</th>
              <th>Soort</th>
              {!ctx.bedrijf && <th>Bedrijf</th>}
              <th>Relatie</th>
              <th>Datum</th>
              <th>Status</th>
              <th className="getal">Excl. btw</th>
              <th className="getal">Incl. btw</th>
            </tr>
          </thead>
          <tbody>
            {rijen.length === 0 && (
              <tr>
                <td colSpan={8} className="leeg">
                  Nog geen documenten.
                </td>
              </tr>
            )}
            {rijen.map((d) => {
              const b = bedrijfVan(d.bedrijf_id);
              return (
                <tr key={d.id} className="klikbaar">
                  <td>
                    <Link href={`/documenten/${d.id}`} className="rij">
                      {d.nummer}
                    </Link>
                  </td>
                  <td>{DOCUMENT_LABEL[d.soort]}</td>
                  {!ctx.bedrijf && (
                    <td>
                      {b && (
                        <span className="badge badge--bedrijf" style={{ background: b.kleur }}>
                          {b.naam}
                        </span>
                      )}
                    </td>
                  )}
                  <td>{d.relaties?.naam ?? ""}</td>
                  <td>{datum(d.datum)}</td>
                  <td>
                    <span className={DOCUMENT_STATUS_KLASSE[d.status]}>{DOCUMENT_STATUS_LABEL[d.status]}</span>
                  </td>
                  <td className="getal">{euro(d.totaal_excl)}</td>
                  <td className="getal">{euro(d.totaal_incl)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
