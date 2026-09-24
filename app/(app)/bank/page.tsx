import { huidigeContext } from "@/lib/sessie";
import { supabaseServer } from "@/lib/supabase/server";
import { datum, vandaag } from "@/lib/bestelling";
import { documentenMetSaldo, rekeningen } from "@/lib/boekhouding";
import { euro } from "@/lib/geld";
import { cent } from "@/lib/lijnen";
import { BankFormulier } from "./Formulier";
import { VerwijderKnop } from "../dagboeken/VerwijderKnop";

export const metadata = { title: "Bank" };

/** "A", "A en B", "A, B en C". */
function opsomming(namen: string[]): string {
  return namen.length <= 1 ? (namen[0] ?? "") : `${namen.slice(0, -1).join(", ")} en ${namen[namen.length - 1]}`;
}

type Regel = {
  boeking_id: string;
  datum: string;
  uittreksel_nummer: string | null;
  omschrijving: string;
  bedrag: number;
  bedrijf_id: string;
  bedrijf_naam: string;
  bedrijf_kleur: string;
};

// De gedeelde bankrekening. Iedereen ziet het volledige uittreksel, van
// beide dochters, net zoals op papier. Boeken doe je enkel voor je eigen
// dochter: elke regel hoort bij één bedrijf.
export default async function BankPagina({ searchParams }: { searchParams: Promise<{ document?: string }> }) {
  const { document } = await searchParams;
  const ctx = await huidigeContext();
  const supabase = await supabaseServer();

  const [{ data, error }, reks, facturen, aankopen] = await Promise.all([
    supabase.rpc("gedeelde_bankrekening", {}),
    rekeningen(supabase),
    ctx.bedrijf ? documentenMetSaldo(supabase, "factuur", ctx.bedrijf.id) : Promise.resolve([]),
    ctx.bedrijf ? documentenMetSaldo(supabase, "aankoopfactuur", ctx.bedrijf.id) : Promise.resolve([]),
  ]);
  const regels = (data ?? []) as Regel[];

  let saldo = 0;
  const metSaldo = regels.map((r) => {
    saldo = cent(saldo + Number(r.bedrag));
    return { ...r, saldo };
  });
  const perBedrijf = new Map<string, number>();
  for (const r of regels) perBedrijf.set(r.bedrijf_id, cent((perBedrijf.get(r.bedrijf_id) ?? 0) + Number(r.bedrag)));

  const bank = ctx.instellingen.iban;
  const magVerwijderen = (r: Regel) => ctx.isDocent || r.bedrijf_id === ctx.profiel.bedrijf_id;

  return (
    <>
      <div className="schermkop">
        <div>
          <h1>Bank</h1>
          <p>
            De rekening die {opsomming(ctx.bedrijven.map((b) => b.naam))} delen{bank ? ` (${bank})` : ""}. Elke verrichting
            van het uittreksel boek je hier, voor de dochter waar ze bij hoort.
          </p>
        </div>
      </div>

      <div className="tegels">
        <div className="tegel">
          <div className="tegel__label">Saldo gedeelde rekening</div>
          <div className="tegel__getal">{euro(saldo)}</div>
          <div className="tegel__sub">moet overeenkomen met het laatste uittreksel</div>
        </div>
        {ctx.bedrijven.map((b) => (
          <div className="tegel" key={b.id}>
            <div className="tegel__label">
              <span className="badge badge--bedrijf" style={{ background: b.kleur }}>
                {b.naam}
              </span>{" "}
              deel
            </div>
            <div className="tegel__getal">{euro(perBedrijf.get(b.id) ?? 0)}</div>
          </div>
        ))}
      </div>

      {error && <p className="foutmelding">{error.message}</p>}

      <div className="tweekolom tweekolom--formulier">
        <div className="tabelkader">
          <table className="tabel">
            <thead>
              <tr>
                <th>Datum</th>
                <th>Uittr.</th>
                <th>Omschrijving</th>
                <th>Voor</th>
                <th className="getal">Bedrag</th>
                <th className="getal">Saldo</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {metSaldo.length === 0 && (
                <tr>
                  <td colSpan={7} className="leeg">
                    Nog geen verrichtingen. Begin bijvoorbeeld met de inbreng van het startkapitaal.
                  </td>
                </tr>
              )}
              {[...metSaldo].reverse().map((r) => (
                <tr key={r.boeking_id}>
                  <td>{datum(r.datum)}</td>
                  <td>{r.uittreksel_nummer}</td>
                  <td>{r.omschrijving}</td>
                  <td>
                    <span className="badge badge--bedrijf" style={{ background: r.bedrijf_kleur }}>
                      {r.bedrijf_naam}
                    </span>
                  </td>
                  <td className="getal" style={{ color: Number(r.bedrag) < 0 ? "var(--fout)" : "var(--goed)" }}>
                    {Number(r.bedrag) > 0 ? "+" : ""}
                    {euro(r.bedrag)}
                  </td>
                  <td className="getal">{euro(r.saldo)}</td>
                  <td>
                    {magVerwijderen(r) && (
                      <VerwijderKnop
                        id={r.boeking_id}
                        uitleg="Deze bankverrichting verwijderen? Was ze de betaling van een factuur, dan staat die factuur weer open."
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="kaart">
          <div className="kaart__kop">
            <h2>Verrichting boeken</h2>
          </div>
          {ctx.bedrijf ? (
            <>
              <p className="hulptekst" style={{ marginBottom: 12 }}>
                Voor <strong>{ctx.bedrijf.naam}</strong>.
              </p>
              <BankFormulier
                facturen={facturen.filter((f) => f.openstaand !== 0).map((f) => ({ id: f.id, nummer: f.nummer, relatie: f.relatie, openstaand: f.openstaand }))}
                aankopen={aankopen.filter((f) => f.openstaand !== 0).map((f) => ({ id: f.id, nummer: f.nummer, relatie: f.relatie, openstaand: f.openstaand, extern: f.extern_nummer }))}
                rekeningen={reks.filter((r) => !["550", "400", "440"].includes(r.nummer))}
                vandaag={vandaag()}
                document={document ?? null}
              />
            </>
          ) : (
            <p className="melding-info">Kies in de bovenbalk voor welke dochter je boekt.</p>
          )}
        </div>
      </div>
    </>
  );
}
