import Link from "next/link";
import { vereistDocent } from "@/lib/sessie";
import { supabaseServer } from "@/lib/supabase/server";
import { vandaag } from "@/lib/bestelling";
import { documentenMetSaldo } from "@/lib/boekhouding";
import { euro } from "@/lib/geld";
import { cent } from "@/lib/lijnen";
import type { Saldo } from "@/lib/types";

export const metadata = { title: "Docentenpaneel" };

type Activiteit = { gebruiker_id: string; naam: string; bedrijf_id: string | null; aantal: number; laatste: string | null; deze_week: number };

function tijdGeleden(iso: string | null): string {
  if (!iso) return "nog nooit";
  const uren = (Date.now() - new Date(iso).getTime()) / 3600000;
  if (uren < 1) return "net nog";
  if (uren < 24) return `${Math.floor(uren)} uur geleden`;
  const dagen = Math.floor(uren / 24);
  return dagen === 1 ? "gisteren" : `${dagen} dagen geleden`;
}

// Beide dochters naast elkaar, en wie er actief is. Enkel voor de docent.
export default async function DocentPagina() {
  const ctx = await vereistDocent();
  const supabase = await supabaseServer();
  const tot = vandaag();

  const perBedrijf = await Promise.all(
    ctx.bedrijven.map(async (b) => {
      const [saldiQ, facturen, aankopen, openQ, conceptQ] = await Promise.all([
        supabase.rpc("saldi_tot", { p_bedrijf: b.id, p_tot: tot }),
        documentenMetSaldo(supabase, "factuur", b.id),
        documentenMetSaldo(supabase, "aankoopfactuur", b.id),
        supabase.from("bestellingen").select("id", { count: "exact", head: true }).eq("bedrijf_id", b.id).in("status", ["nieuw", "in_behandeling", "klaar"]),
        supabase.from("documenten").select("id", { count: "exact", head: true }).eq("bedrijf_id", b.id).eq("status", "concept"),
      ]);
      const saldi = (saldiQ.data ?? []) as Saldo[];
      const som = (f: (s: Saldo) => boolean) => cent(saldi.filter(f).reduce((t, s) => t + Number(s.saldo), 0));
      const omzet = som((s) => s.nummer.startsWith("70"));
      const opbrengsten = som((s) => s.soort === "opbrengst");
      const kosten = som((s) => s.soort === "kost");
      return {
        bedrijf: b,
        omzet,
        resultaat: cent(opbrengsten - kosten),
        bank: som((s) => s.nummer === "550"),
        eigenVermogen: cent(som((s) => s.soort === "passief" && s.nummer.startsWith("1")) + opbrengsten - kosten),
        teOntvangen: cent(facturen.reduce((t, f) => t + Math.max(f.openstaand, 0), 0)),
        vervallen: facturen.filter((f) => f.openstaand > 0 && f.vervaldatum && f.vervaldatum < tot).length,
        teBetalen: cent(aankopen.reduce((t, f) => t + Math.max(f.openstaand, 0), 0)),
        aantalFacturen: facturen.length,
        openBestellingen: openQ.count ?? 0,
        concepten: conceptQ.count ?? 0,
      };
    }),
  );

  const { data: act } = await supabase.rpc("activiteit_per_persoon", { p_bedrijf: null });
  const activiteit = (act ?? []) as Activiteit[];

  const RIJEN: { label: string; waarde: (x: (typeof perBedrijf)[number]) => React.ReactNode }[] = [
    { label: "Omzet (70)", waarde: (x) => euro(x.omzet) },
    { label: "Resultaat", waarde: (x) => <span style={{ color: x.resultaat >= 0 ? "var(--goed)" : "var(--fout)" }}>{euro(x.resultaat)}</span> },
    { label: "Eigen vermogen", waarde: (x) => euro(x.eigenVermogen) },
    { label: "Aandeel op de bankrekening", waarde: (x) => euro(x.bank) },
    { label: "Nog te ontvangen van klanten", waarde: (x) => (<>{euro(x.teOntvangen)}{x.vervallen > 0 && <> <span className="badge badge--fout">{x.vervallen} vervallen</span></>}</>) },
    { label: "Nog te betalen aan leveranciers", waarde: (x) => euro(x.teBetalen) },
    { label: "Definitieve facturen", waarde: (x) => x.aantalFacturen },
    { label: "Open bestellingen", waarde: (x) => x.openBestellingen },
    { label: "Documenten in concept", waarde: (x) => x.concepten },
  ];

  return (
    <>
      <div className="schermkop">
        <div>
          <h1>Docentenpaneel</h1>
          <p>Beide dochters naast elkaar, tot en met vandaag. De cijfers komen rechtstreeks uit hun boekhouding.</p>
        </div>
        <div className="schermkop__acties">
          <Link href="/logboek" className="knop">
            Logboek
          </Link>
          <Link href="/rekeningen" className="knop">
            Rekeningenstelsel
          </Link>
          <Link href="/instellingen" className="knop">
            Instellingen
          </Link>
        </div>
      </div>

      <div className="tabelkader" style={{ marginBottom: 16 }}>
        <table className="tabel">
          <thead>
            <tr>
              <th></th>
              {perBedrijf.map((x) => (
                <th key={x.bedrijf.id} className="getal">
                  <span className="badge badge--bedrijf" style={{ background: x.bedrijf.kleur }}>
                    {x.bedrijf.naam}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {RIJEN.map((r) => (
              <tr key={r.label}>
                <td>{r.label}</td>
                {perBedrijf.map((x) => (
                  <td key={x.bedrijf.id} className="getal">
                    {r.waarde(x)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="kaart">
        <div className="kaart__kop">
          <h2>Activiteit per student</h2>
          <span className="hulptekst">Acties uit het logboek: fiches, bestellingen, documenten, boekingen.</span>
        </div>
        {activiteit.length === 0 ? (
          <p className="hulptekst">
            Nog geen studentenaccounts. Maak ze aan bij <Link href="/instellingen">Instellingen</Link>.
          </p>
        ) : (
          <table className="tabel">
            <thead>
              <tr>
                <th>Student</th>
                <th>Bedrijf</th>
                <th className="getal">Acties</th>
                <th className="getal">Afgelopen 7 dagen</th>
                <th>Laatst actief</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {activiteit.map((a) => {
                const b = ctx.bedrijven.find((x) => x.id === a.bedrijf_id);
                const stil = !a.laatste || Date.now() - new Date(a.laatste).getTime() > 7 * 86400000;
                return (
                  <tr key={a.gebruiker_id}>
                    <td>{a.naam}</td>
                    <td>
                      {b && (
                        <span className="badge badge--bedrijf" style={{ background: b.kleur }}>
                          {b.naam}
                        </span>
                      )}
                    </td>
                    <td className="getal">{Number(a.aantal)}</td>
                    <td className="getal">{Number(a.deze_week)}</td>
                    <td>
                      {tijdGeleden(a.laatste)} {stil && <span className="badge badge--waarschuwing">stil</span>}
                    </td>
                    <td>
                      <Link href={`/logboek?persoon=${a.gebruiker_id}`}>Logboek</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
