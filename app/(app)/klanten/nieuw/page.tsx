import { RelatieBewerken } from "../../relaties/Bewerken";

export const metadata = { title: "Nieuwe klant" };

export default function Pagina() {
  return <RelatieBewerken pagina="klant" id={null} />;
}
