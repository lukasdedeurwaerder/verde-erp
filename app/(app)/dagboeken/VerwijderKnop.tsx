"use client";

import { useState, useTransition } from "react";
import { boekingVerwijderen } from "./acties";

/** Kleine knop om een financiële of diverse boeking te verwijderen. */
export function VerwijderKnop({ id, uitleg }: { id: string; uitleg: string }) {
  const [bezig, start] = useTransition();
  const [fout, setFout] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        className="knop knop--klein knop--tekst"
        style={{ color: "var(--fout)" }}
        disabled={bezig}
        title="Boeking verwijderen"
        onClick={() => {
          if (!confirm(uitleg)) return;
          start(async () => {
            const r = await boekingVerwijderen(id);
            if (r.fout) setFout(r.fout);
          });
        }}
      >
        {bezig ? "…" : "Verwijderen"}
      </button>
      {fout && <span className="foutmelding">{fout}</span>}
    </>
  );
}
