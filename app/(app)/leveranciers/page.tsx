import { RelatieLijst } from "../relaties/Lijst";

export const metadata = { title: "Leveranciers" };

export default async function Pagina({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; inactief?: string }>;
}) {
  const { q, inactief } = await searchParams;
  return <RelatieLijst pagina="leverancier" zoek={(q ?? "").trim()} inactief={inactief === "1"} />;
}
