"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { euro } from "@/lib/geld";
import type { Document, Lijn } from "@/lib/types";
import { LijnenEditor, type ProductKeuze } from "../../bestellingen/LijnenEditor";
import { creditnotaOpslaan, type DocumentResultaat } from "../acties";

function Knop() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="knop knop--primair" disabled={pending}>
      {pending ? "Bezig…" : "Bewaren"}
    </button>
  );
}

// Een concept-creditnota bewerken. Ze begint met alle lijnen van de
// factuur; de student houdt enkel over wat gecrediteerd wordt.
export function CreditnotaFormulier({
  document: d,
  lijnen,
  producten,
  factuurNummer,
  maxCredit,
}: {
  document: Document;
  lijnen: Lijn[];
  producten: ProductKeuze[];
  factuurNummer: string | null;
  maxCredit: number | null;
}) {
  const [status, actie] = useActionState<DocumentResultaat, FormData>(creditnotaOpslaan.bind(null, d.id), {});

  return (
    <div className="kaart">
      <form action={actie} className="formulier">
        {status.fout && <p className="foutmelding" role="alert">{status.fout}</p>}
        {status.melding && <p className="melding-goed">{status.melding}</p>}

        <div className="formulier__kolommen formulier__kolommen--3">
          <div className="formulier__rij">
            <label htmlFor="datum">Datum</label>
            <input id="datum" name="datum" type="date" className="veld" defaultValue={d.datum} required />
          </div>
          <div className="formulier__rij">
            <span className="label">Betreft factuur</span>
            <span style={{ padding: "9px 0" }}>{factuurNummer}</span>
          </div>
          {maxCredit !== null && (
            <div className="formulier__rij">
              <span className="label">Nog te crediteren (incl. btw)</span>
              <span style={{ padding: "9px 0" }}>{euro(maxCredit)}</span>
            </div>
          )}
        </div>

        <div className="formulier__rij">
          <label>Lijnen</label>
          <LijnenEditor soort="verkoop" producten={producten} begin={lijnen} />
        </div>

        <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 500, color: "var(--tekst)" }}>
          <input type="checkbox" name="voorraad_terug" defaultChecked={d.voorraad_terug} />
          Retour: de goederen op deze creditnota komen terug in voorraad
        </label>

        <div className="formulier__rij">
          <label htmlFor="opmerking">Reden of opmerking (komt op de creditnota)</label>
          <textarea id="opmerking" name="opmerking" className="veld" defaultValue={d.opmerking ?? ""} placeholder="bv. Twee stuks beschadigd geleverd" />
        </div>

        <div className="formulier__acties">
          <Knop />
          <span className="hulptekst">Bewaar je wijzigingen voor je de creditnota definitief maakt.</span>
        </div>
      </form>
    </div>
  );
}
