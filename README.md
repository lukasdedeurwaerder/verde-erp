# Verde-ERP

Eenvoudig ERP- en boekhoudpakket voor de studentenbedrijven van het vak
Ondernemen. Eén dossier ("Verde") met twee dochterondernemingen die een
bankrekening delen. Studenten werken elk in hun eigen dochter; de docent
ziet en beheert alles.

## Bouwstenen

- **Next.js** (webapp, draait op Vercel)
- **Supabase** (databank, login, opslag voor productfoto's en pdf's)
- Geen andere afhankelijkheden: gewone CSS, gewone formulieren.

## Fasering

1. ✅ Opzet, login, rollen, bedrijfskeuze, fiches (klanten, leveranciers, producten met foto)
2. Bestellingen met verantwoordelijke en kanban, offertes en bestelbonnen als pdf
3. Leverbonnen, ontvangstbonnen, voorraad, facturen en creditnota's als pdf
4. Dagboeken aankopen, verkopen en financieel, met live balans en resultatenrekening
5. Docentenpaneel (rekeningenstelsel, logboek) en afwerking

Het datamodel voor alle fases staat al volledig in
`supabase/migrations/0001_schema.sql`.

## Eerste keer opzetten

1. Maak een Supabase-project aan (regio Frankfurt).
2. Kopieer `.env.local.voorbeeld` naar `.env.local` en vul de sleutels en
   de databank-URL in.
3. Voer de migraties uit:

   ```bash
   npm.cmd run migreer
   ```

4. Maak het eerste docentenaccount aan:

   ```bash
   npm.cmd run docent -- "Naam Docent" docent@voorbeeld.be StartWachtwoord123
   ```

5. Start lokaal met `npm.cmd run dev` en log in. Studentenaccounts maak je
   daarna aan onder **Instellingen → Gebruikers**.

## Beveiliging in de databank

Elke tabel heeft een kolom `bedrijf_id`. Row Level Security laat een
student alleen rijen van het eigen bedrijf zien en bewerken; de docent
ziet alles. Die regel staat in de databank zelf, niet alleen in de app.
