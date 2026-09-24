"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { euro } from "@/lib/geld";
import { cent } from "@/lib/lijnen";
import { diversBoeken, type BoekStatus } from "./acties";

type Rij = { sleutel: number; rekening_id: string; omschrijving: string; debet: string; credit: string };
let teller = 1;
const leeg = (): Rij => ({ sleutel: teller++, rekening_id: "", omschrijving: "", debet: "", credit: "" });
const getal = (t: string) => {
  const n = Number(t.trim().replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

function Knop({ uit }: { uit: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="knop knop--primair" disabled={pending || uit}>
      {pending ? "Bezig…" : "Boeken"}
    </button>
  );
}

// Een diverse boeking: vrije lijnen in debet en credit. Onderaan zie je
// meteen of de boeking in evenwicht is; zo niet, dan kan ze niet bewaard.
export function DiversFormulier({ rekeningen, vandaag }: { rekeningen: { id: string; nummer: string; naam: string }[]; vandaag: string }) {
  const [status, actie] = useActionState<BoekStatus, FormData>(diversBoeken, {});
  const [rijen, setRijen] = useState<Rij[]>(() => [leeg(), leeg()]);

  // Na een geslaagde boeking: lege lijnen voor de volgende.
  useEffect(() => {
    if (status.goed) setRijen([leeg(), leeg()]);
  }, [status]);

  const d = useMemo(() => cent(rijen.reduce((t, r) => t + getal(r.debet), 0)), [rijen]);
  const c = useMemo(() => cent(rijen.reduce((t, r) => t + getal(r.credit), 0)), [rijen]);
  const evenwicht = d === c && d > 0;

  const wijzig = (s: number, deel: Partial<Rij>) => setRijen((r) => r.map((x) => (x.sleutel === s ? { ...x, ...deel } : x)));

  return (
    <form action={actie} className="formulier">
      {status.fout && <p className="foutmelding" role="alert">{status.fout}</p>}
      {status.goed && <p className="melding-goed">{status.goed}</p>}
      <input type="hidden" name="lijnen" value={JSON.stringify(rijen)} />

      <div className="formulier__kolommen formulier__kolommen--3">
        <div className="formulier__rij">
          <label htmlFor="d-datum">Datum</label>
          <input id="d-datum" name="datum" type="date" className="veld" defaultValue={vandaag} required />
        </div>
        <div className="formulier__rij" style={{ gridColumn: "span 2" }}>
          <label htmlFor="d-oms">Omschrijving</label>
          <input id="d-oms" name="omschrijving" className="veld" placeholder="bv. Afschrijving kassa september" required />
        </div>
      </div>

      <div className="tabelkader" style={{ boxShadow: "none" }}>
        <table className="tabel lijnen__tabel">
          <thead>
            <tr>
              <th>Rekening</th>
              <th>Omschrijving</th>
              <th className="getal" style={{ width: 110 }}>Debet</th>
              <th className="getal" style={{ width: 110 }}>Credit</th>
              <th style={{ width: 36 }}></th>
            </tr>
          </thead>
          <tbody>
            {rijen.map((r) => (
              <tr key={r.sleutel}>
                <td>
                  <select className="veld" value={r.rekening_id} onChange={(e) => wijzig(r.sleutel, { rekening_id: e.target.value })}>
                    <option value="">— kies —</option>
                    {rekeningen.map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.nummer} {k.naam}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input className="veld" value={r.omschrijving} onChange={(e) => wijzig(r.sleutel, { omschrijving: e.target.value })} />
                </td>
                <td>
                  <input className="veld getal" inputMode="decimal" value={r.debet} onChange={(e) => wijzig(r.sleutel, { debet: e.target.value, credit: e.target.value ? "" : r.credit })} />
                </td>
                <td>
                  <input className="veld getal" inputMode="decimal" value={r.credit} onChange={(e) => wijzig(r.sleutel, { credit: e.target.value, debet: e.target.value ? "" : r.debet })} />
                </td>
                <td>
                  <button type="button" className="knop knop--klein knop--tekst" aria-label="Lijn verwijderen" onClick={() => setRijen((x) => (x.length <= 2 ? x : x.filter((y) => y.sleutel !== r.sleutel)))}>
                    ✕
                  </button>
                </td>
              </tr>
            ))}
            <tr>
              <td colSpan={2} style={{ fontWeight: 600 }}>
                Totaal{" "}
                {d > 0 && (
                  <span className={evenwicht ? "badge badge--goed" : "badge badge--fout"}>
                    {evenwicht ? "in evenwicht" : `verschil ${euro(Math.abs(d - c))}`}
                  </span>
                )}
              </td>
              <td className="getal" style={{ fontWeight: 600 }}>{euro(d)}</td>
              <td className="getal" style={{ fontWeight: 600 }}>{euro(c)}</td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="formulier__acties">
        <button type="button" className="knop knop--klein" onClick={() => setRijen((r) => [...r, leeg()])}>
          + Lijn
        </button>
        <span className="rechts">
          <Knop uit={!evenwicht} />
        </span>
      </div>
    </form>
  );
}
