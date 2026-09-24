import Link from "next/link";
import { notFound } from "next/navigation";
import { huidigeContext } from "@/lib/sessie";
import { supabaseServer } from "@/lib/supabase/server";
import type { Relatie } from "@/lib/types";
import { RelatieFormulier } from "./Formulier";
import { relatieOpslaan, relatieVerwijderen } from "./acties";
import { padVoor, type Pagina } from "./soort";

// Het scherm om een klant of leverancier aan te maken of te bewerken.
// `id` null = nieuw.
export async function RelatieBewerken({ pagina, id }: { pagina: Pagina; id: string | null }) {
  const ctx = await huidigeContext();
  const enkel = pagina === "klant" ? "klant" : "leverancier";

  let relatie: Relatie | null = null;
  if (id) {
    const supabase = await supabaseServer();
    const { data } = await supabase.from("relaties").select("*").eq("id", id).maybeSingle();
    if (!data) notFound();
    relatie = data as Relatie;
  }

  const bedrijf = relatie
    ? ctx.bedrijven.find((b) => b.id === relatie!.bedrijf_id)
    : ctx.bedrijf;

  if (!relatie && !ctx.bedrijf) {
    return (
      <>
        <div className="schermkop">
          <h1>Nieuwe {enkel}</h1>
        </div>
        <p className="melding-info">
          Kies eerst in de bovenbalk in welk bedrijf je deze {enkel} wilt aanmaken.
        </p>
        <p style={{ marginTop: 12 }}>
          <Link href={padVoor(pagina)}>← Terug naar de lijst</Link>
        </p>
      </>
    );
  }

  return (
    <>
      <div className="schermkop">
        <div>
          <h1>{relatie ? relatie.naam : `Nieuwe ${enkel}`}</h1>
          <p>
            {bedrijf?.naam}
            {relatie && ` · aangemaakt op ${new Date(relatie.aangemaakt_op).toLocaleDateString("nl-BE")}`}
          </p>
        </div>
        <div className="schermkop__acties">
          <Link href={padVoor(pagina)} className="knop">
            ← Lijst
          </Link>
        </div>
      </div>

      <RelatieFormulier
        pagina={pagina}
        relatie={relatie}
        opslaan={relatieOpslaan.bind(null, pagina, relatie?.id ?? null)}
        verwijderen={relatie ? relatieVerwijderen.bind(null, pagina, relatie.id) : undefined}
      />
    </>
  );
}
