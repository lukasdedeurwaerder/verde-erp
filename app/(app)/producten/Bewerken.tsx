import Link from "next/link";
import { notFound } from "next/navigation";
import { huidigeContext } from "@/lib/sessie";
import { supabaseServer } from "@/lib/supabase/server";
import type { Product, Productcategorie } from "@/lib/types";
import { ProductFormulier } from "./Formulier";
import { productOpslaan, productVerwijderen } from "./acties";

export async function ProductBewerken({ id }: { id: string | null }) {
  const ctx = await huidigeContext();
  const supabase = await supabaseServer();

  let product: Product | null = null;
  if (id) {
    const { data } = await supabase.from("producten").select("*").eq("id", id).maybeSingle();
    if (!data) notFound();
    product = data as Product;
  }

  const bedrijfId = product?.bedrijf_id ?? ctx.bedrijf?.id ?? null;

  if (!bedrijfId) {
    return (
      <>
        <div className="schermkop">
          <h1>Nieuw product</h1>
        </div>
        <p className="melding-info">Kies eerst in de bovenbalk in welk bedrijf je dit product wilt aanmaken.</p>
        <p style={{ marginTop: 12 }}>
          <Link href="/producten">← Terug naar de lijst</Link>
        </p>
      </>
    );
  }

  const { data: categorieen } = await supabase
    .from("productcategorieen")
    .select("*")
    .eq("bedrijf_id", bedrijfId)
    .order("volgorde")
    .order("naam");

  const bedrijf = ctx.bedrijven.find((b) => b.id === bedrijfId);

  return (
    <>
      <div className="schermkop">
        <div>
          <h1>{product ? product.naam : "Nieuw product"}</h1>
          <p>{bedrijf?.naam}</p>
        </div>
        <div className="schermkop__acties">
          {product?.voorraad_bijhouden && (
            <Link href={`/voorraad/${product.id}`} className="knop">
              Voorraad bekijken
            </Link>
          )}
          <Link href="/producten" className="knop">
            ← Lijst
          </Link>
        </div>
      </div>

      <ProductFormulier
        product={product}
        categorieen={(categorieen ?? []) as Productcategorie[]}
        opslaan={productOpslaan.bind(null, product?.id ?? null)}
        verwijderen={product ? productVerwijderen.bind(null, product.id) : undefined}
      />
    </>
  );
}
