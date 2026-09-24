"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { wachtwoordWijzigen, type WachtwoordStatus } from "./acties";

function Knop() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="knop knop--primair" disabled={pending}>
      {pending ? "Bezig…" : "Wachtwoord wijzigen"}
    </button>
  );
}

export function WachtwoordFormulier() {
  const [status, actie] = useActionState<WachtwoordStatus, FormData>(wachtwoordWijzigen, {});

  return (
    <form action={actie} className="formulier">
      {status.fout && <p className="foutmelding" role="alert">{status.fout}</p>}
      {status.goed && <p className="melding-goed">{status.goed}</p>}

      <div className="formulier__rij">
        <label htmlFor="nieuw">Nieuw wachtwoord</label>
        <input id="nieuw" name="nieuw" type="password" className="veld" minLength={8} required autoComplete="new-password" />
      </div>
      <div className="formulier__rij">
        <label htmlFor="herhaal">Nog eens, ter controle</label>
        <input id="herhaal" name="herhaal" type="password" className="veld" minLength={8} required autoComplete="new-password" />
      </div>
      <div className="formulier__acties">
        <Knop />
      </div>
    </form>
  );
}
