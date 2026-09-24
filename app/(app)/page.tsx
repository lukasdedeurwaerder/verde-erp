import Link from "next/link";
import { huidigeContext } from "@/lib/sessie";
import { supabaseServer } from "@/lib/supabase/server";
import { aantal } from "@/lib/geld";
import type { Product } from "@/lib/types";

// Het startscherm: een paar tellers en wat aandacht vraagt.
// In latere fases komen hier de openstaande bestellingen en facturen bij.
export default async function Overzicht() {
  const ctx = await huidigeContext();
  const supabase = await supabaseServer();

  // Filter op het actieve bedrijf; in het geconsolideerde zicht van de
  // docent telt alles mee (RLS laat de docent toch alles zien).
  // Een onbestaande id als "geen filter": eq() op een willekeurige uuid
  // zou niets opleveren, dus we bouwen de vier vragen los op.
  const b = ctx.bedrijf?.id;

  let qKlanten = supabase.from("relaties").select("id", { count: "exact", head: true }).eq("actief", true).in("soort", ["klant", "beide"]);
  let qLeveranciers = supabase.from("relaties").select("id", { count: "exact", head: true }).eq("actief", true).in("soort", ["leverancier", "beide"]);
  let qProducten = supabase.from("producten").select("id", { count: "exact", head: true }).eq("actief", true);
  let qLaag = supabase.from("producten").select("id, naam, voorraad, min_voorraad, eenheid, bedrijf_id").eq("actief", true).eq("voorraad_bijhouden", true);
  let qOpen = supabase.from("bestellingen").select("id", { count: "exact", head: true }).in("status", ["nieuw", "in_behandeling", "klaar"]);
  let qConcept = supabase.from("documenten").select("id", { count: "exact", head: true }).eq("status", "concept");
  if (b) {
    qKlanten = qKlanten.eq("bedrijf_id", b);
    qLeveranciers = qLeveranciers.eq("bedrijf_id", b);
    qProducten = qProducten.eq("bedrijf_id", b);
    qLaag = qLaag.eq("bedrijf_id", b);
    qOpen = qOpen.eq("bedrijf_id", b);
    qConcept = qConcept.eq("bedrijf_id", b);
  }

  const [klanten, leveranciers, producten, laag, open, concept] = await Promise.all([qKlanten, qLeveranciers, qProducten, qLaag, qOpen, qConcept]);

  const laagLijst = ((laag.data ?? []) as Pick<Product, "id" | "naam" | "voorraad" | "min_voorraad" | "eenheid" | "bedrijf_id">[])
    .filter((p) => Number(p.voorraad) <= Number(p.min_voorraad))
    .slice(0, 8);

  const naamVan = (bedrijfId: string) => ctx.bedrijven.find((b) => b.id === bedrijfId)?.naam ?? "";

  return (
    <>
      <div className="schermkop">
        <div>
          <h1>Overzicht</h1>
          <p>
            {ctx.bedrijf
              ? `Je werkt in ${ctx.bedrijf.naam}.`
              : `Alle bedrijven van ${ctx.instellingen.moeder_naam} samen.`}
          </p>
        </div>
      </div>

      <div className="tegels">
        <Link href="/klanten" className="tegel">
          <div className="tegel__label">Klanten</div>
          <div className="tegel__getal">{klanten.count ?? 0}</div>
        </Link>
        <Link href="/leveranciers" className="tegel">
          <div className="tegel__label">Leveranciers</div>
          <div className="tegel__getal">{leveranciers.count ?? 0}</div>
        </Link>
        <Link href="/producten" className="tegel">
          <div className="tegel__label">Producten</div>
          <div className="tegel__getal">{producten.count ?? 0}</div>
        </Link>
        <Link href="/bestellingen" className="tegel">
          <div className="tegel__label">Open bestellingen</div>
          <div className="tegel__getal">{open.count ?? 0}</div>
          <div className="tegel__sub">nieuw, in behandeling of klaar</div>
        </Link>
        <Link href="/documenten" className="tegel">
          <div className="tegel__label">Documenten in concept</div>
          <div className="tegel__getal">{concept.count ?? 0}</div>
          <div className="tegel__sub">nog definitief te maken</div>
        </Link>
      </div>

      <div className="kaart">
        <div className="kaart__kop">
          <h2>Voorraad onder het minimum</h2>
        </div>
        {laagLijst.length === 0 ? (
          <p className="hulptekst">Geen producten onder hun minimumvoorraad.</p>
        ) : (
          <table className="tabel">
            <thead>
              <tr>
                <th>Product</th>
                {!ctx.bedrijf && <th>Bedrijf</th>}
                <th className="getal">Voorraad</th>
                <th className="getal">Minimum</th>
              </tr>
            </thead>
            <tbody>
              {laagLijst.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link href={`/producten/${p.id}`} className="rij">
                      {p.naam}
                    </Link>
                  </td>
                  {!ctx.bedrijf && <td>{naamVan(p.bedrijf_id)}</td>}
                  <td className="getal">
                    {aantal(p.voorraad)} {p.eenheid}
                  </td>
                  <td className="getal">{aantal(p.min_voorraad)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
