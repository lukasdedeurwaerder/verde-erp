"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { Document, Lijn } from "@/lib/types";
import { LijnenEditor, type ProductKeuze, type RekeningKeuze } from "../bestellingen/LijnenEditor";
import { aankoopfactuurDefinitief, aankoopfactuurOpslaan, aankoopfactuurVerwijderen, type AankoopStatus } from "./acties";

function Knop({ tekst, klasse = "knop knop--primair", bevestig }: { tekst: string; klasse?: string; bevestig?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={klasse}
      disabled={pending}
      onClick={(e) => {
        if (bevestig && !confirm(bevestig)) e.preventDefault();
      }}
    >
      {pending ? "Bezig…" : tekst}
    </button>
  );
}

export function AankoopFormulier({
  document: d,
  lijnen,
  leveranciers,
  producten,
  rekeningen,
  vandaag,
}: {
  document: Document | null;
  lijnen: Lijn[];
  leveranciers: { id: string; naam: string }[];
  producten: ProductKeuze[];
  rekeningen: RekeningKeuze[];
  vandaag: string;
}) {
  const [status, actie] = useActionState<AankoopStatus, FormData>(aankoopfactuurOpslaan.bind(null, d?.id ?? null), {});
  const [s2, definitief] = useActionState<AankoopStatus, FormData>(async () => (d ? aankoopfactuurDefinitief(d.id) : {}), {});
  const [s3, verwijder] = useActionState<AankoopStatus, FormData>(async () => (d ? aankoopfactuurVerwijderen(d.id) : {}), {});
  const fout = status.fout ?? s2.fout ?? s3.fout;

  return (
    <div className="kaart">
      <form action={actie} className="formulier">
        {fout && <p className="foutmelding" role="alert">{fout}</p>}
        {status.goed && <p className="melding-goed">{status.goed}</p>}

        <div className="formulier__kolommen formulier__kolommen--3">
          <div className="formulier__rij" style={{ gridColumn: "span 2" }}>
            <label htmlFor="relatie_id">Leverancier *</label>
            <select id="relatie_id" name="relatie_id" className="veld" defaultValue={d?.relatie_id ?? ""} required>
              <option value="">— kies —</option>
              {leveranciers.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.naam}
                </option>
              ))}
            </select>
            {leveranciers.length === 0 && (
              <span className="hulptekst">
                Nog geen leveranciers. Maak er eerst een aan bij <Link href="/leveranciers/nieuw">Leveranciers</Link>.
              </span>
            )}
          </div>
          <div className="formulier__rij">
            <label htmlFor="extern_nummer">Factuurnummer leverancier *</label>
            <input id="extern_nummer" name="extern_nummer" className="veld" defaultValue={d?.extern_nummer ?? ""} placeholder="zoals op hun factuur" />
          </div>
        </div>

        <div className="formulier__kolommen formulier__kolommen--3">
          <div className="formulier__rij">
            <label htmlFor="datum">Factuurdatum *</label>
            <input id="datum" name="datum" type="date" className="veld" defaultValue={d?.datum ?? vandaag} required />
          </div>
          <div className="formulier__rij">
            <label htmlFor="vervaldatum">Vervaldatum</label>
            <input id="vervaldatum" name="vervaldatum" type="date" className="veld" defaultValue={d?.vervaldatum ?? ""} />
          </div>
          <div className="formulier__rij">
            <label htmlFor="bijlage">Pdf van de leverancier</label>
            <input id="bijlage" name="bijlage" type="file" accept="application/pdf" />
            {d?.pdf_pad && (
              <a href={`/documenten/${d.id}/pdf`} target="_blank" rel="noopener" className="hulptekst">
                Huidige bijlage bekijken
              </a>
            )}
          </div>
        </div>

        <div className="formulier__rij">
          <label>Lijnen</label>
          <p className="hulptekst" style={{ marginBottom: 6 }}>
            Goederen voor de verkoop boek je op 604 Aankopen. Kies voor andere kosten de juiste rekening: huur (610),
            drukwerk en kantoor (616), publiciteit (614), een machine (230), …
          </p>
          <LijnenEditor soort="aankoop" producten={producten} begin={lijnen} rekeningen={rekeningen} />
        </div>

        <div className="formulier__rij">
          <label htmlFor="opmerking">Opmerking</label>
          <textarea id="opmerking" name="opmerking" className="veld" defaultValue={d?.opmerking ?? ""} />
        </div>

        <div className="formulier__acties">
          <Knop tekst={d ? "Bewaren" : "Aankoopfactuur registreren"} />
          <Link href="/aankopen" className="knop">
            {d ? "← Overzicht" : "Annuleren"}
          </Link>
        </div>
      </form>

      {d && (
        <div className="formulier__acties" style={{ marginTop: 16, borderTop: "1px solid var(--rand-zacht)", paddingTop: 16 }}>
          <form action={definitief}>
            <Knop tekst="Definitief maken en boeken" bevestig="Definitief maken? De factuur komt in het dagboek aankopen en kan daarna niet meer gewijzigd worden. Bewaar eerst je wijzigingen." />
          </form>
          <form action={verwijder}>
            <Knop tekst="Concept verwijderen" klasse="knop knop--gevaar" bevestig="Dit concept verwijderen?" />
          </form>
        </div>
      )}
    </div>
  );
}
