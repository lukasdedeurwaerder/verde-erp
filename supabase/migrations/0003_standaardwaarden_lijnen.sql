-- ============================================================
-- Ontbrekende velden in lijnen opvullen met hun standaardwaarde.
--
-- Wie meerdere lijnen in één keer bewaart via Supabase, en in de ene
-- lijn een veld weglaat dat in een andere lijn wél staat, krijgt voor
-- dat veld "null" in plaats van de standaardwaarde van de kolom. Dan
-- weigert de databank de hele bewaring ("null value in column ...").
--
-- Deze triggers vullen zulke gaten vóór het bewaren, zodat een
-- weggelaten korting gewoon 0 % is en een weggelaten credit 0,00.
-- ============================================================

create or replace function bestellijn_standaard()
returns trigger language plpgsql as $$
begin
  new.eenheidsprijs := coalesce(new.eenheidsprijs, 0);
  new.btw_tarief    := coalesce(new.btw_tarief, 21);
  new.korting_pct   := coalesce(new.korting_pct, 0);
  new.volgorde      := coalesce(new.volgorde, 0);
  return new;
end $$;

create trigger bestellijn_standaard before insert or update on bestellijnen
  for each row execute function bestellijn_standaard();

create or replace function documentlijn_standaard()
returns trigger language plpgsql as $$
begin
  new.aantal        := coalesce(new.aantal, 1);
  new.eenheidsprijs := coalesce(new.eenheidsprijs, 0);
  new.btw_tarief    := coalesce(new.btw_tarief, 21);
  new.korting_pct   := coalesce(new.korting_pct, 0);
  new.volgorde      := coalesce(new.volgorde, 0);
  return new;
end $$;

create trigger documentlijn_standaard before insert or update on documentlijnen
  for each row execute function documentlijn_standaard();

create or replace function boekingslijn_standaard()
returns trigger language plpgsql as $$
begin
  new.debet    := coalesce(new.debet, 0);
  new.credit   := coalesce(new.credit, 0);
  new.volgorde := coalesce(new.volgorde, 0);
  return new;
end $$;

create trigger boekingslijn_standaard before insert or update on boekingslijnen
  for each row execute function boekingslijn_standaard();
