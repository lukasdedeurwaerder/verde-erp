"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { voorraadOpBalans, type BoekStatus } from "../dagboeken/acties";

function Knop() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="knop" disabled={pending} style={{ width: "100%" }}>
      {pending ? "Bezig…" : "Voorraad op de balans bijwerken"}
    </button>
  );
}

// Eindejaarsverrichting in het klein: rekening 340 gelijkzetten met de
// werkelijke voorraad tegen aankoopprijs. Het verschil gaat naar 6094.
export function VoorraadKnop({ tot }: { tot: string }) {
  const [status, actie] = useActionState<BoekStatus, FormData>(voorraadOpBalans, {});
  return (
    <form action={actie} className="formulier" style={{ gap: 8 }}>
      <input type="hidden" name="datum" value={tot} />
      {status.fout && <p className="foutmelding">{status.fout}</p>}
      {status.goed && <p className="melding-goed">{status.goed}</p>}
      <Knop />
      <p className="hulptekst">
        Aankopen van handelsgoederen staan als kost op 604. De voorraad die je nog hebt, is echter een bezit. Deze knop
        boekt het verschil tussen de voorraad en rekening 340, met 6094 Voorraadwijziging als tegenrekening.
      </p>
    </form>
  );
}
