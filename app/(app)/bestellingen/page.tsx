import Link from "next/link";
import { huidigeContext } from "@/lib/sessie";
import { supabaseServer } from "@/lib/supabase/server";
import { bestellingNummer, datum, STATUS_KLASSE, STATUS_LABEL } from "@/lib/bestelling";
import { euro } from "@/lib/geld";
import { totalen } from "@/lib/lijnen";
import type { Bestelling, Lijn } from "@/lib/types";
import { Kanban, type Kaart } from "./Kanban";

export const metadata = { title: "Bestellingen" };

type Rij = Bestelling & {
  relaties: { naam: string } | null;
  verantwoordelijke: { naam: string } | null;
  bestellijnen: Lijn[];
};

export default async function BestellingenPagina({
  searchParams,
}: {
  searchParams: Promise<{ weergave?: string; soort?: string; status?: string }>;
}) {
  const { weergave, soort, status } = await searchParams;
  const kanban = weergave !== "lijst";
  const ctx = await huidigeContext();
  const supabase = await supabaseServer();

  let query = supabase
    .from("bestellingen")
    .select("*, relaties(naam), verantwoordelijke:profielen!bestellingen_verantwoordelijke_id_fkey(naam), bestellijnen(*)")
    .order("datum", { ascending: false })
    .order("nummer", { ascending: false });
  if (ctx.bedrijf) query = query.eq("bedrijf_id", ctx.bedrijf.id);
  if (soort === "verkoop" || soort === "aankoop") query = query.eq("soort", soort);
  if (status && !kanban) query = query.eq("status", status);

  const { data, error } = await query;
  const rijen = (data ?? []) as unknown as Rij[];
  const bedrijfVan = (id: string) => ctx.bedrijven.find((b) => b.id === id);

  const kaarten: Kaart[] = rijen.map((b) => {
    const bedrijf = ctx.bedrijf ? null : bedrijfVan(b.bedrijf_id);
    return {
      id: b.id,
      soort: b.soort,
      jaar: b.jaar,
      nummer: b.nummer,
      relatie: b.relaties?.naam ?? "?",
      verantwoordelijke: b.verantwoordelijke?.naam ?? null,
      datum: b.datum,
      leverdatum: b.gewenste_leverdatum,
      totaal: totalen(b.bestellijnen ?? []).incl,
      status: b.status,
      bedrijf: bedrijf ? { naam: bedrijf.naam, kleur: bedrijf.kleur } : null,
    };
  });

  const link = (wijzig: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const alles = { weergave: kanban ? undefined : "lijst", soort, status, ...wijzig };
    for (const [k, v] of Object.entries(alles)) if (v) p.set(k, v);
    const s = p.toString();
    return `/bestellingen${s ? `?${s}` : ""}`;
  };

  return (
    <>
      <div className="schermkop">
        <div>
          <h1>Bestellingen</h1>
          <p>Verkooporders van klanten en aankooporders bij leveranciers, met wie ze opvolgt.</p>
        </div>
        <div className="schermkop__acties">
          {ctx.bedrijf ? (
            <>
              <Link href="/bestellingen/nieuw?soort=verkoop" className="knop knop--primair">
                + Verkooporder
              </Link>
              <Link href="/bestellingen/nieuw?soort=aankoop" className="knop">
                + Aankooporder
              </Link>
            </>
          ) : (
            <span className="hulptekst">Kies een bedrijf om een bestelling toe te voegen.</span>
          )}
        </div>
      </div>

      <div className="zoekbalk">
        <span className="schakel">
          <Link href={link({ weergave: undefined })} className={`knop knop--klein${kanban ? " knop--primair" : ""}`}>
            Kanban
          </Link>
          <Link href={link({ weergave: "lijst" })} className={`knop knop--klein${!kanban ? " knop--primair" : ""}`}>
            Lijst
          </Link>
        </span>
        <span className="schakel">
          <Link href={link({ soort: undefined })} className={`knop knop--klein${!soort ? " knop--primair" : ""}`}>
            Alles
          </Link>
          <Link href={link({ soort: "verkoop" })} className={`knop knop--klein${soort === "verkoop" ? " knop--primair" : ""}`}>
            Verkoop
          </Link>
          <Link href={link({ soort: "aankoop" })} className={`knop knop--klein${soort === "aankoop" ? " knop--primair" : ""}`}>
            Aankoop
          </Link>
        </span>
      </div>

      {error && <p className="foutmelding">{error.message}</p>}

      {kanban ? (
        <Kanban kaarten={kaarten} />
      ) : (
        <div className="tabelkader">
          <table className="tabel">
            <thead>
              <tr>
                <th>Nummer</th>
                <th>Soort</th>
                {!ctx.bedrijf && <th>Bedrijf</th>}
                <th>Relatie</th>
                <th>Datum</th>
                <th>Levering</th>
                <th>Verantwoordelijke</th>
                <th>Status</th>
                <th className="getal">Totaal incl.</th>
              </tr>
            </thead>
            <tbody>
              {kaarten.length === 0 && (
                <tr>
                  <td colSpan={9} className="leeg">
                    Nog geen bestellingen.
                  </td>
                </tr>
              )}
              {kaarten.map((k) => (
                <tr key={k.id} className="klikbaar">
                  <td>
                    <Link href={`/bestellingen/${k.id}`} className="rij">
                      {bestellingNummer(k)}
                    </Link>
                  </td>
                  <td>{k.soort === "verkoop" ? "Verkoop" : "Aankoop"}</td>
                  {!ctx.bedrijf && (
                    <td>
                      {k.bedrijf && (
                        <span className="badge badge--bedrijf" style={{ background: k.bedrijf.kleur }}>
                          {k.bedrijf.naam}
                        </span>
                      )}
                    </td>
                  )}
                  <td>{k.relatie}</td>
                  <td>{datum(k.datum)}</td>
                  <td>{datum(k.leverdatum)}</td>
                  <td>{k.verantwoordelijke ?? ""}</td>
                  <td>
                    <span className={STATUS_KLASSE[k.status]}>{STATUS_LABEL[k.status]}</span>
                  </td>
                  <td className="getal">{euro(k.totaal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
