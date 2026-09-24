// Kleine hulpjes om formuliervelden veilig te lezen in server actions.

/** Een tekstveld, bijgeknipt. Leeg wordt null. */
export function tekst(form: FormData, naam: string): string | null {
  const waarde = form.get(naam);
  if (typeof waarde !== "string") return null;
  const schoon = waarde.trim();
  return schoon === "" ? null : schoon;
}

/** Een verplicht tekstveld. */
export function verplicht(form: FormData, naam: string): string {
  return tekst(form, naam) ?? "";
}

/** Een selectievakje. */
export function vinkje(form: FormData, naam: string): boolean {
  return form.get(naam) === "on" || form.get(naam) === "true";
}
