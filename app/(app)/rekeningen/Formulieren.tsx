"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { Rekening } from "@/lib/types";
import {
  rekeningBijwerken,
  rekeningToevoegen,
  rekeningVerwijderen,
  standaardrekeningenOpslaan,
  type RekStatus,
} from "./acties";

const SOORT_LABEL: Record<Rekening["soort"], string> = {
  actief: "Actief (balans)",
  passief: "Passief (balans)",
  kost: "Kost (resultaat)",
  opbrengst: "Opbrengst (resultaat)",
};

function Knop({ tekst, klasse = "knop knop--primair knop--klein", bevestig }: { tekst: string; klasse?: string; bevestig?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={klasse}
      disabled={pending}
      onClick={(e) => {
        if (bevestig && !confirm(bevestig)) e.preventDefault();
      }}
    >
      {pending ? "…" : tekst}
    </button>
  );
}

function Melding({ s }: { s: RekStatus }) {
  if (s.fout) return <span className="foutmelding">{s.fout}</span>;
  if (s.goed) return <span className="melding-goed">{s.goed}</span>;
  return null;
}

export function RekeningNieuw() {
  const [s, actie] = useActionState<RekStatus, FormData>(rekeningToevoegen, {});
  return (
    <form action={actie} className="formulier">
      <div className="formulier__kolommen" style={{ gridTemplateColumns: "110px 1fr 200px auto" }}>
        <input name="nummer" className="veld" placeholder="nr., bv. 617" required />
        <input name="naam" className="veld" placeholder="naam, bv. Uitzendkrachten" required />
        <select name="soort" className="veld" defaultValue="">
          <option value="">— volgens klasse —</option>
          {Object.entries(SOORT_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <Knop tekst="Toevoegen" klasse="knop knop--primair" />
      </div>
      <Melding s={s} />
    </form>
  );
}

export function RekeningRij({ rekening: r, gebruik }: { rekening: Rekening; gebruik: number }) {
  const [s1, bewaar] = useActionState<RekStatus, FormData>(rekeningBijwerken.bind(null, r.id), {});
  const [s2, wis] = useActionState<RekStatus, FormData>(rekeningVerwijderen.bind(null, r.id), {});
  const formId = `r-${r.id}`;
  return (
    <tr style={{ opacity: r.actief ? 1 : 0.55 }}>
      <td style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{r.nummer}</td>
      <td>
        <input form={formId} name="naam" className="veld" defaultValue={r.naam} required />
      </td>
      <td>
        <select form={formId} name="soort" className="veld" defaultValue={r.soort}>
          {Object.entries(SOORT_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </td>
      <td>
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontWeight: 500 }}>
          <input form={formId} type="checkbox" name="actief" defaultChecked={r.actief} />
          Actief
        </label>
      </td>
      <td className="getal">{gebruik || ""}</td>
      <td>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <form id={formId} action={bewaar}>
            <Knop tekst="Bewaren" />
          </form>
          {gebruik === 0 && (
            <form action={wis}>
              <Knop tekst="Verwijderen" klasse="knop knop--klein knop--gevaar" bevestig={`Rekening ${r.nummer} verwijderen?`} />
            </form>
          )}
          <Melding s={s1.fout || s1.goed ? s1 : s2} />
        </div>
      </td>
    </tr>
  );
}

const STANDAARD: { veld: string; label: string; uitleg: string }[] = [
  { veld: "rek_klanten", label: "Klanten", uitleg: "debet bij elke factuur" },
  { veld: "rek_omzet", label: "Omzet", uitleg: "voor goederen zonder eigen rekening" },
  { veld: "rek_btw_te_betalen", label: "Btw te betalen", uitleg: "btw op verkopen" },
  { veld: "rek_leveranciers", label: "Leveranciers", uitleg: "credit bij elke aankoopfactuur" },
  { veld: "rek_aankopen", label: "Aankopen", uitleg: "voor lijnen zonder gekozen rekening" },
  { veld: "rek_btw_terug", label: "Terug te vorderen btw", uitleg: "btw op aankopen" },
  { veld: "rek_bank", label: "Bank", uitleg: "de gedeelde bankrekening" },
];

export function Standaardrekeningen({ huidig, rekeningen }: { huidig: Record<string, string>; rekeningen: Rekening[] }) {
  const [s, actie] = useActionState<RekStatus, FormData>(standaardrekeningenOpslaan, {});
  return (
    <form action={actie} className="formulier">
      <div className="formulier__kolommen">
        {STANDAARD.map((x) => (
          <div className="formulier__rij" key={x.veld}>
            <label htmlFor={x.veld}>
              {x.label} <span className="hulptekst">· {x.uitleg}</span>
            </label>
            <select id={x.veld} name={x.veld} className="veld" defaultValue={huidig[x.veld]}>
              {rekeningen.map((r) => (
                <option key={r.id} value={r.nummer}>
                  {r.nummer} {r.naam}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
      <div className="formulier__acties">
        <Knop tekst="Standaardrekeningen bewaren" klasse="knop knop--primair" />
        <Melding s={s} />
      </div>
    </form>
  );
}
