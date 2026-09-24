"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { Document, DocumentSoort } from "@/lib/types";
import {
  creditnotaMaken,
  documentAnnuleren,
  documentDefinitiefMaken,
  documentVerwijderen,
  lijnenVernieuwen,
  type DocumentResultaat,
} from "../acties";

function Knop({ tekst, klasse, bevestig }: { tekst: string; klasse: string; bevestig?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={klasse}
      disabled={pending}
      style={{ width: "100%" }}
      onClick={(e) => {
        if (bevestig && !confirm(bevestig)) e.preventDefault();
      }}
    >
      {pending ? "Bezig…" : tekst}
    </button>
  );
}

const BEVESTIG_DEFINITIEF: Partial<Record<DocumentSoort, string>> = {
  leverbon: "Leverbon definitief maken? De goederen gaan uit voorraad en de bestelling wordt geleverd.",
  ontvangstbon: "Ontvangstbon definitief maken? De goederen komen in voorraad en de bestelling wordt geleverd.",
  factuur: "Factuur definitief maken? Daarna kun je ze niet meer wijzigen of annuleren; corrigeren kan enkel met een creditnota.",
  creditnota: "Creditnota definitief maken? Daarna kun je ze niet meer wijzigen of annuleren.",
};

const BEVESTIG_ANNULEREN: Partial<Record<DocumentSoort, string>> = {
  leverbon: "Leverbon annuleren? De goederen gaan terug in voorraad. Het nummer blijft bestaan.",
  ontvangstbon: "Ontvangstbon annuleren? De goederen gaan weer uit voorraad. Het nummer blijft bestaan.",
};

// De knoppen rechts van een document. Wat kan, hangt af van soort en status.
export function DocumentActies({ document: d, magCrediteren }: { document: Document; magCrediteren: boolean }) {
  const [s1, definitief] = useActionState<DocumentResultaat, FormData>(async () => documentDefinitiefMaken(d.id), {});
  const [s2, vernieuw] = useActionState<DocumentResultaat, FormData>(async () => lijnenVernieuwen(d.id), {});
  const [s3, annuleer] = useActionState<DocumentResultaat, FormData>(async () => documentAnnuleren(d.id), {});
  const [s4, verwijder] = useActionState<DocumentResultaat, FormData>(async () => documentVerwijderen(d.id), {});
  const [s5, crediteer] = useActionState<DocumentResultaat, FormData>(async () => creditnotaMaken(d.id), {});
  const fout = s1.fout ?? s2.fout ?? s3.fout ?? s4.fout ?? s5.fout;
  const melding = s1.melding;

  const kanAnnuleren = d.status === "definitief" && d.soort !== "factuur" && d.soort !== "creditnota";

  return (
    <div className="kaart">
      <div className="kaart__kop">
        <h2>Acties</h2>
      </div>
      {fout && <p className="foutmelding" style={{ marginBottom: 12 }}>{fout}</p>}
      {melding && <p className="melding-info" style={{ marginBottom: 12 }}>{melding}</p>}

      <div className="formulier" style={{ gap: 8 }}>
        <a href={`/documenten/${d.id}/pdf`} target="_blank" rel="noopener" className="knop">
          Pdf openen
        </a>
        <a href={`/documenten/${d.id}/pdf?download=1`} className="knop">
          Pdf downloaden
        </a>

        {d.status === "concept" && (
          <>
            <form action={definitief}>
              <Knop
                tekst="Definitief maken"
                klasse="knop knop--primair"
                bevestig={BEVESTIG_DEFINITIEF[d.soort] ?? "Definitief maken? Daarna kan het document niet meer gewijzigd worden en wordt de pdf bewaard."}
              />
            </form>
            <p className="hulptekst">
              Zolang het een concept is, staat er CONCEPT op de pdf. Definitief maken bewaart de pdf en vergrendelt het document.
            </p>
            {d.bestelling_id && d.soort !== "creditnota" && (
              <form action={vernieuw}>
                <Knop tekst="Lijnen vernieuwen uit bestelling" klasse="knop" />
              </form>
            )}
            <form action={verwijder}>
              <Knop tekst="Concept verwijderen" klasse="knop knop--gevaar" bevestig="Dit concept verwijderen?" />
            </form>
          </>
        )}

        {magCrediteren && (
          <form action={crediteer}>
            <Knop tekst="+ Creditnota maken" klasse="knop knop--primair" />
          </form>
        )}

        {kanAnnuleren && (
          <form action={annuleer}>
            <Knop
              tekst="Annuleren"
              klasse="knop knop--gevaar"
              bevestig={BEVESTIG_ANNULEREN[d.soort] ?? "Dit document annuleren? Het nummer blijft bestaan, maar het document telt niet meer mee."}
            />
          </form>
        )}
      </div>
    </div>
  );
}
