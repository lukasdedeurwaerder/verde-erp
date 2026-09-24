"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { DocumentSoort } from "@/lib/types";
import { documentMakenVanBestelling, type BestellingStatusResultaat } from "./acties";

function Knop({ label, primair }: { label: string; primair: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={`knop${primair ? " knop--primair" : ""}`} disabled={pending} style={{ width: "100%" }}>
      {pending ? "Bezig…" : `+ ${label} maken`}
    </button>
  );
}

/** Eén knop "Offerte maken", "Leverbon maken", ... naast een bestelling. */
export function MaakDocumentKnop({
  bestellingId,
  soort,
  label,
  primair = false,
}: {
  bestellingId: string;
  soort: DocumentSoort;
  label: string;
  primair?: boolean;
}) {
  const [status, actie] = useActionState<BestellingStatusResultaat, FormData>(
    async () => documentMakenVanBestelling(bestellingId, soort),
    {},
  );
  return (
    <form action={actie}>
      {status.fout && <p className="foutmelding" style={{ marginBottom: 8 }}>{status.fout}</p>}
      <Knop label={label} primair={primair} />
    </form>
  );
}
