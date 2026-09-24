import { vereistDocent } from "@/lib/sessie";
import { supabaseServer } from "@/lib/supabase/server";
import type { Profiel } from "@/lib/types";
import {
  BedrijfFormulier,
  GebruikerNieuwFormulier,
  GebruikerRij,
  GebruikersBulkFormulier,
  InstellingenFormulier,
} from "./Formulieren";

export const metadata = { title: "Instellingen" };

// Alleen voor de docent. vereistDocent() stuurt een student terug naar
// het overzicht; de databank weigert hun wijzigingen sowieso.
export default async function InstellingenPagina() {
  const ctx = await vereistDocent();
  const supabase = await supabaseServer();

  const { data: profielen } = await supabase
    .from("profielen")
    .select("*")
    .order("rol")
    .order("naam");
  const gebruikers = (profielen ?? []) as Profiel[];

  return (
    <>
      <div className="schermkop">
        <div>
          <h1>Instellingen</h1>
          <p>Structuur van het dossier: bedrijven, accounts en dossierbrede gegevens.</p>
        </div>
      </div>

      <div className="kaart">
        <div className="kaart__kop">
          <h2>Gebruikers</h2>
          <span className="hulptekst">{gebruikers.length} accounts</span>
        </div>
        <div className="tabelkader" style={{ boxShadow: "none", marginBottom: 18 }}>
          <table className="tabel">
            <thead>
              <tr>
                <th>Naam</th>
                <th>Rol</th>
                <th>Bedrijf</th>
                <th></th>
                <th></th>
                <th>Wachtwoord</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {gebruikers.map((p) => (
                <GebruikerRij key={p.id} profiel={p} bedrijven={ctx.bedrijven} isIkzelf={p.id === ctx.gebruikerId} />
              ))}
            </tbody>
          </table>
        </div>
        <h3 style={{ marginBottom: 10 }}>Nieuw account</h3>
        <GebruikerNieuwFormulier bedrijven={ctx.bedrijven} />
      </div>

      <div className="kaart">
        <div className="kaart__kop">
          <h2>Meerdere studenten tegelijk</h2>
        </div>
        <GebruikersBulkFormulier bedrijven={ctx.bedrijven} />
      </div>

      {ctx.bedrijven.map((b) => (
        <div className="kaart" key={b.id}>
          <div className="kaart__kop">
            <h2>
              <span className="badge badge--bedrijf" style={{ background: b.kleur, marginRight: 8 }}>
                {b.naam}
              </span>
              Bedrijfsgegevens
            </h2>
          </div>
          <BedrijfFormulier bedrijf={b} />
        </div>
      ))}

      <div className="kaart">
        <div className="kaart__kop">
          <h2>Dossier {ctx.instellingen.moeder_naam}</h2>
        </div>
        <InstellingenFormulier instellingen={ctx.instellingen} />
      </div>
    </>
  );
}
