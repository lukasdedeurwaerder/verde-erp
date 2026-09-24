import { LoginFormulier } from "./LoginFormulier";
import stijl from "./login.module.css";

export const metadata = { title: "Inloggen" };

export default async function LoginPagina({
  searchParams,
}: {
  searchParams: Promise<{ reden?: string }>;
}) {
  const { reden } = await searchParams;

  return (
    <main className={stijl.scherm}>
      <div className={`kaart ${stijl.kader}`}>
        <div className={stijl.merk}>
          <i aria-hidden />
          <span>Verde-ERP</span>
        </div>
        <p className={stijl.uitleg}>
          Log in met het e-mailadres en wachtwoord dat je van je docent kreeg.
        </p>

        {reden === "geen-profiel" && (
          <p className="melding-info" role="alert">
            Je account is nog niet actief of hoort bij geen enkel bedrijf.
            Vraag je docent om het te activeren.
          </p>
        )}

        <LoginFormulier />
      </div>
    </main>
  );
}
