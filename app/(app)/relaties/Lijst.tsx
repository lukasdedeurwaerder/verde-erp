import Link from "next/link";
import { huidigeContext } from "@/lib/sessie";
import { supabaseServer } from "@/lib/supabase/server";
import type { Relatie } from "@/lib/types";
import { padVoor, type Pagina } from "./soort";

const TITEL: Record<Pagina, { enkel: string; meer: string; uitleg: string }> = {
  klant: {
    enkel: "klant",
    meer: "Klanten",
    uitleg: "Aan wie je verkoopt. Elke bestelling en factuur hangt aan een klant uit deze lijst.",
  },
  leverancier: {
    enkel: "leverancier",
    meer: "Leveranciers",
    uitleg: "Bij wie je aankoopt. Elke bestelbon en aankoopfactuur hangt aan een leverancier uit deze lijst.",
  },
};

export async function RelatieLijst({
  pagina,
  zoek,
  inactief,
}: {
  pagina: Pagina;
  zoek: string;
  inactief: boolean;
}) {
  const ctx = await huidigeContext();
  const supabase = await supabaseServer();
  const t = TITEL[pagina];
  const pad = padVoor(pagina);

  let query = supabase
    .from("relaties")
    .select("*")
    .in("soort", [pagina, "beide"])
    .order("naam");
  if (ctx.bedrijf) query = query.eq("bedrijf_id", ctx.bedrijf.id);
  if (!inactief) query = query.eq("actief", true);
  if (zoek) query = query.or(`naam.ilike.%${zoek}%,contactpersoon.ilike.%${zoek}%,gemeente.ilike.%${zoek}%`);

  const { data, error } = await query;
  const rijen = (data ?? []) as Relatie[];
  const bedrijfNaam = (id: string) => ctx.bedrijven.find((b) => b.id === id);

  return (
    <>
      <div className="schermkop">
        <div>
          <h1>{t.meer}</h1>
          <p>{t.uitleg}</p>
        </div>
        <div className="schermkop__acties">
          {ctx.bedrijf ? (
            <Link href={`${pad}/nieuw`} className="knop knop--primair">
              + Nieuwe {t.enkel}
            </Link>
          ) : (
            <span className="hulptekst">Kies een bedrijf om een {t.enkel} toe te voegen.</span>
          )}
        </div>
      </div>

      <form className="zoekbalk" method="get">
        <input
          type="search"
          name="q"
          className="veld"
          placeholder="Zoek op naam, contactpersoon of gemeente"
          defaultValue={zoek}
        />
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontWeight: 500 }}>
          <input type="checkbox" name="inactief" value="1" defaultChecked={inactief} />
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
              <th>Naam</th>
              {!ctx.bedrijf && <th>Bedrijf</th>}
              <th>Contactpersoon</th>
              <th>E-mail</th>
              <th>Telefoon</th>
              <th>Gemeente</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rijen.length === 0 && (
              <tr>
                <td colSpan={7} className="leeg">
                  {zoek ? "Niets gevonden." : `Nog geen ${t.meer.toLowerCase()}.`}
                </td>
              </tr>
            )}
            {rijen.map((r) => {
              const b = bedrijfNaam(r.bedrijf_id);
              return (
                <tr key={r.id} className="klikbaar">
                  <td>
                    <Link href={`${pad}/${r.id}`} className="rij">
                      {r.naam}
                    </Link>
                    {r.soort === "beide" && (
                      <>
                        {" "}
                        <span className="badge">klant én leverancier</span>
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
                  <td>{r.contactpersoon ?? ""}</td>
                  <td>{r.email ? <a href={`mailto:${r.email}`}>{r.email}</a> : ""}</td>
                  <td>{r.telefoon ?? ""}</td>
                  <td>{r.gemeente ?? ""}</td>
                  <td>{!r.actief && <span className="badge badge--waarschuwing">inactief</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
