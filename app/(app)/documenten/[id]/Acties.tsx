"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { Document } from "@/lib/types";
import { documentAnnuleren, documentDefinitiefMaken, documentVerwijderen, lijnenVernieuwen, type DocumentResultaat } from "../acties";

function Knop({ tekst, klasse, bevestig }: { tekst: string; klasse: string; bevestig?: string }) {
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
      {pending ? "Bezig…" : tekst}
    </button>
  );
}

// De knoppen rechts van een document. Wat kan, hangt af van de status.
export function DocumentActies({ document: d }: { document: Document }) {
  const [s1, definitief] = useActionState<DocumentResultaat, FormData>(async () => documentDefinitiefMaken(d.id), {});
  const [s2, vernieuw] = useActionState<DocumentResultaat, FormData>(async () => lijnenVernieuwen(d.id), {});
  const [s3, annuleer] = useActionState<DocumentResultaat, FormData>(async () => documentAnnuleren(d.id), {});
  const [s4, verwijder] = useActionState<DocumentResultaat, FormData>(async () => documentVerwijderen(d.id), {});
  const fout = s1.fout ?? s2.fout ?? s3.fout ?? s4.fout;

  return (
    <div className="kaart">
      <div className="kaart__kop">
        <h2>Acties</h2>
      </div>
      {fout && <p className="foutmelding" style={{ marginBottom: 12 }}>{fout}</p>}

      <div className="formulier">
        <a href={`/documenten/${d.id}/pdf`} target="_blank" rel="noopener" className="knop">
          Pdf openen
        </a>
        <a href={`/documenten/${d.id}/pdf?download=1`} className="knop">
          Pdf downloaden
        </a>

        {d.status === "concept" && (
          <>
            <form action={definitief}>
              <Knop tekst="Definitief maken" klasse="knop knop--primair" bevestig="Definitief maken? Daarna kan het document niet meer gewijzigd worden en wordt de pdf bewaard." />
            </form>
            <p className="hulptekst">
              Zolang het een concept is, staat er “CONCEPT” op de pdf. Definitief maken bewaart de pdf en vergrendelt het document.
            </p>
            {d.bestelling_id && (
              <form action={vernieuw}>
                <Knop tekst="Lijnen vernieuwen uit bestelling" klasse="knop" />
              </form>
            )}
            <form action={verwijder}>
              <Knop tekst="Concept verwijderen" klasse="knop knop--gevaar" bevestig="Dit concept verwijderen?" />
            </form>
          </>
        )}

        {d.status === "definitief" && (
          <form action={annuleer}>
            <Knop tekst="Annuleren" klasse="knop knop--gevaar" bevestig="Dit document annuleren? Het nummer blijft bestaan, maar het document telt niet meer mee." />
          </form>
        )}
      </div>
    </div>
  );
}
