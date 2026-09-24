import { RelatieBewerken } from "../../relaties/Bewerken";

export const metadata = { title: "Nieuwe leverancier" };

export default function Pagina() {
  return <RelatieBewerken pagina="leverancier" id={null} />;
}
