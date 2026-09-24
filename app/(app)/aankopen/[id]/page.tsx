import { AankoopBewerken } from "../Bewerken";

export default async function Pagina({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AankoopBewerken id={id} />;
}
