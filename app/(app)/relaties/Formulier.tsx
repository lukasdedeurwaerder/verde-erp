"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { Relatie } from "@/lib/types";
import type { RelatieStatus } from "./acties";
import { padVoor, type Pagina } from "./soort";

function Opslaanknop({ nieuw }: { nieuw: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="knop knop--primair" disabled={pending}>
      {pending ? "Bezig…" : nieuw ? "Aanmaken" : "Opslaan"}
    </button>
  );
}

function Verwijderknop({ naam }: { naam: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="knop knop--gevaar"
      disabled={pending}
      onClick={(e) => {
        if (!confirm(`"${naam}" verwijderen? Zit de fiche al aan een bestelling vast, dan wordt ze inactief gezet.`)) {
          e.preventDefault();
        }
      }}
    >
      Verwijderen
    </button>
  );
}

export function RelatieFormulier({
  pagina,
  relatie,
  opslaan,
  verwijderen,
}: {
  pagina: Pagina;
  relatie: Relatie | null;
  opslaan: (vorige: RelatieStatus, form: FormData) => Promise<RelatieStatus>;
  verwijderen?: () => Promise<RelatieStatus>;
}) {
  const [status, actie] = useActionState<RelatieStatus, FormData>(opslaan, {});
  const [wisStatus, wisActie] = useActionState<RelatieStatus, FormData>(
    async () => (verwijderen ? verwijderen() : {}),
    {},
  );
  const nieuw = relatie === null;
  const r = relatie;

  return (
    <div className="kaart" style={{ maxWidth: 760 }}>
      <form action={actie} className="formulier">
        {(status.fout || wisStatus.fout) && (
          <p className="foutmelding" role="alert">
            {status.fout ?? wisStatus.fout}
          </p>
        )}

        <div className="formulier__kolommen">
          <div className="formulier__rij">
            <label htmlFor="naam">Naam *</label>
            <input id="naam" name="naam" className="veld" defaultValue={r?.naam ?? ""} required autoFocus />
          </div>
          <div className="formulier__rij">
            <label htmlFor="soort">Soort</label>
            <select id="soort" name="soort" className="veld" defaultValue={r?.soort ?? pagina}>
              <option value="klant">Klant</option>
              <option value="leverancier">Leverancier</option>
              <option value="beide">Klant én leverancier</option>
            </select>
          </div>
        </div>

        <div className="formulier__kolommen formulier__kolommen--3">
          <div className="formulier__rij">
            <label htmlFor="contactpersoon">Contactpersoon</label>
            <input id="contactpersoon" name="contactpersoon" className="veld" defaultValue={r?.contactpersoon ?? ""} />
          </div>
          <div className="formulier__rij">
            <label htmlFor="email">E-mail</label>
            <input id="email" name="email" type="email" className="veld" defaultValue={r?.email ?? ""} />
          </div>
          <div className="formulier__rij">
            <label htmlFor="telefoon">Telefoon</label>
            <input id="telefoon" name="telefoon" className="veld" defaultValue={r?.telefoon ?? ""} />
          </div>
        </div>

        <div className="formulier__rij">
          <label htmlFor="straat">Straat en nummer</label>
          <input id="straat" name="straat" className="veld" defaultValue={r?.straat ?? ""} />
        </div>

        <div className="formulier__kolommen formulier__kolommen--3">
          <div className="formulier__rij">
            <label htmlFor="postcode">Postcode</label>
            <input id="postcode" name="postcode" className="veld" defaultValue={r?.postcode ?? ""} />
          </div>
          <div className="formulier__rij">
            <label htmlFor="gemeente">Gemeente</label>
            <input id="gemeente" name="gemeente" className="veld" defaultValue={r?.gemeente ?? ""} />
          </div>
          <div className="formulier__rij">
            <label htmlFor="land">Land</label>
            <input id="land" name="land" className="veld" defaultValue={r?.land ?? "België"} />
          </div>
        </div>

        <div className="formulier__kolommen">
          <div className="formulier__rij">
            <label htmlFor="btw_nummer">Btw-nummer</label>
            <input id="btw_nummer" name="btw_nummer" className="veld" placeholder="BE 0123.456.789" defaultValue={r?.btw_nummer ?? ""} />
          </div>
          <div className="formulier__rij">
            <label htmlFor="betaaltermijn_dagen">Betaaltermijn (dagen)</label>
            <input id="betaaltermijn_dagen" name="betaaltermijn_dagen" className="veld" inputMode="numeric" placeholder="standaard uit de instellingen" defaultValue={r?.betaaltermijn_dagen ?? ""} />
          </div>
        </div>

        <div className="formulier__rij">
          <label htmlFor="opmerkingen">Opmerkingen</label>
          <textarea id="opmerkingen" name="opmerkingen" className="veld" defaultValue={r?.opmerkingen ?? ""} />
        </div>

        {!nieuw && (
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="checkbox" name="actief" defaultChecked={r?.actief ?? true} />
            Actief (inactieve fiches verschijnen niet meer in keuzelijsten)
          </label>
        )}

        <div className="formulier__acties">
          <Opslaanknop nieuw={nieuw} />
          <Link href={padVoor(pagina)} className="knop">
            Annuleren
          </Link>
        </div>
      </form>

      {!nieuw && verwijderen && (
        <form action={wisActie} className="formulier__acties" style={{ marginTop: 16, borderTop: "1px solid var(--rand-zacht)", paddingTop: 16 }}>
          <Verwijderknop naam={r?.naam ?? ""} />
        </form>
      )}
    </div>
  );
}
