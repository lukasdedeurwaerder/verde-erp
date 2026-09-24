"use client";

import { useMemo, useState } from "react";
import { euro } from "@/lib/geld";
import { lijnExcl, totalen } from "@/lib/lijnen";
import { BTW_TARIEVEN, type BestellingSoort, type Lijn } from "@/lib/types";

// De lijnen van een bestelling bewerken.
//
// De rijen leven in de browser; bij het bewaren gaan ze als JSON in één
// verborgen veld mee met het gewone formulier. Bedragen staan als tekst
// in de rij zodat "12,5" en "12.5" allebei getypt kunnen worden.

export type ProductKeuze = {
  id: string;
  naam: string;
  code: string | null;
  eenheid: string;
  verkoopprijs: number;
  aankoopprijs: number;
  btw_tarief: number;
};

export type RekeningKeuze = { id: string; nummer: string; naam: string };

type Rij = {
  sleutel: number;
  rekening_id: string;
  product_id: string;
  omschrijving: string;
  aantal: string;
  eenheidsprijs: string;
  btw_tarief: number;
  korting_pct: string;
};

function getal(t: string): number {
  const n = Number(t.trim().replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function naarLijn(r: Rij, volgorde: number): Lijn {
  return {
    ...(r.rekening_id ? { rekening_id: r.rekening_id } : {}),
    product_id: r.product_id || null,
    omschrijving: r.omschrijving,
    aantal: getal(r.aantal),
    eenheidsprijs: getal(r.eenheidsprijs),
    btw_tarief: r.btw_tarief,
    korting_pct: getal(r.korting_pct),
    volgorde,
  };
}

let teller = 1;
function legeRij(): Rij {
  return { sleutel: teller++, rekening_id: "", product_id: "", omschrijving: "", aantal: "1", eenheidsprijs: "", btw_tarief: 21, korting_pct: "" };
}

export function LijnenEditor({
  soort,
  producten,
  begin,
  vergrendeld = false,
  rekeningen,
}: {
  soort: BestellingSoort;
  producten: ProductKeuze[];
  begin: Lijn[];
  vergrendeld?: boolean;
  /** Alleen bij een aankoopfactuur: dan kies je per lijn de rekening. */
  rekeningen?: RekeningKeuze[];
}) {
  const [rijen, setRijen] = useState<Rij[]>(() =>
    begin.length === 0
      ? [legeRij()]
      : begin.map((l) => ({
          sleutel: teller++,
          rekening_id: l.rekening_id ?? "",
          product_id: l.product_id ?? "",
          omschrijving: l.omschrijving,
          aantal: String(l.aantal).replace(".", ","),
          eenheidsprijs: String(l.eenheidsprijs).replace(".", ","),
          btw_tarief: l.btw_tarief,
          korting_pct: l.korting_pct ? String(l.korting_pct).replace(".", ",") : "",
        })),
  );

  const lijnen = useMemo(() => rijen.map(naarLijn), [rijen]);
  const som = useMemo(() => totalen(lijnen.filter((l) => l.omschrijving || l.aantal > 0)), [lijnen]);

  function wijzig(sleutel: number, deel: Partial<Rij>) {
    setRijen((r) => r.map((x) => (x.sleutel === sleutel ? { ...x, ...deel } : x)));
  }

  function kiesProduct(sleutel: number, productId: string) {
    const p = producten.find((x) => x.id === productId);
    if (!p) {
      wijzig(sleutel, { product_id: "" });
      return;
    }
    const prijs = soort === "verkoop" ? p.verkoopprijs : p.aankoopprijs;
    wijzig(sleutel, {
      product_id: p.id,
      omschrijving: p.naam,
      eenheidsprijs: String(prijs).replace(".", ","),
      btw_tarief: p.btw_tarief,
    });
  }

  function verwijder(sleutel: number) {
    setRijen((r) => (r.length === 1 ? [legeRij()] : r.filter((x) => x.sleutel !== sleutel)));
  }

  return (
    <div className="lijnen">
      <input type="hidden" name="lijnen" value={JSON.stringify(lijnen)} />

      <div className="tabelkader" style={{ boxShadow: "none" }}>
        <table className="tabel lijnen__tabel">
          <thead>
            <tr>
              <th style={{ width: "22%" }}>Product</th>
              {rekeningen && <th style={{ width: "18%" }}>Rekening</th>}
              <th>Omschrijving</th>
              <th className="getal" style={{ width: 90 }}>Aantal</th>
              <th className="getal" style={{ width: 120 }}>Prijs excl.</th>
              <th className="getal" style={{ width: 90 }}>Korting %</th>
              <th style={{ width: 90 }}>Btw</th>
              <th className="getal" style={{ width: 110 }}>Totaal excl.</th>
              <th style={{ width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {rijen.map((r, i) => (
              <tr key={r.sleutel}>
                <td>
                  <select className="veld" value={r.product_id} onChange={(e) => kiesProduct(r.sleutel, e.target.value)} disabled={vergrendeld}>
                    <option value="">— vrij —</option>
                    {producten.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.code ? `${p.code} · ` : ""}{p.naam}
                      </option>
                    ))}
                  </select>
                </td>
                {rekeningen && (
                  <td>
                    <select className="veld" value={r.rekening_id} onChange={(e) => wijzig(r.sleutel, { rekening_id: e.target.value })} disabled={vergrendeld} title="Op welke rekening deze lijn geboekt wordt">
                      <option value="">{r.product_id ? "— van het product (604) —" : "— 604 Aankopen —"}</option>
                      {rekeningen.map((k) => (
                        <option key={k.id} value={k.id}>
                          {k.nummer} {k.naam}
                        </option>
                      ))}
                    </select>
                  </td>
                )}
                <td>
                  <input className="veld" value={r.omschrijving} onChange={(e) => wijzig(r.sleutel, { omschrijving: e.target.value })} placeholder="Omschrijving" disabled={vergrendeld} />
                </td>
                <td>
                  <input className="veld getal" inputMode="decimal" value={r.aantal} onChange={(e) => wijzig(r.sleutel, { aantal: e.target.value })} disabled={vergrendeld} />
                </td>
                <td>
                  <input className="veld getal" inputMode="decimal" value={r.eenheidsprijs} onChange={(e) => wijzig(r.sleutel, { eenheidsprijs: e.target.value })} placeholder="0,00" disabled={vergrendeld} />
                </td>
                <td>
                  <input className="veld getal" inputMode="decimal" value={r.korting_pct} onChange={(e) => wijzig(r.sleutel, { korting_pct: e.target.value })} placeholder="0" disabled={vergrendeld} />
                </td>
                <td>
                  <select className="veld" value={r.btw_tarief} onChange={(e) => wijzig(r.sleutel, { btw_tarief: Number(e.target.value) })} disabled={vergrendeld}>
                    {BTW_TARIEVEN.map((t) => (
                      <option key={t} value={t}>
                        {t} %
                      </option>
                    ))}
                  </select>
                </td>
                <td className="getal">{euro(lijnExcl(lijnen[i]))}</td>
                <td>
                  {!vergrendeld && (
                    <button type="button" className="knop knop--klein knop--tekst" onClick={() => verwijder(r.sleutel)} title="Lijn verwijderen" aria-label="Lijn verwijderen">
                      ✕
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="lijnen__onder">
        {!vergrendeld ? (
          <button type="button" className="knop knop--klein" onClick={() => setRijen((r) => [...r, legeRij()])}>
            + Lijn toevoegen
          </button>
        ) : (
          <span />
        )}
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
    </div>
  );
}
