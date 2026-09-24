import Link from "next/link";
import { notFound } from "next/navigation";
import { huidigeContext } from "@/lib/sessie";
import { supabaseServer } from "@/lib/supabase/server";
import { bestellingNummer, datum, DOCUMENT_LABEL, DOCUMENT_STATUS_KLASSE, DOCUMENT_STATUS_LABEL, DOCUMENTEN_PER_SOORT, EEN_PER_BESTELLING, SOORT_LABEL, STATUS_KLASSE, STATUS_LABEL, vandaag, VERGRENDELT_BESTELLING } from "@/lib/bestelling";
import { euro } from "@/lib/geld";
import type { Bestelling, BestellingSoort, Document, Lijn } from "@/lib/types";
import { BestellingFormulier, type PersoonKeuze, type RelatieKeuze } from "./Formulier";
import type { ProductKeuze } from "./LijnenEditor";
import { bestellingOpslaan, bestellingVerwijderen } from "./acties";
import { MaakDocumentKnop } from "./MaakDocumentKnop";

// Het scherm om een bestelling aan te maken of te bewerken. Rechts de
// documenten die eraan hangen en de knop om er een te maken.
export async function BestellingBewerken({ id, soort }: { id: string | null; soort: BestellingSoort }) {
  const ctx = await huidigeContext();
  const supabase = await supabaseServer();

  let bestelling: Bestelling | null = null;
  let lijnen: Lijn[] = [];
  let documenten: Document[] = [];
  if (id) {
    const { data } = await supabase
      .from("bestellingen")
      .select("*, bestellijnen(*), documenten(*)")
      .eq("id", id)
      .maybeSingle();
    if (!data) notFound();
    const { bestellijnen, documenten: docs, ...rest } = data as Bestelling & { bestellijnen: Lijn[]; documenten: Document[] };
    bestelling = rest;
    soort = bestelling.soort;
    lijnen = [...(bestellijnen ?? [])].sort((a, b) => a.volgorde - b.volgorde);
    documenten = [...(docs ?? [])].sort((a, b) => (a.aangemaakt_op < b.aangemaakt_op ? 1 : -1));
  }

  const t = SOORT_LABEL[soort];
  const bedrijfId = bestelling?.bedrijf_id ?? ctx.bedrijf?.id ?? null;

  if (!bedrijfId) {
    return (
      <>
        <div className="schermkop">
          <h1>Nieuwe {t.enkel}</h1>
        </div>
        <p className="melding-info">Kies eerst in de bovenbalk in welk bedrijf je deze bestelling wilt aanmaken.</p>
        <p style={{ marginTop: 12 }}>
          <Link href="/bestellingen">← Terug naar het overzicht</Link>
        </p>
      </>
    );
  }

  const [{ data: relaties }, { data: personen }, { data: producten }] = await Promise.all([
    supabase
      .from("relaties")
      .select("id, naam, gemeente")
      .eq("bedrijf_id", bedrijfId)
      .eq("actief", true)
      .in("soort", [soort === "verkoop" ? "klant" : "leverancier", "beide"])
      .order("naam"),
    supabase
      .from("profielen")
      .select("id, naam, rol")
      .eq("actief", true)
      .or(`bedrijf_id.eq.${bedrijfId},rol.eq.docent`)
      .order("naam"),
    supabase
      .from("producten")
      .select("id, naam, code, eenheid, verkoopprijs, aankoopprijs, btw_tarief")
      .eq("bedrijf_id", bedrijfId)
      .eq("actief", true)
      .order("naam"),
  ]);

  const bedrijf = ctx.bedrijven.find((b) => b.id === bedrijfId);
  const vergrendeld = documenten.some((d) => VERGRENDELT_BESTELLING.includes(d.soort) && d.status === "definitief");
  // Welke documenten kunnen er nog bij? Van een leverbon, ontvangstbon of
  // factuur mag er maar één lopend zijn.
  const nogTeMaken = DOCUMENTEN_PER_SOORT[soort].filter(
    (s) => !(EEN_PER_BESTELLING.includes(s) && documenten.some((d) => d.soort === s && d.status !== "geannuleerd")),
  );
  const relatieNaam = bestelling ? (relaties ?? []).find((r) => r.id === bestelling!.relatie_id)?.naam : null;

  return (
    <>
      <div className="schermkop">
        <div>
          <h1>
            {bestelling ? `${soort === "verkoop" ? "Verkooporder" : "Aankooporder"} ${bestellingNummer(bestelling)}` : `Nieuwe ${t.enkel}`}
          </h1>
          <p>
            {bedrijf?.naam}
            {relatieNaam && ` · ${relatieNaam}`}
            {bestelling && (
              <>
                {" · "}
                <span className={STATUS_KLASSE[bestelling.status]}>{STATUS_LABEL[bestelling.status]}</span>
              </>
            )}
          </p>
        </div>
        <div className="schermkop__acties">
          <Link href="/bestellingen" className="knop">
            ← Overzicht
          </Link>
        </div>
      </div>

      <div className="tweekolom">
        <BestellingFormulier
          soort={soort}
          bestelling={bestelling}
          lijnen={lijnen}
          relaties={(relaties ?? []) as RelatieKeuze[]}
          personen={(personen ?? []) as PersoonKeuze[]}
          producten={(producten ?? []) as ProductKeuze[]}
          huidigeGebruikerId={ctx.gebruikerId}
          vandaag={vandaag()}
          opslaan={bestellingOpslaan.bind(null, bestelling?.id ?? null, soort)}
          verwijderen={bestelling ? bestellingVerwijderen.bind(null, bestelling.id) : undefined}
          vergrendeld={vergrendeld}
        />

        {bestelling && (
          <div className="kaart">
            <div className="kaart__kop">
              <h2>Documenten</h2>
            </div>
            {documenten.length === 0 ? (
              <p className="hulptekst">Nog geen documenten bij deze bestelling.</p>
            ) : (
              <table className="tabel">
                <tbody>
                  {documenten.map((d) => (
                    <tr key={d.id}>
                      <td>
                        <Link href={`/documenten/${d.id}`} className="rij">
                          {DOCUMENT_LABEL[d.soort]} {d.nummer}
                        </Link>
                        <div className="hulptekst">{datum(d.datum)}</div>
                      </td>
                      <td>
                        <span className={DOCUMENT_STATUS_KLASSE[d.status]}>{DOCUMENT_STATUS_LABEL[d.status]}</span>
                      </td>
                      <td className="getal">{euro(d.totaal_incl)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {bestelling.status !== "geannuleerd" && nogTeMaken.length > 0 && (
              <div className="formulier" style={{ marginTop: 14, gap: 8 }}>
                {nogTeMaken.map((s, i) => (
                  <MaakDocumentKnop key={s} bestellingId={bestelling!.id} soort={s} label={DOCUMENT_LABEL[s]} primair={i === 0} />
                ))}
                <p className="hulptekst">
                  Een document neemt de lijnen van deze bestelling over. Bewaar dus eerst je wijzigingen.
                  {soort === "verkoop"
                    ? " De leverbon haalt de goederen uit voorraad zodra hij definitief is."
                    : " De ontvangstbon zet de goederen in voorraad zodra hij definitief is."}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
