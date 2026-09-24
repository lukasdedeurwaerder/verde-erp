import Link from "next/link";
import { huidigeContext } from "@/lib/sessie";
import { supabaseServer } from "@/lib/supabase/server";
import { datum, vandaag } from "@/lib/bestelling";
import { euro } from "@/lib/geld";
import { cent } from "@/lib/lijnen";
import type { Saldo } from "@/lib/types";
import { VoorraadKnop } from "./VoorraadKnop";

export const metadata = { title: "Balans en resultaat" };

// Rubrieken van de balans, naar de eerste cijfers van het rekeningnummer.
// Vereenvoudigd volgens het schema van de jaarrekening.
const ACTIVA: { titel: string; past: (n: string) => boolean }[] = [
  { titel: "Vaste activa", past: (n) => n.startsWith("2") },
  { titel: "Voorraden", past: (n) => n.startsWith("3") },
  { titel: "Vorderingen op ten hoogste één jaar", past: (n) => n.startsWith("4") },
  { titel: "Liquide middelen", past: (n) => n.startsWith("5") },
];
const PASSIVA: { titel: string; past: (n: string) => boolean }[] = [
  { titel: "Eigen vermogen", past: (n) => n.startsWith("1") && !n.startsWith("17") },
  { titel: "Schulden op meer dan één jaar", past: (n) => n.startsWith("17") },
  { titel: "Schulden op ten hoogste één jaar", past: (n) => n.startsWith("4") },
];

function Rubriek({ titel, rekeningen, extra }: { titel: string; rekeningen: Saldo[]; extra?: { naam: string; bedrag: number } }) {
  const totaal = cent(rekeningen.reduce((t, r) => t + Number(r.saldo), 0) + (extra?.bedrag ?? 0));
  if (rekeningen.length === 0 && !extra) return null;
  return (
    <>
      <tr className="rapport__rubriek">
        <td>{titel}</td>
        <td className="getal">{euro(totaal)}</td>
      </tr>
      {rekeningen.map((r) => (
        <tr key={r.rekening_id}>
          <td className="rapport__rekening">
            <Link href={`/grootboek/${r.nummer}`}>
              {r.nummer} {r.naam}
            </Link>
          </td>
          <td className="getal">{euro(r.saldo)}</td>
        </tr>
      ))}
      {extra && (
        <tr>
          <td className="rapport__rekening">{extra.naam}</td>
          <td className="getal">{euro(extra.bedrag)}</td>
        </tr>
      )}
    </>
  );
}

export default async function RapportenPagina({ searchParams }: { searchParams: Promise<{ tot?: string }> }) {
  const { tot: totParam } = await searchParams;
  const tot = totParam && /^\d{4}-\d{2}-\d{2}$/.test(totParam) ? totParam : vandaag();
  const ctx = await huidigeContext();
  const supabase = await supabaseServer();

  const { data, error } = await supabase.rpc("saldi_tot", { p_bedrijf: ctx.bedrijf?.id ?? null, p_tot: tot });
  const saldi = ((data ?? []) as Saldo[]).filter((s) => Math.abs(Number(s.saldo)) >= 0.005);

  const van = (soort: Saldo["soort"]) => saldi.filter((s) => s.soort === soort);
  const opbrengsten = van("opbrengst");
  const kosten = van("kost");
  const totOpbrengst = cent(opbrengsten.reduce((t, s) => t + Number(s.saldo), 0));
  const totKost = cent(kosten.reduce((t, s) => t + Number(s.saldo), 0));
  const resultaat = cent(totOpbrengst - totKost);

  const activa = van("actief");
  const passiva = van("passief");
  const totActiva = cent(activa.reduce((t, s) => t + Number(s.saldo), 0));
  const totPassiva = cent(passiva.reduce((t, s) => t + Number(s.saldo), 0) + resultaat);
  const sluit = Math.abs(totActiva - totPassiva) < 0.005;

  const btw451 = Number(saldi.find((s) => s.nummer === "451")?.saldo ?? 0);
  const btw411 = Number(saldi.find((s) => s.nummer === "411")?.saldo ?? 0);
  const btwPositie = cent(btw451 - btw411);

  const wie = ctx.bedrijf ? ctx.bedrijf.naam : `${ctx.instellingen.moeder_naam} (alle dochters samen)`;

  return (
    <>
      <div className="schermkop">
        <div>
          <h1>Balans en resultaat</h1>
          <p>
            {wie}, berekend uit alle boekingen tot en met {datum(tot)}. Klik op een rekening voor het grootboek.
          </p>
        </div>
        <form className="schermkop__acties" method="get">
          <label htmlFor="tot" style={{ alignSelf: "center" }}>
            Tot en met
          </label>
          <input id="tot" name="tot" type="date" className="veld" defaultValue={tot} style={{ width: 170 }} />
          <button type="submit" className="knop">
            Tonen
          </button>
        </form>
      </div>

      {error && <p className="foutmelding">{error.message}</p>}

      <div className="tegels">
        <div className="tegel">
          <div className="tegel__label">{resultaat >= 0 ? "Winst" : "Verlies"}</div>
          <div className="tegel__getal" style={{ color: resultaat >= 0 ? "var(--goed)" : "var(--fout)" }}>{euro(Math.abs(resultaat))}</div>
          <div className="tegel__sub">
            opbrengsten {euro(totOpbrengst)} − kosten {euro(totKost)}
          </div>
        </div>
        <div className="tegel">
          <div className="tegel__label">Balanstotaal</div>
          <div className="tegel__getal">{euro(totActiva)}</div>
          <div className="tegel__sub">
            {sluit ? <span className="badge badge--goed">activa = passiva</span> : <span className="badge badge--fout">sluit niet: {euro(totActiva - totPassiva)}</span>}
          </div>
        </div>
        <div className="tegel">
          <div className="tegel__label">Btw-positie</div>
          <div className="tegel__getal">{euro(Math.abs(btwPositie))}</div>
          <div className="tegel__sub">
            {btwPositie > 0 ? "te betalen aan de btw" : btwPositie < 0 ? "terug te vorderen van de btw" : "niets te betalen"} (451 − 411)
          </div>
        </div>
      </div>

      <div className="rapporten">
        <div className="kaart">
          <div className="kaart__kop">
            <h2>Resultatenrekening</h2>
          </div>
          <table className="tabel rapport">
            <tbody>
              <Rubriek titel="Opbrengsten" rekeningen={opbrengsten} />
              <Rubriek titel="Kosten" rekeningen={kosten} />
              <tr className="rapport__totaal">
                <td>{resultaat >= 0 ? "Winst van het boekjaar" : "Verlies van het boekjaar"}</td>
                <td className="getal">{euro(resultaat)}</td>
              </tr>
            </tbody>
          </table>
          {opbrengsten.length + kosten.length === 0 && <p className="hulptekst">Nog geen opbrengsten of kosten geboekt.</p>}
        </div>

        <div className="kaart">
          <div className="kaart__kop">
            <h2>Balans</h2>
          </div>
          <div className="balans">
            <table className="tabel rapport">
              <thead>
                <tr>
                  <th>Activa</th>
                  <th className="getal"></th>
                </tr>
              </thead>
              <tbody>
                {ACTIVA.map((r) => (
                  <Rubriek key={r.titel} titel={r.titel} rekeningen={activa.filter((s) => r.past(s.nummer))} />
                ))}
                <tr className="rapport__totaal">
                  <td>Totaal activa</td>
                  <td className="getal">{euro(totActiva)}</td>
                </tr>
              </tbody>
            </table>
            <table className="tabel rapport">
              <thead>
                <tr>
                  <th>Passiva</th>
                  <th className="getal"></th>
                </tr>
              </thead>
              <tbody>
                {PASSIVA.map((r, i) => (
                  <Rubriek
                    key={r.titel}
                    titel={r.titel}
                    rekeningen={passiva.filter((s) => r.past(s.nummer))}
                    extra={i === 0 ? { naam: "Resultaat van het boekjaar", bedrag: resultaat } : undefined}
                  />
                ))}
                <tr className="rapport__totaal">
                  <td>Totaal passiva</td>
                  <td className="getal">{euro(totPassiva)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {ctx.bedrijf && (
        <div className="kaart" style={{ maxWidth: 520 }}>
          <div className="kaart__kop">
            <h2>Voorraad op de balans</h2>
          </div>
          <VoorraadKnop tot={tot} />
        </div>
      )}
    </>
  );
}
