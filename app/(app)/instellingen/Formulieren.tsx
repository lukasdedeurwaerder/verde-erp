"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { Bedrijf, Instellingen, Profiel } from "@/lib/types";
import {
  bedrijfOpslaan,
  gebruikerAanmaken,
  gebruikerBijwerken,
  gebruikersBulk,
  gebruikerVerwijderen,
  instellingenOpslaan,
  wachtwoordInstellen,
  type BulkStatus,
  type Status,
} from "./acties";

function Knop({ tekst, klasse = "knop knop--primair" }: { tekst: string; klasse?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={klasse} disabled={pending}>
      {pending ? "Bezig…" : tekst}
    </button>
  );
}

function Melding({ status }: { status: Status }) {
  if (status.fout) return <p className="foutmelding" role="alert">{status.fout}</p>;
  if (status.goed) return <p className="melding-goed">{status.goed}</p>;
  return null;
}

// ---------- Dossier ----------

export function InstellingenFormulier({ instellingen }: { instellingen: Instellingen }) {
  const [status, actie] = useActionState<Status, FormData>(instellingenOpslaan, {});
  const i = instellingen;
  return (
    <form action={actie} className="formulier">
      <Melding status={status} />
      <div className="formulier__kolommen formulier__kolommen--3">
        <div className="formulier__rij">
          <label htmlFor="moeder_naam">Naam moederbedrijf</label>
          <input id="moeder_naam" name="moeder_naam" className="veld" defaultValue={i.moeder_naam} required />
        </div>
        <div className="formulier__rij">
          <label htmlFor="iban">Gedeelde bankrekening (IBAN)</label>
          <input id="iban" name="iban" className="veld" defaultValue={i.iban ?? ""} placeholder="BE.." />
        </div>
        <div className="formulier__rij">
          <label htmlFor="bic">BIC</label>
          <input id="bic" name="bic" className="veld" defaultValue={i.bic ?? ""} />
        </div>
      </div>
      <div className="formulier__kolommen">
        <div className="formulier__rij">
          <label htmlFor="betaaltermijn_dagen">Standaard betaaltermijn (dagen)</label>
          <input id="betaaltermijn_dagen" name="betaaltermijn_dagen" className="veld" inputMode="numeric" defaultValue={i.betaaltermijn_dagen} />
        </div>
        <div className="formulier__rij">
          <label htmlFor="factuur_voettekst">Voettekst op documenten</label>
          <input id="factuur_voettekst" name="factuur_voettekst" className="veld" defaultValue={i.factuur_voettekst ?? ""} placeholder="bv. Studentenbedrijf in het kader van het vak Ondernemen" />
        </div>
      </div>
      <div className="formulier__acties">
        <Knop tekst="Bewaren" />
      </div>
    </form>
  );
}

// ---------- Bedrijf ----------

export function BedrijfFormulier({ bedrijf }: { bedrijf: Bedrijf }) {
  const [status, actie] = useActionState<Status, FormData>(bedrijfOpslaan.bind(null, bedrijf.id), {});
  const b = bedrijf;
  return (
    <form action={actie} className="formulier">
      <Melding status={status} />
      <div className="formulier__kolommen formulier__kolommen--3">
        <div className="formulier__rij" style={{ gridColumn: "span 2" }}>
          <label htmlFor={`naam-${b.id}`}>Naam</label>
          <input id={`naam-${b.id}`} name="naam" className="veld" defaultValue={b.naam} required />
        </div>
        <div className="formulier__rij">
          <label htmlFor={`kleur-${b.id}`}>Kleur</label>
          <input id={`kleur-${b.id}`} name="kleur" type="color" className="veld" defaultValue={b.kleur} style={{ height: 40, padding: 4 }} />
        </div>
      </div>
      <div className="formulier__rij">
        <label htmlFor={`straat-${b.id}`}>Straat en nummer</label>
        <input id={`straat-${b.id}`} name="straat" className="veld" defaultValue={b.straat ?? ""} />
      </div>
      <div className="formulier__kolommen formulier__kolommen--3">
        <div className="formulier__rij">
          <label htmlFor={`postcode-${b.id}`}>Postcode</label>
          <input id={`postcode-${b.id}`} name="postcode" className="veld" defaultValue={b.postcode ?? ""} />
        </div>
        <div className="formulier__rij">
          <label htmlFor={`gemeente-${b.id}`}>Gemeente</label>
          <input id={`gemeente-${b.id}`} name="gemeente" className="veld" defaultValue={b.gemeente ?? ""} />
        </div>
        <div className="formulier__rij">
          <label htmlFor={`btw-${b.id}`}>Btw-nummer</label>
          <input id={`btw-${b.id}`} name="btw_nummer" className="veld" defaultValue={b.btw_nummer ?? ""} />
        </div>
      </div>
      <div className="formulier__kolommen">
        <div className="formulier__rij">
          <label htmlFor={`email-${b.id}`}>E-mail</label>
          <input id={`email-${b.id}`} name="email" type="email" className="veld" defaultValue={b.email ?? ""} />
        </div>
        <div className="formulier__rij">
          <label htmlFor={`telefoon-${b.id}`}>Telefoon</label>
          <input id={`telefoon-${b.id}`} name="telefoon" className="veld" defaultValue={b.telefoon ?? ""} />
        </div>
      </div>
      <div className="formulier__acties">
        <Knop tekst="Bewaren" />
      </div>
    </form>
  );
}

// ---------- Gebruikers ----------

export function GebruikerNieuwFormulier({ bedrijven }: { bedrijven: Bedrijf[] }) {
  const [status, actie] = useActionState<Status, FormData>(gebruikerAanmaken, {});
  return (
    <form action={actie} className="formulier">
      <Melding status={status} />
      <div className="formulier__kolommen formulier__kolommen--3">
        <div className="formulier__rij">
          <label htmlFor="n-naam">Naam</label>
          <input id="n-naam" name="naam" className="veld" required />
        </div>
        <div className="formulier__rij">
          <label htmlFor="n-email">E-mailadres</label>
          <input id="n-email" name="email" type="email" className="veld" required />
        </div>
        <div className="formulier__rij">
          <label htmlFor="n-wachtwoord">Startwachtwoord</label>
          <input id="n-wachtwoord" name="wachtwoord" className="veld" minLength={8} required autoComplete="off" />
        </div>
        <div className="formulier__rij">
          <label htmlFor="n-rol">Rol</label>
          <select id="n-rol" name="rol" className="veld" defaultValue="student">
            <option value="student">Student</option>
            <option value="docent">Docent</option>
          </select>
        </div>
        <div className="formulier__rij">
          <label htmlFor="n-bedrijf">Bedrijf (voor studenten)</label>
          <select id="n-bedrijf" name="bedrijf_id" className="veld" defaultValue="">
            <option value="">— kies —</option>
            {bedrijven.map((b) => (
              <option key={b.id} value={b.id}>
                {b.naam}
              </option>
            ))}
          </select>
        </div>
        <div className="formulier__rij">
          <label>&nbsp;</label>
          <Knop tekst="Account aanmaken" />
        </div>
      </div>
      <p className="hulptekst">
        Geef het startwachtwoord in de les door. De student kan het daarna zelf wijzigen.
      </p>
    </form>
  );
}

export function GebruikerRij({
  profiel,
  bedrijven,
  isIkzelf,
}: {
  profiel: Profiel;
  bedrijven: Bedrijf[];
  isIkzelf: boolean;
}) {
  const [status, actie] = useActionState<Status, FormData>(gebruikerBijwerken.bind(null, profiel.id), {});
  const [wwStatus, wwActie] = useActionState<Status, FormData>(wachtwoordInstellen.bind(null, profiel.id), {});
  const [wisStatus, wisActie] = useActionState<Status, FormData>(gebruikerVerwijderen.bind(null, profiel.id), {});
  const p = profiel;
  const formId = `g-${p.id}`;

  return (
    <>
      <tr style={{ opacity: p.actief ? 1 : 0.6 }}>
        <td>
          <input form={formId} name="naam" className="veld" defaultValue={p.naam} required style={{ minWidth: 160 }} />
          <div className="hulptekst">{p.email}</div>
        </td>
        <td>
          <select form={formId} name="rol" className="veld" defaultValue={p.rol} disabled={isIkzelf} style={{ minWidth: 110 }}>
            <option value="student">Student</option>
            <option value="docent">Docent</option>
          </select>
        </td>
        <td>
          <select form={formId} name="bedrijf_id" className="veld" defaultValue={p.bedrijf_id ?? ""} disabled={isIkzelf} style={{ minWidth: 140 }}>
            <option value="">—</option>
            {bedrijven.map((b) => (
              <option key={b.id} value={b.id}>
                {b.naam}
              </option>
            ))}
          </select>
        </td>
        <td>
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontWeight: 500 }}>
            <input form={formId} type="checkbox" name="actief" defaultChecked={p.actief} disabled={isIkzelf} />
            Actief
          </label>
        </td>
        <td>
          <form id={formId} action={actie} style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <Knop tekst="Bewaren" klasse="knop knop--klein knop--primair" />
          </form>
        </td>
        <td>
          <form action={wwActie} style={{ display: "flex", gap: 6 }}>
            <input name="wachtwoord" className="veld" placeholder="Nieuw wachtwoord" minLength={8} required autoComplete="off" style={{ width: 160 }} />
            <Knop tekst="Instellen" klasse="knop knop--klein" />
          </form>
        </td>
        <td>
          {!isIkzelf && (
            <form
              action={wisActie}
              onSubmit={(e) => {
                if (!confirm(`Account van ${p.naam} definitief verwijderen?`)) e.preventDefault();
              }}
            >
              <Knop tekst="Verwijderen" klasse="knop knop--klein knop--gevaar" />
            </form>
          )}
        </td>
      </tr>
      {(status.fout || status.goed || wwStatus.fout || wwStatus.goed || wisStatus.fout || wisStatus.goed) && (
        <tr>
          <td colSpan={7} style={{ paddingTop: 0 }}>
            <Melding status={status} />
            <Melding status={wwStatus} />
            <Melding status={wisStatus} />
          </td>
        </tr>
      )}
    </>
  );
}

// ---------- Meerdere accounts tegelijk ----------

export function GebruikersBulkFormulier({ bedrijven }: { bedrijven: Bedrijf[] }) {
  const [status, actie] = useActionState<BulkStatus, FormData>(gebruikersBulk, {});
  const ok = (status.resultaten ?? []).filter((r) => r.ok).length;
  return (
    <form action={actie} className="formulier">
      {status.fout && <p className="foutmelding">{status.fout}</p>}
      {status.resultaten && (
        <div className={ok === status.resultaten.length ? "melding-goed" : "melding-info"}>
          {ok} van {status.resultaten.length} accounts aangemaakt.
          {status.resultaten.some((r) => !r.ok) && (
            <ul style={{ margin: "6px 0 0", paddingLeft: 20 }}>
              {status.resultaten
                .filter((r) => !r.ok)
                .map((r) => (
                  <li key={r.regel}>
                    <code>{r.regel}</code>: {r.melding}
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}
      <div className="formulier__rij">
        <label htmlFor="bulk-regels">Eén student per regel: naam; e-mailadres; bedrijf</label>
        <textarea
          id="bulk-regels"
          name="regels"
          className="veld"
          style={{ minHeight: 140, fontFamily: "ui-monospace, Consolas, monospace", fontSize: 13 }}
          placeholder={`Emma Janssens; emma.janssens@student.be; A
Noah Claes; noah.claes@student.be; B`}
        />
        <span className="hulptekst">
          Het bedrijf is A of B ({bedrijven.map((b, i) => `${String.fromCharCode(65 + i)} = ${b.naam}`).join(", ")}) of de naam
          van het bedrijf. Rechtstreeks uit Excel plakken kan ook: drie kolommen, zonder titelrij.
        </span>
      </div>
      <div className="formulier__kolommen formulier__kolommen--3">
        <div className="formulier__rij">
          <label htmlFor="bulk-ww">Startwachtwoord voor iedereen</label>
          <input id="bulk-ww" name="wachtwoord" className="veld" minLength={8} required autoComplete="off" />
        </div>
        <div className="formulier__rij">
          <label>&nbsp;</label>
          <Knop tekst="Accounts aanmaken" />
        </div>
      </div>
    </form>
  );
}
