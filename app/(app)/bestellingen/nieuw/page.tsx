import { BestellingBewerken } from "../Bewerken";

export const metadata = { title: "Nieuwe bestelling" };

export default async function Pagina({ searchParams }: { searchParams: Promise<{ soort?: string }> }) {
  const { soort } = await searchParams;
  return <BestellingBewerken id={null} soort={soort === "aankoop" ? "aankoop" : "verkoop"} />;
}
