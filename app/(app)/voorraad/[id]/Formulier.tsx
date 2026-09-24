"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { voorraadAanpassen, type VoorraadStatus } from "../acties";

function Knop() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="knop knop--primair" disabled={pending}>
      {pending ? "Bezig…" : "Registreren"}
    </button>
  );
}

export function VoorraadFormulier({ productId, eenheid, vandaag }: { productId: string; eenheid: string; vandaag: string }) {
  const [status, actie] = useActionState<VoorraadStatus, FormData>(voorraadAanpassen.bind(null, productId), {});
  const [wijze, setWijze] = useState<"beginvoorraad" | "telling">("beginvoorraad");

  return (
    <form action={actie} className="formulier">
      {status.fout && <p className="foutmelding" role="alert">{status.fout}</p>}
      {status.goed && <p className="melding-goed">{status.goed}</p>}

      <div className="schakel" role="radiogroup">
        <label className={`knop knop--klein${wijze === "beginvoorraad" ? " knop--primair" : ""}`}>
          <input type="radio" name="wijze" value="beginvoorraad" checked={wijze === "beginvoorraad"} onChange={() => setWijze("beginvoorraad")} hidden />
          Beginvoorraad
        </label>
        <label className={`knop knop--klein${wijze === "telling" ? " knop--primair" : ""}`}>
          <input type="radio" name="wijze" value="telling" checked={wijze === "telling"} onChange={() => setWijze("telling")} hidden />
          Telling
        </label>
      </div>
      <p className="hulptekst">
        {wijze === "beginvoorraad"
          ? "Wat er bij de start aanwezig is. Het aantal komt bij de huidige voorraad."
          : "Wat je werkelijk geteld hebt. Het verschil met de huidige voorraad wordt als correctie geboekt."}
      </p>

      <div className="formulier__kolommen formulier__kolommen--3">
        <div className="formulier__rij">
          <label htmlFor="aantal">{wijze === "beginvoorraad" ? "Aantal erbij" : "Geteld"} ({eenheid})</label>
          <input id="aantal" name="aantal" className="veld" inputMode="decimal" required />
        </div>
        <div className="formulier__rij">
          <label htmlFor="datum">Datum</label>
          <input id="datum" name="datum" type="date" className="veld" defaultValue={vandaag} required />
        </div>
      </div>
      <div className="formulier__rij">
        <label htmlFor="opmerking">Opmerking</label>
        <input id="opmerking" name="opmerking" className="veld" placeholder={wijze === "telling" ? "bv. 2 stuks beschadigd" : ""} />
      </div>
      <div className="formulier__acties">
        <Knop />
      </div>
    </form>
  );
}
