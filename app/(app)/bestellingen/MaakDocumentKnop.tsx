"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { documentMakenVanBestelling, type BestellingStatusResultaat } from "./acties";

function Knop({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="knop knop--primair" disabled={pending}>
      {pending ? "Bezig…" : `+ ${label} maken`}
    </button>
  );
}

/** De knop "Offerte maken" of "Bestelbon maken" naast een bestelling. */
export function MaakDocumentKnop({ bestellingId, label }: { bestellingId: string; label: string }) {
  const [status, actie] = useActionState<BestellingStatusResultaat, FormData>(
    async () => documentMakenVanBestelling(bestellingId),
    {},
  );
  return (
    <form action={actie} style={{ marginTop: 14 }}>
      {status.fout && <p className="foutmelding" style={{ marginBottom: 10 }}>{status.fout}</p>}
      <Knop label={label} />
      <p className="hulptekst" style={{ marginTop: 8 }}>
        Neemt de lijnen van deze bestelling over. Bewaar eerst je wijzigingen.
      </p>
    </form>
  );
}
