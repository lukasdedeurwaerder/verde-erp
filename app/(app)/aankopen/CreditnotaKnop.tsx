"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { aankoopcreditnotaMaken, type AankoopStatus } from "./acties";

function Knop() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="knop" disabled={pending} style={{ width: "100%" }}>
      {pending ? "Bezig…" : "+ Creditnota van leverancier"}
    </button>
  );
}

export function CreditnotaKnop({ factuurId }: { factuurId: string }) {
  const [s, actie] = useActionState<AankoopStatus, FormData>(async () => aankoopcreditnotaMaken(factuurId), {});
  return (
    <form action={actie} style={{ marginTop: 12 }}>
      {s.fout && <p className="foutmelding">{s.fout}</p>}
      <Knop />
    </form>
  );
}
