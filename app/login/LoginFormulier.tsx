"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { inloggen, type LoginStatus } from "./acties";

function Verzendknop() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="knop knop--primair" disabled={pending}>
      {pending ? "Bezig…" : "Inloggen"}
    </button>
  );
}

export function LoginFormulier() {
  const [status, actie] = useActionState<LoginStatus, FormData>(inloggen, {});

  return (
    <form action={actie} className="formulier">
      {status.fout && (
        <p className="foutmelding" role="alert">
          {status.fout}
        </p>
      )}

      <div className="formulier__rij">
        <label htmlFor="email">E-mailadres</label>
        <input
          id="email"
          name="email"
          type="email"
          className="veld"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          required
        />
      </div>

      <div className="formulier__rij">
        <label htmlFor="wachtwoord">Wachtwoord</label>
        <input
          id="wachtwoord"
          name="wachtwoord"
          type="password"
          className="veld"
          autoComplete="current-password"
          required
        />
      </div>

      <Verzendknop />
    </form>
  );
}
