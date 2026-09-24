import { BestellingBewerken } from "../Bewerken";

export default async function Pagina({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BestellingBewerken id={id} soort="verkoop" />;
}
