import Link from "next/link";
import { huidigeContext } from "@/lib/sessie";
import { supabaseServer } from "@/lib/supabase/server";
import { datum, DOCUMENT_STATUS_KLASSE, DOCUMENT_STATUS_LABEL, vandaag } from "@/lib/bestelling";
import { documentenMetSaldo } from "@/lib/boekhouding";
import { euro } from "@/lib/geld";
import type { Document } from "@/lib/types";

export const metadata = { title: "Aankoopfacturen" };

type Rij = Document & { relaties: { naam: string } | null };

// Alle aankoopfacturen: de concepten die nog geboekt moeten worden, en de
// geboekte met wat er nog betaald moet worden.
export default async function AankopenPagina({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const { filter } = await searchParams;
  const ctx = await huidigeContext();
  const supabase = await supabaseServer();

  let q = supabase
    .from("documenten")
    .select("*, relaties(naam)")
    .in("soort", ["aankoopfactuur", "aankoopcreditnota"])
    .order("datum", { ascending: false })
    .order("aangemaakt_op", { ascending: false });
  if (ctx.bedrijf) q = q.eq("bedrijf_id", ctx.bedrijf.id);
  const [{ data, error }, saldi] = await Promise.all([q, documentenMetSaldo(supabase, "aankoopfactuur", ctx.bedrijf?.id ?? null)]);

  const open = new Map(saldi.map((s) => [s.id, s.openstaand]));
  let rijen = (data ?? []) as unknown as Rij[];
  if (filter === "open") rijen = rijen.filter((d) => d.status === "definitief" && (open.get(d.id) ?? 0) > 0);
  if (filter === "concept") rijen = rijen.filter((d) => d.status === "concept");
  const totaalOpen = saldi.reduce((t, s) => t + Math.max(s.openstaand, 0), 0);
  const vandaagIso = vandaag();
  const bedrijfVan = (id: string) => ctx.bedrijven.find((b) => b.id === id);

  return (
    <>
      <div className="schermkop">
        <div>
          <h1>Aankoopfacturen</h1>
          <p>
            Facturen die je van leveranciers krijgt. Definitief gemaakt komen ze in het dagboek aankopen; betalen doe je via
            de bank.
          </p>
        </div>
        <div className="schermkop__acties">
          {ctx.bedrijf ? (
            <Link href="/aankopen/nieuw" className="knop knop--primair">
              + Aankoopfactuur registreren
            </Link>
          ) : (
            <span className="hulptekst">Kies een bedrijf om een aankoopfactuur te registreren.</span>
          )}
        </div>
      </div>

      <div className="zoekbalk">
        <span className="schakel">
          <Link href="/aankopen" className={`knop knop--klein${!filter ? " knop--primair" : ""}`}>
            Alles
          </Link>
          <Link href="/aankopen?filter=open" className={`knop knop--klein${filter === "open" ? " knop--primair" : ""}`}>
            Nog te betalen
          </Link>
          <Link href="/aankopen?filter=concept" className={`knop knop--klein${filter === "concept" ? " knop--primair" : ""}`}>
            Concepten
          </Link>
        </span>
        <span className="hulptekst">Nog te betalen in totaal: {euro(totaalOpen)}</span>
      </div>

      {error && <p className="foutmelding">{error.message}</p>}

      <div className="tabelkader">
        <table className="tabel">
          <thead>
            <tr>
              <th>Nummer</th>
              {!ctx.bedrijf && <th>Bedrijf</th>}
              <th>Leverancier</th>
              <th>Hun nummer</th>
              <th>Datum</th>
              <th>Vervalt</th>
              <th>Status</th>
              <th className="getal">Totaal incl.</th>
              <th className="getal">Nog te betalen</th>
            </tr>
          </thead>
          <tbody>
            {rijen.length === 0 && (
              <tr>
                <td colSpan={9} className="leeg">
                  Geen aankoopfacturen.
                </td>
              </tr>
            )}
            {rijen.map((d) => {
              const b = bedrijfVan(d.bedrijf_id);
              const rest = open.get(d.id);
              const vervallen = d.status === "definitief" && (rest ?? 0) > 0 && d.vervaldatum && d.vervaldatum < vandaagIso;
              return (
                <tr key={d.id} className="klikbaar">
                  <td>
                    <Link href={`/aankopen/${d.id}`} className="rij">
                      {d.nummer}
                    </Link>
                    {d.soort === "aankoopcreditnota" && (
                      <>
                        {" "}
                        <span className="badge">creditnota</span>
                      </>
                    )}
                  </td>
                  {!ctx.bedrijf && (
                    <td>
                      {b && (
                        <span className="badge badge--bedrijf" style={{ background: b.kleur }}>
                          {b.naam}
                        </span>
                      )}
                    </td>
                  )}
                  <td>{d.relaties?.naam}</td>
                  <td>{d.extern_nummer}</td>
                  <td>{datum(d.datum)}</td>
                  <td>
                    <span className={vervallen ? "badge badge--fout" : undefined}>{datum(d.vervaldatum)}</span>
                  </td>
                  <td>
                    <span className={DOCUMENT_STATUS_KLASSE[d.status]}>{DOCUMENT_STATUS_LABEL[d.status]}</span>
                  </td>
                  <td className="getal">{d.soort === "aankoopcreditnota" ? `− ${euro(d.totaal_incl)}` : euro(d.totaal_incl)}</td>
                  <td className="getal">
                    {rest === undefined ? (
                      ""
                    ) : rest > 0 ? (
                      euro(rest)
                    ) : rest < 0 ? (
                      <span className="badge badge--waarschuwing">{euro(-rest)} terug</span>
                    ) : (
                      <span className="badge badge--goed">betaald</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
