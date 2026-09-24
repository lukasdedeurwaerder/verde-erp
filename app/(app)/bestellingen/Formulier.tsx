"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { SOORT_LABEL, STATUS_LABEL } from "@/lib/bestelling";
import { BESTELLING_STATUSSEN, type Bestelling, type BestellingSoort, type Lijn } from "@/lib/types";
import { LijnenEditor, type ProductKeuze } from "./LijnenEditor";
import type { BestellingStatusResultaat } from "./acties";

export type RelatieKeuze = { id: string; naam: string; gemeente: string | null };
export type PersoonKeuze = { id: string; naam: string; rol: string };

function Opslaanknop({ nieuw }: { nieuw: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="knop knop--primair" disabled={pending}>
      {pending ? "Bezig…" : nieuw ? "Bestelling aanmaken" : "Opslaan"}
    </button>
  );
}

function Verwijderknop() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="knop knop--gevaar"
      disabled={pending}
      onClick={(e) => {
        if (!confirm("Deze bestelling verwijderen? Hangen er al documenten aan, dan wordt ze geannuleerd in plaats van verwijderd.")) e.preventDefault();
      }}
    >
      Verwijderen
    </button>
  );
}

export function BestellingFormulier({
  soort,
  bestelling,
  lijnen,
  relaties,
  personen,
  producten,
  huidigeGebruikerId,
  vandaag,
  opslaan,
  verwijderen,
}: {
  soort: BestellingSoort;
  bestelling: Bestelling | null;
  lijnen: Lijn[];
  relaties: RelatieKeuze[];
  personen: PersoonKeuze[];
  producten: ProductKeuze[];
  huidigeGebruikerId: string;
  vandaag: string;
  opslaan: (vorige: BestellingStatusResultaat, form: FormData) => Promise<BestellingStatusResultaat>;
  verwijderen?: () => Promise<BestellingStatusResultaat>;
}) {
  const [status, actie] = useActionState<BestellingStatusResultaat, FormData>(opslaan, {});
  const [wisStatus, wisActie] = useActionState<BestellingStatusResultaat, FormData>(
    async () => (verwijderen ? verwijderen() : {}),
    {},
  );
  const nieuw = bestelling === null;
  const b = bestelling;
  const t = SOORT_LABEL[soort];
  const vergrendeld = b?.status === "gefactureerd";

  return (
    <div className="kaart">
      <form action={actie} className="formulier">
        {(status.fout || wisStatus.fout) && (
          <p className="foutmelding" role="alert">
            {status.fout ?? wisStatus.fout}
          </p>
        )}
        {vergrendeld && (
          <p className="melding-info">Deze bestelling is gefactureerd. De lijnen liggen vast.</p>
        )}

        <div className="formulier__kolommen formulier__kolommen--3">
          <div className="formulier__rij" style={{ gridColumn: "span 2" }}>
            <label htmlFor="relatie_id">{t.relatie} *</label>
            <select id="relatie_id" name="relatie_id" className="veld" defaultValue={b?.relatie_id ?? ""} required>
              <option value="">— kies —</option>
              {relaties.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.naam}
                  {r.gemeente ? ` (${r.gemeente})` : ""}
                </option>
              ))}
            </select>
            {relaties.length === 0 && (
              <span className="hulptekst">
                Nog geen {t.relatie.toLowerCase()}en. Maak er eerst een aan bij{" "}
                <Link href={soort === "verkoop" ? "/klanten/nieuw" : "/leveranciers/nieuw"}>
                  {soort === "verkoop" ? "Klanten" : "Leveranciers"}
                </Link>
                .
              </span>
            )}
          </div>
          <div className="formulier__rij">
            <label htmlFor="verantwoordelijke_id">Verantwoordelijke</label>
            <select id="verantwoordelijke_id" name="verantwoordelijke_id" className="veld" defaultValue={b?.verantwoordelijke_id ?? huidigeGebruikerId}>
              <option value="">— niemand —</option>
              {personen.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.naam}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="formulier__kolommen formulier__kolommen--3">
          <div className="formulier__rij">
            <label htmlFor="datum">Datum *</label>
            <input id="datum" name="datum" type="date" className="veld" defaultValue={b?.datum ?? vandaag} required />
          </div>
          <div className="formulier__rij">
            <label htmlFor="gewenste_leverdatum">Gewenste leverdatum</label>
            <input id="gewenste_leverdatum" name="gewenste_leverdatum" type="date" className="veld" defaultValue={b?.gewenste_leverdatum ?? ""} />
          </div>
          {!nieuw && (
            <div className="formulier__rij">
              <label htmlFor="status">Status</label>
              <select id="status" name="status" className="veld" defaultValue={b?.status}>
                {BESTELLING_STATUSSEN.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="formulier__rij">
          <label>Lijnen</label>
          <LijnenEditor soort={soort} producten={producten} begin={lijnen} vergrendeld={vergrendeld} />
        </div>

        <div className="formulier__rij">
          <label htmlFor="opmerking">Opmerking (komt op de {t.documentLabel.toLowerCase()})</label>
          <textarea id="opmerking" name="opmerking" className="veld" defaultValue={b?.opmerking ?? ""} />
        </div>

        <div className="formulier__acties">
          <Opslaanknop nieuw={nieuw} />
          <Link href="/bestellingen" className="knop">
            {nieuw ? "Annuleren" : "← Overzicht"}
          </Link>
        </div>
      </form>

      {!nieuw && verwijderen && !vergrendeld && (
        <form action={wisActie} className="formulier__acties" style={{ marginTop: 16, borderTop: "1px solid var(--rand-zacht)", paddingTop: 16 }}>
          <Verwijderknop />
        </form>
      )}
    </div>
  );
}
