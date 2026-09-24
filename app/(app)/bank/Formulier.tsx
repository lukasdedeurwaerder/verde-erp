"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { euro } from "@/lib/geld";
import { betalingBoeken, type BoekStatus } from "../dagboeken/acties";

export type OpenKeuze = { id: string; nummer: string; relatie: string; openstaand: number; extern?: string | null };
type Koppeling = "factuur" | "aankoop" | "rekening";

function Knop() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="knop knop--primair" disabled={pending}>
      {pending ? "Bezig…" : "Boeken"}
    </button>
  );
}

// Eén regel van het rekeninguittreksel invoeren. Wie een factuur kiest,
// krijgt het openstaande bedrag al ingevuld.
export function BankFormulier({
  facturen,
  aankopen,
  rekeningen,
  vandaag,
  document,
}: {
  facturen: OpenKeuze[];
  aankopen: OpenKeuze[];
  rekeningen: { id: string; nummer: string; naam: string }[];
  vandaag: string;
  document: string | null;
}) {
  const [status, actie] = useActionState<BoekStatus, FormData>(betalingBoeken, {});
  const beginFactuur = facturen.find((f) => f.id === document);
  const beginAankoop = aankopen.find((f) => f.id === document);
  const [koppeling, setKoppeling] = useState<Koppeling>(beginAankoop ? "aankoop" : beginFactuur ? "factuur" : "factuur");
  // Een positief openstaand bedrag: de klant betaalt (in) of wij betalen (uit).
  // Negatief: er is te veel betaald en het geld gaat de andere kant op.
  const richtingVoor = (soort: "factuur" | "aankoop", open: number): "in" | "uit" =>
    (soort === "factuur") === (open > 0) ? "in" : "uit";
  const bedragTekst = (open: number) => String(Math.abs(open)).replace(".", ",");
  const [richting, setRichting] = useState<"in" | "uit">(
    beginAankoop ? richtingVoor("aankoop", beginAankoop.openstaand) : beginFactuur ? richtingVoor("factuur", beginFactuur.openstaand) : "in",
  );
  const [bedrag, setBedrag] = useState<string>(
    beginFactuur ? bedragTekst(beginFactuur.openstaand) : beginAankoop ? bedragTekst(beginAankoop.openstaand) : "",
  );
  const [factuurId, setFactuurId] = useState(beginFactuur?.id ?? "");
  const [aankoopId, setAankoopId] = useState(beginAankoop?.id ?? "");

  function kiesKoppeling(k: Koppeling) {
    setKoppeling(k);
    if (k === "factuur") setRichting("in");
    if (k === "aankoop") setRichting("uit");
  }

  return (
    <form action={actie} className="formulier">
      {status.fout && <p className="foutmelding" role="alert">{status.fout}</p>}
      {status.goed && <p className="melding-goed">{status.goed}</p>}

      <div className="formulier__kolommen formulier__kolommen--3">
        <div className="formulier__rij">
          <label htmlFor="datum">Datum</label>
          <input id="datum" name="datum" type="date" className="veld" defaultValue={vandaag} required />
        </div>
        <div className="formulier__rij">
          <label htmlFor="uittreksel">Uittreksel nr.</label>
          <input id="uittreksel" name="uittreksel" className="veld" placeholder="bv. 12" />
        </div>
      </div>

      <div className="formulier__rij">
        <span className="label">Wat is het?</span>
        <div className="schakel">
          {(
            [
              ["factuur", "Klant betaalt een factuur"],
              ["aankoop", "Wij betalen een leverancier"],
              ["rekening", "Iets anders"],
            ] as [Koppeling, string][]
          ).map(([k, tekst]) => (
            <button key={k} type="button" className={`knop knop--klein${koppeling === k ? " knop--primair" : ""}`} onClick={() => kiesKoppeling(k)}>
              {tekst}
            </button>
          ))}
        </div>
        <input type="hidden" name="koppeling" value={koppeling} />
      </div>

      {koppeling === "factuur" && (
        <div className="formulier__rij">
          <label htmlFor="factuur_id">Factuur</label>
          <select
            id="factuur_id"
            name="factuur_id"
            className="veld"
            value={factuurId}
            onChange={(e) => {
              setFactuurId(e.target.value);
              const f = facturen.find((x) => x.id === e.target.value);
              if (f) {
                setBedrag(bedragTekst(f.openstaand));
                setRichting(richtingVoor("factuur", f.openstaand));
              }
            }}
          >
            <option value="">— kies een openstaande factuur —</option>
            {facturen.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nummer} · {f.relatie} · {f.openstaand > 0 ? `nog ${euro(f.openstaand)}` : `${euro(-f.openstaand)} terug te betalen`}
              </option>
            ))}
          </select>
          {facturen.length === 0 && <span className="hulptekst">Er staan geen facturen open.</span>}
        </div>
      )}

      {koppeling === "aankoop" && (
        <div className="formulier__rij">
          <label htmlFor="aankoop_id">Aankoopfactuur</label>
          <select
            id="aankoop_id"
            name="aankoop_id"
            className="veld"
            value={aankoopId}
            onChange={(e) => {
              setAankoopId(e.target.value);
              const f = aankopen.find((x) => x.id === e.target.value);
              if (f) {
                setBedrag(bedragTekst(f.openstaand));
                setRichting(richtingVoor("aankoop", f.openstaand));
              }
            }}
          >
            <option value="">— kies een openstaande aankoopfactuur —</option>
            {aankopen.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nummer}
                {f.extern ? ` (${f.extern})` : ""} · {f.relatie} · {f.openstaand > 0 ? `nog ${euro(f.openstaand)}` : `${euro(-f.openstaand)} terug te krijgen`}
              </option>
            ))}
          </select>
          {aankopen.length === 0 && <span className="hulptekst">Er staan geen aankoopfacturen open.</span>}
        </div>
      )}

      {koppeling === "rekening" && (
        <div className="formulier__rij">
          <label htmlFor="rekening_id">Tegenrekening</label>
          <select id="rekening_id" name="rekening_id" className="veld" defaultValue="">
            <option value="">— kies —</option>
            {rekeningen.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nummer} {r.naam}
              </option>
            ))}
          </select>
          <span className="hulptekst">
            Bijvoorbeeld 100 Kapitaal voor een inbreng, 650 voor bankkosten, 620 voor lonen, 451 voor een btw-betaling.
          </span>
        </div>
      )}

      <div className="formulier__kolommen formulier__kolommen--3">
        <div className="formulier__rij">
          <span className="label">Richting</span>
          <div className="schakel">
            <button type="button" className={`knop knop--klein${richting === "in" ? " knop--primair" : ""}`} onClick={() => setRichting("in")}>
              Ontvangst (+)
            </button>
            <button type="button" className={`knop knop--klein${richting === "uit" ? " knop--primair" : ""}`} onClick={() => setRichting("uit")}>
              Uitgave (−)
            </button>
          </div>
          <input type="hidden" name="richting" value={richting} />
        </div>
        <div className="formulier__rij">
          <label htmlFor="bedrag">Bedrag</label>
          <input id="bedrag" name="bedrag" className="veld" inputMode="decimal" value={bedrag} onChange={(e) => setBedrag(e.target.value)} placeholder="0,00" required />
        </div>
      </div>

      <div className="formulier__rij">
        <label htmlFor="omschrijving">Omschrijving (zoals op het uittreksel)</label>
        <input id="omschrijving" name="omschrijving" className="veld" placeholder="leeg = automatisch" />
      </div>

      <div className="formulier__acties">
        <Knop />
      </div>
    </form>
  );
}
