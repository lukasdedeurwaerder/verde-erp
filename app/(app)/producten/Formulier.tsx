"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { BTW_TARIEVEN, type Product, type Productcategorie } from "@/lib/types";
import { FotoVeld } from "./FotoVeld";
import type { ProductStatus } from "./acties";

function Opslaanknop({ nieuw }: { nieuw: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="knop knop--primair" disabled={pending}>
      {pending ? "Bezig…" : nieuw ? "Aanmaken" : "Opslaan"}
    </button>
  );
}

function Verwijderknop({ naam }: { naam: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="knop knop--gevaar"
      disabled={pending}
      onClick={(e) => {
        if (!confirm(`"${naam}" verwijderen? Zit het product al in een bestelling of document, dan wordt het inactief gezet.`)) {
          e.preventDefault();
        }
      }}
    >
      Verwijderen
    </button>
  );
}

export function ProductFormulier({
  product,
  categorieen,
  opslaan,
  verwijderen,
}: {
  product: Product | null;
  categorieen: Productcategorie[];
  opslaan: (vorige: ProductStatus, form: FormData) => Promise<ProductStatus>;
  verwijderen?: () => Promise<ProductStatus>;
}) {
  const [status, actie] = useActionState<ProductStatus, FormData>(opslaan, {});
  const [wisStatus, wisActie] = useActionState<ProductStatus, FormData>(
    async () => (verwijderen ? verwijderen() : {}),
    {},
  );
  const nieuw = product === null;
  const p = product;

  return (
    <div className="kaart" style={{ maxWidth: 820 }}>
      <form action={actie} className="formulier">
        {(status.fout || wisStatus.fout) && (
          <p className="foutmelding" role="alert">
            {status.fout ?? wisStatus.fout}
          </p>
        )}

        <FotoVeld huidigeUrl={p?.foto_url ?? null} />

        <div className="formulier__kolommen">
          <div className="formulier__rij" style={{ gridColumn: "span 2" }}>
            <label htmlFor="naam">Naam *</label>
            <input id="naam" name="naam" className="veld" defaultValue={p?.naam ?? ""} required autoFocus />
          </div>
          <div className="formulier__rij">
            <label htmlFor="code">Productcode</label>
            <input id="code" name="code" className="veld" placeholder="bv. KA-001" defaultValue={p?.code ?? ""} />
          </div>
        </div>

        <div className="formulier__rij">
          <label htmlFor="omschrijving">Omschrijving</label>
          <textarea id="omschrijving" name="omschrijving" className="veld" defaultValue={p?.omschrijving ?? ""} />
        </div>

        <div className="formulier__kolommen">
          <div className="formulier__rij">
            <label htmlFor="categorie_id">Categorie</label>
            <select id="categorie_id" name="categorie_id" className="veld" defaultValue={p?.categorie_id ?? ""}>
              <option value="">— geen —</option>
              {categorieen.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.naam}
                </option>
              ))}
            </select>
          </div>
          <div className="formulier__rij">
            <label htmlFor="nieuwe_categorie">… of nieuwe categorie</label>
            <input id="nieuwe_categorie" name="nieuwe_categorie" className="veld" placeholder="bv. Dranken" />
          </div>
        </div>

        <div className="formulier__kolommen formulier__kolommen--3">
          <div className="formulier__rij">
            <label htmlFor="aankoopprijs">Aankoopprijs (excl. btw)</label>
            <input id="aankoopprijs" name="aankoopprijs" className="veld" inputMode="decimal" defaultValue={p ? String(p.aankoopprijs).replace(".", ",") : ""} placeholder="0,00" />
          </div>
          <div className="formulier__rij">
            <label htmlFor="verkoopprijs">Verkoopprijs (excl. btw)</label>
            <input id="verkoopprijs" name="verkoopprijs" className="veld" inputMode="decimal" defaultValue={p ? String(p.verkoopprijs).replace(".", ",") : ""} placeholder="0,00" />
          </div>
          <div className="formulier__rij">
            <label htmlFor="btw_tarief">Btw-tarief</label>
            <select id="btw_tarief" name="btw_tarief" className="veld" defaultValue={String(p?.btw_tarief ?? 21)}>
              {BTW_TARIEVEN.map((t) => (
                <option key={t} value={t}>
                  {t} %
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="formulier__kolommen formulier__kolommen--3">
          <div className="formulier__rij">
            <label htmlFor="eenheid">Eenheid</label>
            <input id="eenheid" name="eenheid" className="veld" defaultValue={p?.eenheid ?? "stuk"} placeholder="stuk, kg, uur, …" />
          </div>
          <div className="formulier__rij">
            <label htmlFor="min_voorraad">Minimumvoorraad</label>
            <input id="min_voorraad" name="min_voorraad" className="veld" inputMode="decimal" defaultValue={p ? String(p.min_voorraad) : "0"} />
          </div>
          <div className="formulier__rij">
            <label>&nbsp;</label>
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 500, color: "var(--tekst)" }}>
              <input type="checkbox" name="voorraad_bijhouden" defaultChecked={p?.voorraad_bijhouden ?? true} />
              Voorraad bijhouden
            </label>
          </div>
        </div>
        <p className="hulptekst">
          Zet “voorraad bijhouden” uit voor een dienst (bv. een workshop). De voorraad zelf
          wordt niet hier aangepast maar via leverbonnen, ontvangstbonnen en tellingen.
        </p>

        {!nieuw && (
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="checkbox" name="actief" defaultChecked={p?.actief ?? true} />
            Actief (inactieve producten verschijnen niet meer in keuzelijsten)
          </label>
        )}

        <div className="formulier__acties">
          <Opslaanknop nieuw={nieuw} />
          <Link href="/producten" className="knop">
            Annuleren
          </Link>
        </div>
      </form>

      {!nieuw && verwijderen && (
        <form action={wisActie} className="formulier__acties" style={{ marginTop: 16, borderTop: "1px solid var(--rand-zacht)", paddingTop: 16 }}>
          <Verwijderknop naam={p?.naam ?? ""} />
        </form>
      )}
    </div>
  );
}
