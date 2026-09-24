import Link from "next/link";
import { huidigeContext } from "@/lib/sessie";
import { supabaseServer } from "@/lib/supabase/server";
import { aantal, euro } from "@/lib/geld";
import type { Product, Productcategorie } from "@/lib/types";

export const metadata = { title: "Producten" };

type Rij = Product & { productcategorieen: Pick<Productcategorie, "naam"> | null };

export default async function ProductenPagina({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; inactief?: string }>;
}) {
  const { q, inactief } = await searchParams;
  const zoek = (q ?? "").trim();
  const ookInactief = inactief === "1";

  const ctx = await huidigeContext();
  const supabase = await supabaseServer();

  let query = supabase
    .from("producten")
    .select("*, productcategorieen(naam)")
    .order("naam");
  if (ctx.bedrijf) query = query.eq("bedrijf_id", ctx.bedrijf.id);
  if (!ookInactief) query = query.eq("actief", true);
  if (zoek) query = query.or(`naam.ilike.%${zoek}%,code.ilike.%${zoek}%,omschrijving.ilike.%${zoek}%`);

  const { data, error } = await query;
  const rijen = (data ?? []) as Rij[];
  const bedrijfVan = (id: string) => ctx.bedrijven.find((b) => b.id === id);

  return (
    <>
      <div className="schermkop">
        <div>
          <h1>Producten</h1>
          <p>Wat je verkoopt en aankoopt, met prijs, btw-tarief en voorraad.</p>
        </div>
        <div className="schermkop__acties">
          {ctx.bedrijf ? (
            <Link href="/producten/nieuw" className="knop knop--primair">
              + Nieuw product
            </Link>
          ) : (
            <span className="hulptekst">Kies een bedrijf om een product toe te voegen.</span>
          )}
        </div>
      </div>

      <form className="zoekbalk" method="get">
        <input type="search" name="q" className="veld" placeholder="Zoek op naam, code of omschrijving" defaultValue={zoek} />
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontWeight: 500 }}>
          <input type="checkbox" name="inactief" value="1" defaultChecked={ookInactief} />
          Ook inactieve
        </label>
        <button type="submit" className="knop">
          Zoeken
        </button>
      </form>

      {error && <p className="foutmelding">{error.message}</p>}

      <div className="tabelkader">
        <table className="tabel">
          <thead>
            <tr>
              <th style={{ width: 56 }}></th>
              <th>Product</th>
              {!ctx.bedrijf && <th>Bedrijf</th>}
              <th>Categorie</th>
              <th className="getal">Aankoop</th>
              <th className="getal">Verkoop excl.</th>
              <th className="getal">Btw</th>
              <th className="getal">Voorraad</th>
            </tr>
          </thead>
          <tbody>
            {rijen.length === 0 && (
              <tr>
                <td colSpan={8} className="leeg">
                  {zoek ? "Niets gevonden." : "Nog geen producten."}
                </td>
              </tr>
            )}
            {rijen.map((p) => {
              const b = bedrijfVan(p.bedrijf_id);
              const laag = p.voorraad_bijhouden && Number(p.voorraad) <= Number(p.min_voorraad);
              return (
                <tr key={p.id} className="klikbaar">
                  <td>
                    {p.foto_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.foto_url} alt="" className="miniatuur" />
                    ) : (
                      <div className="miniatuur miniatuur--leeg">—</div>
                    )}
                  </td>
                  <td>
                    <Link href={`/producten/${p.id}`} className="rij">
                      {p.naam}
                    </Link>
                    {p.code && <div className="hulptekst">{p.code}</div>}
                    {!p.actief && (
                      <>
                        {" "}
                        <span className="badge badge--waarschuwing">inactief</span>
                      </>
                    )}
                  </td>
                  {!ctx.bedrijf && (
                    <td>
                      {b && (
                        <span className="badge badge--bedrijf" style={{ background: b.kleur }}>
                          {b.naam}
                        </span>
                      )}
                    </td>
                  )}
                  <td>{p.productcategorieen?.naam ?? ""}</td>
                  <td className="getal">{euro(p.aankoopprijs)}</td>
                  <td className="getal">{euro(p.verkoopprijs)}</td>
                  <td className="getal">{aantal(p.btw_tarief)} %</td>
                  <td className="getal">
                    {p.voorraad_bijhouden ? (
                      <Link href={`/voorraad/${p.id}`} className={laag ? "badge badge--waarschuwing" : undefined} style={laag ? undefined : { color: "inherit" }}>
                        {aantal(p.voorraad)} {p.eenheid}
                      </Link>
                    ) : (
                      <span className="hulptekst">dienst</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
