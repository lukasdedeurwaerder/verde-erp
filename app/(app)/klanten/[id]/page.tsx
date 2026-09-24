import { RelatieBewerken } from "../../relaties/Bewerken";

export default async function Pagina({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RelatieBewerken pagina="klant" id={id} />;
}
