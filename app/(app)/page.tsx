import Link from "next/link";
import { huidigeContext } from "@/lib/sessie";
import { supabaseServer } from "@/lib/supabase/server";
import { aantal, euro } from "@/lib/geld";
import { cent } from "@/lib/lijnen";
import { documentenMetSaldo } from "@/lib/boekhouding";
import { vandaag } from "@/lib/bestelling";
import type { Product } from "@/lib/types";

// Het startscherm: een paar tellers en wat aandacht vraagt.
// Bovenaan het geld: wat binnen moet komen, wat buiten moet, wat er op de
// bank staat en of er winst gemaakt wordt.
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

  const [klanten, leveranciers, producten, laag, open, concept, facturen, aankopen, bank, saldi] = await Promise.all([
    qKlanten,
    qLeveranciers,
    qProducten,
    qLaag,
    qOpen,
    qConcept,
    documentenMetSaldo(supabase, "factuur", b ?? null),
    documentenMetSaldo(supabase, "aankoopfactuur", b ?? null),
    supabase.rpc("gedeelde_bankrekening", {}),
    supabase.rpc("saldi_tot", { p_bedrijf: b ?? null, p_tot: vandaag() }),
  ]);

  const vandaagIso = vandaag();
  const teOntvangen = cent(facturen.reduce((t, f) => t + Math.max(f.openstaand, 0), 0));
  const vervallen = facturen.filter((f) => f.openstaand > 0 && f.vervaldatum && f.vervaldatum < vandaagIso).length;
  const teBetalen = cent(aankopen.reduce((t, f) => t + Math.max(f.openstaand, 0), 0));
  const banksaldo = cent(((bank.data ?? []) as { bedrag: number }[]).reduce((t, x) => t + Number(x.bedrag), 0));
  const s = (saldi.data ?? []) as { soort: string; saldo: number }[];
  const resultaat = cent(
    s.filter((x) => x.soort === "opbrengst").reduce((t, x) => t + Number(x.saldo), 0) -
      s.filter((x) => x.soort === "kost").reduce((t, x) => t + Number(x.saldo), 0),
  );

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
        <Link href="/documenten?soort=factuur" className="tegel">
          <div className="tegel__label">Nog te ontvangen van klanten</div>
          <div className="tegel__getal">{euro(teOntvangen)}</div>
          <div className="tegel__sub">
            {vervallen > 0 ? <span className="badge badge--fout">{vervallen} vervallen</span> : "niets vervallen"}
          </div>
        </Link>
        <Link href="/aankopen?filter=open" className="tegel">
          <div className="tegel__label">Nog te betalen aan leveranciers</div>
          <div className="tegel__getal">{euro(teBetalen)}</div>
        </Link>
        <Link href="/bank" className="tegel">
          <div className="tegel__label">Saldo gedeelde bankrekening</div>
          <div className="tegel__getal">{euro(banksaldo)}</div>
          <div className="tegel__sub">van alle dochters samen</div>
        </Link>
        <Link href="/rapporten" className="tegel">
          <div className="tegel__label">{resultaat >= 0 ? "Winst tot nu toe" : "Verlies tot nu toe"}</div>
          <div className="tegel__getal" style={{ color: resultaat >= 0 ? "var(--goed)" : "var(--fout)" }}>{euro(Math.abs(resultaat))}</div>
        </Link>
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
