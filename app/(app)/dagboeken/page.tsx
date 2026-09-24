import Link from "next/link";
import { huidigeContext } from "@/lib/sessie";
import { supabaseServer } from "@/lib/supabase/server";
import { DAGBOEK_LABEL, vandaag } from "@/lib/bestelling";
import { rekeningen } from "@/lib/boekhouding";
import { euro } from "@/lib/geld";
import { cent } from "@/lib/lijnen";
import type { Dagboek } from "@/lib/types";
import { BOEKING_SELECT, BoekingWeergave, type BoekingMetLijnen } from "./BoekingWeergave";
import { DiversFormulier } from "./DiversFormulier";
import { VerwijderKnop } from "./VerwijderKnop";

export const metadata = { title: "Dagboeken" };

const UITLEG: Record<Dagboek, string> = {
  verkoop: "Vult zichzelf: elke factuur en creditnota die definitief wordt, komt hier. Klanten in debet, omzet en btw in credit.",
  aankoop: "Vult zichzelf met de aankoopfacturen die definitief worden. Kosten en aftrekbare btw in debet, leveranciers in credit.",
  financieel: "De verrichtingen op de gedeelde bankrekening. Die boek je bij Bank.",
  divers: "Alles wat niet via een factuur of de bank loopt: afschrijvingen, correcties, de voorraad op de balans.",
};

export default async function DagboekenPagina({ searchParams }: { searchParams: Promise<{ dagboek?: string }> }) {
  const { dagboek: gekozen } = await searchParams;
  const dagboek: Dagboek = (["verkoop", "aankoop", "financieel", "divers"] as const).find((x) => x === gekozen) ?? "verkoop";
  const ctx = await huidigeContext();
  const supabase = await supabaseServer();

  let q = supabase
    .from("boekingen")
    .select(BOEKING_SELECT)
    .eq("dagboek", dagboek)
    .order("datum", { ascending: false })
    .order("nummer", { ascending: false })
    .limit(200);
  if (ctx.bedrijf) q = q.eq("bedrijf_id", ctx.bedrijf.id);
  const [{ data, error }, reks] = await Promise.all([q, rekeningen(supabase)]);
  const boekingen = (data ?? []) as unknown as BoekingMetLijnen[];

  const totaal = cent(boekingen.reduce((t, b) => t + b.boekingslijnen.reduce((s, l) => s + Number(l.debet), 0), 0));
  const bedrijfVan = (id: string) => ctx.bedrijven.find((b) => b.id === id);
  const magVerwijderen = (b: BoekingMetLijnen) =>
    (b.dagboek === "divers" || b.dagboek === "financieel") && (ctx.isDocent || b.bedrijf_id === ctx.profiel.bedrijf_id);

  return (
    <>
      <div className="schermkop">
        <div>
          <h1>Dagboeken</h1>
          <p>{UITLEG[dagboek]}</p>
        </div>
      </div>

      <div className="zoekbalk">
        <span className="schakel">
          {(Object.keys(DAGBOEK_LABEL) as Dagboek[]).map((d) => (
            <Link key={d} href={`/dagboeken?dagboek=${d}`} className={`knop knop--klein${d === dagboek ? " knop--primair" : ""}`}>
              {DAGBOEK_LABEL[d].naam}
            </Link>
          ))}
        </span>
        <span className="hulptekst">
          {boekingen.length} boekingen · totaal debet {euro(totaal)}
        </span>
      </div>

      {error && <p className="foutmelding">{error.message}</p>}

      <div className={dagboek === "divers" ? "tweekolom tweekolom--formulier tweekolom--divers" : undefined}>
        <div className="kaart">
          {boekingen.length === 0 ? (
            <p className="hulptekst">Nog geen boekingen in dit dagboek.</p>
          ) : (
            boekingen.map((b) => (
              <BoekingWeergave
                key={b.id}
                boeking={b}
                bedrijf={ctx.bedrijf ? null : bedrijfVan(b.bedrijf_id)}
                actie={
                  magVerwijderen(b) ? (
                    <VerwijderKnop id={b.id} uitleg="Deze boeking verwijderen? Ze verdwijnt ook uit de balans en de resultatenrekening." />
                  ) : null
                }
              />
            ))
          )}
        </div>

        {dagboek === "divers" && (
          <div className="kaart">
            <div className="kaart__kop">
              <h2>Diverse boeking</h2>
            </div>
            {ctx.bedrijf ? (
              <DiversFormulier rekeningen={reks.map((r) => ({ id: r.id, nummer: r.nummer, naam: r.naam }))} vandaag={vandaag()} />
            ) : (
              <p className="melding-info">Kies in de bovenbalk voor welke dochter je boekt.</p>
            )}
          </div>
        )}
      </div>
    </>
  );
}
