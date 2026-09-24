-- ============================================================
-- Verde-ERP — het volledige datamodel.
--
-- Eén dossier, twee dochterondernemingen. Bijna elke tabel heeft een
-- kolom bedrijf_id: dat is de scheidslijn. Een student hoort bij één
-- bedrijf en ziet en bewerkt alleen rijen van dat bedrijf. De docent
-- ziet alles. Die regel staat niet in de app maar in de databank zelf
-- (Row Level Security), zodat hij ook geldt als iemand de app omzeilt.
--
-- De keten die alles aan elkaar hangt:
--
--   VERKOOP  relatie (klant) -> bestelling -> offerte
--            -> leverbon (voorraad omlaag) -> factuur (dagboek verkopen)
--            -> betaling (financieel dagboek)     creditnota hangt aan factuur
--   AANKOOP  relatie (leverancier) -> bestelling -> bestelbon
--            -> ontvangstbon (voorraad omhoog) -> aankoopfactuur (dagboek aankopen)
--            -> betaling (financieel dagboek)
--
-- Balans en resultatenrekening zijn geen tabellen: ze worden berekend
-- uit de boekingslijnen. Zie de view rekeningsaldi onderaan.
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- 1. Bedrijven, instellingen en profielen
-- ------------------------------------------------------------

create table bedrijven (
  id            uuid primary key default gen_random_uuid(),
  naam          text not null,
  straat        text,
  postcode      text,
  gemeente      text,
  land          text not null default 'België',
  btw_nummer    text,
  email         text,
  telefoon      text,
  -- Een eigen kleur per dochter: zo zie je in één oogopslag in welk
  -- bedrijf je werkt. Genoteerd als hex, bv. #2563eb.
  kleur         text not null default '#2563eb',
  volgorde      int  not null default 0,
  actief        boolean not null default true,
  aangemaakt_op timestamptz not null default now()
);

-- Eén rij met dossierbrede instellingen. De check op id = 1 maakt een
-- tweede rij onmogelijk.
create table instellingen (
  id                    int primary key default 1 check (id = 1),
  moeder_naam           text not null default 'Verde',
  -- De gedeelde bankrekening van beide dochters.
  iban                  text,
  bic                   text,
  boekjaar_start        date not null default date_trunc('year', current_date)::date,
  betaaltermijn_dagen   int  not null default 30,
  factuur_voettekst     text,
  -- Standaardrekeningen voor de automatische boekingen (fase 4).
  -- Verwijzen naar rekeningen.nummer, niet naar id: zo blijven ze
  -- leesbaar in de instellingen én in een export.
  rek_klanten           text not null default '400',
  rek_leveranciers      text not null default '440',
  rek_btw_te_betalen    text not null default '451',
  rek_btw_terug         text not null default '411',
  rek_bank              text not null default '550',
  rek_kas               text not null default '570',
  rek_omzet             text not null default '700',
  rek_aankopen          text not null default '604',
  rek_kortingen         text not null default '708'
);

create table profielen (
  id            uuid primary key references auth.users (id) on delete cascade,
  naam          text not null,
  -- Kopie van het e-mailadres uit auth.users, zodat de docent de lijst
  -- van gebruikers kan tonen zonder de beheer-API aan te spreken.
  email         text,
  rol           text not null check (rol in ('docent', 'student')),
  bedrijf_id    uuid references bedrijven (id),
  actief        boolean not null default true,
  aangemaakt_op timestamptz not null default now(),
  -- Een student hoort altijd bij een bedrijf; een docent niet.
  constraint student_heeft_bedrijf check (rol = 'docent' or bedrijf_id is not null)
);

-- Bij een nieuw account in auth.users meteen een profiel aanmaken.
-- De naam, rol en het bedrijf komen uit de metadata die de docent bij
-- het aanmaken meegeeft. Zo werkt het ook als je een account rechtstreeks
-- in het Supabase-dashboard aanmaakt.
create or replace function maak_profiel_bij_nieuw_account()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profielen (id, naam, email, rol, bedrijf_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'naam', split_part(new.email, '@', 1)),
    new.email,
    coalesce(new.raw_user_meta_data ->> 'rol', 'student'),
    nullif(new.raw_user_meta_data ->> 'bedrijf_id', '')::uuid
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger profiel_bij_nieuw_account
  after insert on auth.users
  for each row execute function maak_profiel_bij_nieuw_account();

-- ------------------------------------------------------------
-- 2. Wie ben ik? — hulpfuncties voor de beveiliging
--
-- security definer: ze lezen profielen zonder zelf door RLS te gaan,
-- anders zou de regel op profielen zichzelf oproepen (oneindige lus).
-- ------------------------------------------------------------

create or replace function mijn_rol()
returns text language sql stable security definer set search_path = public as $$
  select rol from profielen where id = auth.uid() and actief
$$;

create or replace function mijn_bedrijf()
returns uuid language sql stable security definer set search_path = public as $$
  select bedrijf_id from profielen where id = auth.uid() and actief
$$;

create or replace function is_docent()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select rol = 'docent' from profielen where id = auth.uid() and actief), false)
$$;

-- Mag de ingelogde gebruiker aan dit bedrijf werken?
create or replace function mag_bedrijf(p_bedrijf uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select is_docent() or (p_bedrijf is not null and p_bedrijf = mijn_bedrijf())
$$;

-- ------------------------------------------------------------
-- 3. Fiches: relaties (klanten en leveranciers), categorieën, producten
-- ------------------------------------------------------------

create table relaties (
  id                  uuid primary key default gen_random_uuid(),
  bedrijf_id          uuid not null references bedrijven (id),
  -- 'beide' voor een partij die zowel klant als leverancier is.
  soort               text not null check (soort in ('klant', 'leverancier', 'beide')),
  naam                text not null,
  contactpersoon      text,
  email               text,
  telefoon            text,
  straat              text,
  postcode            text,
  gemeente            text,
  land                text not null default 'België',
  btw_nummer          text,
  betaaltermijn_dagen int,
  opmerkingen         text,
  actief              boolean not null default true,
  aangemaakt_op       timestamptz not null default now(),
  aangemaakt_door     uuid references profielen (id)
);
create index relaties_bedrijf on relaties (bedrijf_id, soort, naam);

create table productcategorieen (
  id         uuid primary key default gen_random_uuid(),
  bedrijf_id uuid not null references bedrijven (id),
  naam       text not null,
  volgorde   int  not null default 0,
  unique (bedrijf_id, naam)
);

-- Rekeningenstelsel staat hieronder bij de boekhouding, maar producten
-- verwijzen ernaar. Daarom eerst.
create table rekeningen (
  id       uuid primary key default gen_random_uuid(),
  nummer   text not null unique,
  naam     text not null,
  -- Bepaalt waar de rekening terechtkomt: balans (actief/passief) of
  -- resultatenrekening (kost/opbrengst).
  soort    text not null check (soort in ('actief', 'passief', 'kost', 'opbrengst')),
  actief   boolean not null default true
);

create table producten (
  id                  uuid primary key default gen_random_uuid(),
  bedrijf_id          uuid not null references bedrijven (id),
  categorie_id        uuid references productcategorieen (id) on delete set null,
  code                text,
  naam                text not null,
  omschrijving        text,
  eenheid             text not null default 'stuk',
  aankoopprijs        numeric(12,2) not null default 0,
  -- Verkoopprijs exclusief btw. Het btw-tarief staat ernaast.
  verkoopprijs        numeric(12,2) not null default 0,
  btw_tarief          numeric(4,2) not null default 21 check (btw_tarief in (0, 6, 12, 21)),
  -- Een dienst heeft geen voorraad. Zet dan voorraad_bijhouden op false.
  voorraad_bijhouden  boolean not null default true,
  -- Wordt door een trigger bijgehouden uit voorraadmutaties. Nooit met
  -- de hand aanpassen: maak een mutatie van het soort 'correctie'.
  voorraad            numeric(12,2) not null default 0,
  min_voorraad        numeric(12,2) not null default 0,
  foto_url            text,
  -- Op welke rekeningen dit product geboekt wordt (fase 4). Leeg =
  -- de standaard uit de instellingen.
  verkoop_rekening_id uuid references rekeningen (id),
  aankoop_rekening_id uuid references rekeningen (id),
  actief              boolean not null default true,
  aangemaakt_op       timestamptz not null default now(),
  aangemaakt_door     uuid references profielen (id)
);
create index producten_bedrijf on producten (bedrijf_id, naam);
create unique index producten_code_uniek on producten (bedrijf_id, code) where code is not null;

-- ------------------------------------------------------------
-- 4. Nummering: per bedrijf, per soort, per jaar
--
-- Bestelling 2026-0001, factuur F-2026-0001, ... Elke reeks telt apart.
-- De functie zet de teller met een rijvergrendeling omhoog, zodat twee
-- studenten die tegelijk opslaan nooit hetzelfde nummer krijgen.
-- ------------------------------------------------------------

create table nummerreeksen (
  bedrijf_id uuid not null references bedrijven (id),
  soort      text not null,
  jaar       int  not null,
  laatste    int  not null default 0,
  primary key (bedrijf_id, soort, jaar)
);

create or replace function volgend_nummer(p_bedrijf uuid, p_soort text, p_jaar int)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not mag_bedrijf(p_bedrijf) then
    raise exception 'Geen toegang tot dit bedrijf';
  end if;
  insert into nummerreeksen (bedrijf_id, soort, jaar, laatste)
  values (p_bedrijf, p_soort, p_jaar, 1)
  on conflict (bedrijf_id, soort, jaar)
    do update set laatste = nummerreeksen.laatste + 1
  returning laatste into n;
  return n;
end $$;

-- ------------------------------------------------------------
-- 5. Bestellingen (verkoop én aankoop) met kanban-status
-- ------------------------------------------------------------

create table bestellingen (
  id                   uuid primary key default gen_random_uuid(),
  bedrijf_id           uuid not null references bedrijven (id),
  soort                text not null check (soort in ('verkoop', 'aankoop')),
  jaar                 int  not null default extract(year from current_date),
  nummer               int,
  relatie_id           uuid not null references relaties (id),
  datum                date not null default current_date,
  gewenste_leverdatum  date,
  status               text not null default 'nieuw'
                       check (status in ('nieuw', 'in_behandeling', 'klaar', 'geleverd', 'gefactureerd', 'geannuleerd')),
  verantwoordelijke_id uuid references profielen (id),
  opmerking            text,
  aangemaakt_op        timestamptz not null default now(),
  bijgewerkt_op        timestamptz not null default now(),
  aangemaakt_door      uuid references profielen (id),
  unique (bedrijf_id, soort, jaar, nummer)
);
create index bestellingen_bedrijf on bestellingen (bedrijf_id, soort, status);

create or replace function bestelling_nummeren()
returns trigger language plpgsql as $$
begin
  if new.nummer is null then
    new.nummer := volgend_nummer(new.bedrijf_id, 'bestelling_' || new.soort, new.jaar);
  end if;
  return new;
end $$;

create trigger bestelling_nummer before insert on bestellingen
  for each row execute function bestelling_nummeren();

create table bestellijnen (
  id             uuid primary key default gen_random_uuid(),
  bestelling_id  uuid not null references bestellingen (id) on delete cascade,
  product_id     uuid references producten (id),
  omschrijving   text not null,
  aantal         numeric(12,2) not null check (aantal > 0),
  eenheidsprijs  numeric(12,2) not null default 0,
  btw_tarief     numeric(4,2) not null default 21 check (btw_tarief in (0, 6, 12, 21)),
  korting_pct    numeric(5,2) not null default 0 check (korting_pct between 0 and 100),
  volgorde       int not null default 0
);
create index bestellijnen_bestelling on bestellijnen (bestelling_id, volgorde);

-- ------------------------------------------------------------
-- 6. Documenten: offerte, bestelbon, leverbon, ontvangstbon,
--    factuur, creditnota, en de ontvangen aankoopfacturen
-- ------------------------------------------------------------

create table documenten (
  id               uuid primary key default gen_random_uuid(),
  bedrijf_id       uuid not null references bedrijven (id),
  soort            text not null check (soort in (
                     'offerte', 'bestelbon', 'leverbon', 'ontvangstbon',
                     'factuur', 'creditnota', 'aankoopfactuur', 'aankoopcreditnota')),
  -- Eigen documenten krijgen hun nummer van de trigger (F-2026-0001).
  -- Bij ontvangen documenten (aankoopfactuur) vul je het nummer van de
  -- leverancier in.
  nummer           text,
  volgnummer       int,
  jaar             int not null default extract(year from current_date),
  bestelling_id    uuid references bestellingen (id),
  relatie_id       uuid not null references relaties (id),
  -- Een creditnota hangt aan een factuur; een factuur kan aan een
  -- leverbon hangen.
  bron_document_id uuid references documenten (id),
  datum            date not null default current_date,
  vervaldatum      date,
  status           text not null default 'concept'
                   check (status in ('concept', 'definitief', 'geannuleerd')),
  -- Totalen worden door een trigger uit de lijnen berekend.
  totaal_excl      numeric(12,2) not null default 0,
  totaal_btw       numeric(12,2) not null default 0,
  totaal_incl      numeric(12,2) not null default 0,
  -- Wat er al betaald is (bijgewerkt vanuit het financieel dagboek).
  betaald          numeric(12,2) not null default 0,
  opmerking        text,
  -- Pad in de opslag-emmer 'documenten' van de bewaarde pdf.
  pdf_pad          text,
  aangemaakt_op    timestamptz not null default now(),
  bijgewerkt_op    timestamptz not null default now(),
  definitief_op    timestamptz,
  aangemaakt_door  uuid references profielen (id)
);
create unique index documenten_nummer_uniek on documenten (bedrijf_id, soort, nummer) where nummer is not null;
create index documenten_bedrijf on documenten (bedrijf_id, soort, datum desc);
create index documenten_bestelling on documenten (bestelling_id);

create or replace function document_nummeren()
returns trigger language plpgsql as $$
declare voorvoegsel text;
begin
  if new.nummer is null then
    voorvoegsel := case new.soort
      when 'offerte'     then 'OF'
      when 'bestelbon'   then 'BB'
      when 'leverbon'    then 'LB'
      when 'ontvangstbon' then 'OB'
      when 'factuur'     then 'F'
      when 'creditnota'  then 'CN'
      else 'D' end;
    new.volgnummer := volgend_nummer(new.bedrijf_id, 'document_' || new.soort, new.jaar);
    new.nummer := voorvoegsel || '-' || new.jaar || '-' || lpad(new.volgnummer::text, 4, '0');
  end if;
  return new;
end $$;

create trigger document_nummer before insert on documenten
  for each row execute function document_nummeren();

create table documentlijnen (
  id             uuid primary key default gen_random_uuid(),
  document_id    uuid not null references documenten (id) on delete cascade,
  product_id     uuid references producten (id),
  -- Bij een aankoopfactuur zonder product (huur, drukwerk, ...) kies je
  -- rechtstreeks een kostenrekening.
  rekening_id    uuid references rekeningen (id),
  omschrijving   text not null,
  aantal         numeric(12,2) not null default 1,
  eenheidsprijs  numeric(12,2) not null default 0,
  btw_tarief     numeric(4,2) not null default 21 check (btw_tarief in (0, 6, 12, 21)),
  korting_pct    numeric(5,2) not null default 0 check (korting_pct between 0 and 100),
  volgorde       int not null default 0
);
create index documentlijnen_document on documentlijnen (document_id, volgorde);

-- Totalen van een document herberekenen zodra een lijn verandert.
-- Per lijn afronden op de cent, zoals op een echte factuur.
create or replace function document_totalen_bijwerken()
returns trigger language plpgsql as $$
declare doc uuid;
begin
  doc := coalesce(new.document_id, old.document_id);
  update documenten d set
    totaal_excl = t.excl,
    totaal_btw  = t.btw,
    totaal_incl = t.excl + t.btw,
    bijgewerkt_op = now()
  from (
    select
      coalesce(sum(round(aantal * eenheidsprijs * (1 - korting_pct / 100), 2)), 0) as excl,
      coalesce(sum(round(round(aantal * eenheidsprijs * (1 - korting_pct / 100), 2) * btw_tarief / 100, 2)), 0) as btw
    from documentlijnen where document_id = doc
  ) t
  where d.id = doc;
  return null;
end $$;

create trigger documentlijn_totalen
  after insert or update or delete on documentlijnen
  for each row execute function document_totalen_bijwerken();

-- ------------------------------------------------------------
-- 7. Voorraad
--
-- De voorraad van een product is de som van zijn mutaties. Een leverbon
-- maakt een negatieve mutatie, een ontvangstbon een positieve, en een
-- telling een correctie. Zo is elke wijziging traceerbaar.
-- ------------------------------------------------------------

create table voorraadmutaties (
  id              uuid primary key default gen_random_uuid(),
  bedrijf_id      uuid not null references bedrijven (id),
  product_id      uuid not null references producten (id) on delete cascade,
  datum           date not null default current_date,
  aantal          numeric(12,2) not null,
  soort           text not null check (soort in ('beginvoorraad', 'levering', 'ontvangst', 'correctie')),
  document_id     uuid references documenten (id) on delete set null,
  opmerking       text,
  aangemaakt_op   timestamptz not null default now(),
  aangemaakt_door uuid references profielen (id)
);
create index voorraadmutaties_product on voorraadmutaties (product_id, datum);

create or replace function voorraad_bijwerken()
returns trigger language plpgsql as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    update producten set voorraad = coalesce((select sum(aantal) from voorraadmutaties where product_id = old.product_id), 0)
    where id = old.product_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    update producten set voorraad = coalesce((select sum(aantal) from voorraadmutaties where product_id = new.product_id), 0)
    where id = new.product_id;
  end if;
  return null;
end $$;

create trigger voorraadmutatie_voorraad
  after insert or update or delete on voorraadmutaties
  for each row execute function voorraad_bijwerken();

-- ------------------------------------------------------------
-- 8. Boekhouding: dagboeken, boekingen, boekingslijnen
--
-- Eén tabel boekingen met een kolom 'dagboek'. Elke boeking heeft
-- lijnen met debet en credit, en de som moet kloppen: dat controleert
-- de databank zelf bij het bewaren.
-- ------------------------------------------------------------

create table boekingen (
  id                uuid primary key default gen_random_uuid(),
  bedrijf_id        uuid not null references bedrijven (id),
  dagboek           text not null check (dagboek in ('aankoop', 'verkoop', 'financieel', 'divers')),
  jaar              int not null default extract(year from current_date),
  nummer            int,
  datum             date not null default current_date,
  omschrijving      text not null,
  relatie_id        uuid references relaties (id),
  document_id       uuid references documenten (id) on delete set null,
  -- Financieel dagboek: het nummer van het rekeninguittreksel.
  uittreksel_nummer text,
  aangemaakt_op     timestamptz not null default now(),
  aangemaakt_door   uuid references profielen (id),
  unique (bedrijf_id, dagboek, jaar, nummer)
);
create index boekingen_bedrijf on boekingen (bedrijf_id, dagboek, datum);

create or replace function boeking_nummeren()
returns trigger language plpgsql as $$
begin
  if new.nummer is null then
    new.nummer := volgend_nummer(new.bedrijf_id, 'boeking_' || new.dagboek, new.jaar);
  end if;
  return new;
end $$;

create trigger boeking_nummer before insert on boekingen
  for each row execute function boeking_nummeren();

create table boekingslijnen (
  id           uuid primary key default gen_random_uuid(),
  boeking_id   uuid not null references boekingen (id) on delete cascade,
  rekening_id  uuid not null references rekeningen (id),
  omschrijving text,
  debet        numeric(12,2) not null default 0 check (debet >= 0),
  credit       numeric(12,2) not null default 0 check (credit >= 0),
  volgorde     int not null default 0,
  -- Een lijn is óf debet óf credit, nooit allebei.
  constraint debet_of_credit check (not (debet > 0 and credit > 0))
);
create index boekingslijnen_boeking on boekingslijnen (boeking_id);
create index boekingslijnen_rekening on boekingslijnen (rekening_id);

-- Debet = credit, gecontroleerd bij het afsluiten van de transactie
-- (deferred), zodat de lijnen één voor één ingevoegd mogen worden.
create or replace function boeking_moet_in_evenwicht()
returns trigger language plpgsql as $$
declare b uuid; d numeric; c numeric;
begin
  b := coalesce(new.boeking_id, old.boeking_id);
  if not exists (select 1 from boekingen where id = b) then
    return null; -- de boeking zelf is weg; niets te controleren
  end if;
  select coalesce(sum(debet), 0), coalesce(sum(credit), 0) into d, c
  from boekingslijnen where boeking_id = b;
  if d <> c then
    raise exception 'Boeking niet in evenwicht: debet % en credit % verschillen', d, c;
  end if;
  return null;
end $$;

create constraint trigger boekingslijn_evenwicht
  after insert or update or delete on boekingslijnen
  deferrable initially deferred
  for each row execute function boeking_moet_in_evenwicht();

-- Saldi per rekening per bedrijf: de bron voor balans en
-- resultatenrekening. security_invoker zorgt dat RLS op boekingen
-- gewoon geldt: een student ziet alleen de saldi van het eigen bedrijf.
create view rekeningsaldi with (security_invoker = true) as
  select
    b.bedrijf_id,
    r.id      as rekening_id,
    r.nummer,
    r.naam,
    r.soort,
    sum(l.debet)  as debet,
    sum(l.credit) as credit,
    -- Actief en kost: debetsaldo positief. Passief en opbrengst: creditsaldo positief.
    case when r.soort in ('actief', 'kost')
         then sum(l.debet) - sum(l.credit)
         else sum(l.credit) - sum(l.debet) end as saldo
  from boekingslijnen l
  join boekingen b on b.id = l.boeking_id
  join rekeningen r on r.id = l.rekening_id
  group by b.bedrijf_id, r.id, r.nummer, r.naam, r.soort;

-- ------------------------------------------------------------
-- 9. Logboek: wie deed wat, voor de docent
-- ------------------------------------------------------------

create table logboek (
  id           uuid primary key default gen_random_uuid(),
  bedrijf_id   uuid references bedrijven (id),
  gebruiker_id uuid references profielen (id),
  tijdstip     timestamptz not null default now(),
  actie        text not null,
  onderwerp    text,
  onderwerp_id uuid,
  details      jsonb
);
create index logboek_bedrijf on logboek (bedrijf_id, tijdstip desc);

-- ------------------------------------------------------------
-- 10. bijgewerkt_op automatisch
-- ------------------------------------------------------------

create or replace function zet_bijgewerkt_op()
returns trigger language plpgsql as $$
begin
  new.bijgewerkt_op := now();
  return new;
end $$;

create trigger bestellingen_bijgewerkt before update on bestellingen
  for each row execute function zet_bijgewerkt_op();
create trigger documenten_bijgewerkt before update on documenten
  for each row execute function zet_bijgewerkt_op();

-- ------------------------------------------------------------
-- 11. Row Level Security
--
-- Het patroon voor elke bedrijfstabel: je mag een rij lezen en
-- schrijven als mag_bedrijf(bedrijf_id) waar is. Kindtabellen zonder
-- bedrijf_id (lijnen) kijken naar hun ouder.
-- ------------------------------------------------------------

alter table bedrijven          enable row level security;
alter table instellingen       enable row level security;
alter table profielen          enable row level security;
alter table relaties           enable row level security;
alter table productcategorieen enable row level security;
alter table rekeningen         enable row level security;
alter table producten          enable row level security;
alter table nummerreeksen      enable row level security;
alter table bestellingen       enable row level security;
alter table bestellijnen       enable row level security;
alter table documenten         enable row level security;
alter table documentlijnen     enable row level security;
alter table voorraadmutaties   enable row level security;
alter table boekingen          enable row level security;
alter table boekingslijnen     enable row level security;
alter table logboek            enable row level security;

-- Gedeelde tabellen: iedereen leest, alleen de docent schrijft.
create policy bedrijven_lezen     on bedrijven    for select to authenticated using (true);
create policy bedrijven_schrijven on bedrijven    for all    to authenticated using (is_docent()) with check (is_docent());
create policy instellingen_lezen  on instellingen for select to authenticated using (true);
create policy instellingen_schr   on instellingen for all    to authenticated using (is_docent()) with check (is_docent());
create policy rekeningen_lezen    on rekeningen   for select to authenticated using (true);
create policy rekeningen_schr     on rekeningen   for all    to authenticated using (is_docent()) with check (is_docent());

-- Profielen: je ziet jezelf, je collega's van hetzelfde bedrijf en de
-- docenten. De docent ziet iedereen en beheert alles.
create policy profielen_lezen on profielen for select to authenticated
  using (is_docent() or id = auth.uid() or rol = 'docent' or bedrijf_id = mijn_bedrijf());
create policy profielen_eigen_naam on profielen for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy profielen_docent on profielen for all to authenticated
  using (is_docent()) with check (is_docent());

-- Een student mag alleen de eigen naam wijzigen, niet de rol of het
-- bedrijf. RLS werkt per rij, niet per kolom; dit vangt de rest.
create or replace function profiel_beveiligen()
returns trigger language plpgsql as $$
begin
  if not is_docent() then
    new.rol        := old.rol;
    new.bedrijf_id := old.bedrijf_id;
    new.actief     := old.actief;
  end if;
  return new;
end $$;

create trigger profiel_beveiligd before update on profielen
  for each row execute function profiel_beveiligen();

-- Bedrijfstabellen.
create policy relaties_bedrijf on relaties for all to authenticated
  using (mag_bedrijf(bedrijf_id)) with check (mag_bedrijf(bedrijf_id));
create policy categorieen_bedrijf on productcategorieen for all to authenticated
  using (mag_bedrijf(bedrijf_id)) with check (mag_bedrijf(bedrijf_id));
create policy producten_bedrijf on producten for all to authenticated
  using (mag_bedrijf(bedrijf_id)) with check (mag_bedrijf(bedrijf_id));
create policy bestellingen_bedrijf on bestellingen for all to authenticated
  using (mag_bedrijf(bedrijf_id)) with check (mag_bedrijf(bedrijf_id));
create policy documenten_bedrijf on documenten for all to authenticated
  using (mag_bedrijf(bedrijf_id)) with check (mag_bedrijf(bedrijf_id));
create policy voorraad_bedrijf on voorraadmutaties for all to authenticated
  using (mag_bedrijf(bedrijf_id)) with check (mag_bedrijf(bedrijf_id));
create policy boekingen_bedrijf on boekingen for all to authenticated
  using (mag_bedrijf(bedrijf_id)) with check (mag_bedrijf(bedrijf_id));
create policy logboek_bedrijf on logboek for all to authenticated
  using (mag_bedrijf(bedrijf_id)) with check (mag_bedrijf(bedrijf_id));

-- Lijnen: via de ouder.
create policy bestellijnen_bedrijf on bestellijnen for all to authenticated
  using (exists (select 1 from bestellingen b where b.id = bestelling_id and mag_bedrijf(b.bedrijf_id)))
  with check (exists (select 1 from bestellingen b where b.id = bestelling_id and mag_bedrijf(b.bedrijf_id)));
create policy documentlijnen_bedrijf on documentlijnen for all to authenticated
  using (exists (select 1 from documenten d where d.id = document_id and mag_bedrijf(d.bedrijf_id)))
  with check (exists (select 1 from documenten d where d.id = document_id and mag_bedrijf(d.bedrijf_id)));
create policy boekingslijnen_bedrijf on boekingslijnen for all to authenticated
  using (exists (select 1 from boekingen b where b.id = boeking_id and mag_bedrijf(b.bedrijf_id)))
  with check (exists (select 1 from boekingen b where b.id = boeking_id and mag_bedrijf(b.bedrijf_id)));

-- Nummerreeksen: alleen via de functie volgend_nummer (security definer).
-- Geen policies = niemand kan er rechtstreeks aan.

-- ------------------------------------------------------------
-- 12. Opslag: productfoto's (publiek leesbaar) en pdf's (privé)
--
-- Bestanden staan altijd in een map met de bedrijf_id als naam:
--   productfotos/<bedrijf_id>/<product_id>.jpg
--   documenten/<bedrijf_id>/<document_id>.pdf
-- Zo kan dezelfde regel als elders gelden: mag_bedrijf(map).
-- ------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('productfotos', 'productfotos', true,  5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('documenten',   'documenten',   false, 10485760, array['application/pdf'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create or replace function opslag_mag(naam text)
returns boolean language sql stable security definer set search_path = public as $$
  select mag_bedrijf(nullif((storage.foldername(naam))[1], '')::uuid)
$$;

create policy verde_opslag_lezen on storage.objects for select to authenticated
  using (bucket_id in ('productfotos', 'documenten') and opslag_mag(name));
create policy verde_opslag_toevoegen on storage.objects for insert to authenticated
  with check (bucket_id in ('productfotos', 'documenten') and opslag_mag(name));
create policy verde_opslag_bijwerken on storage.objects for update to authenticated
  using (bucket_id in ('productfotos', 'documenten') and opslag_mag(name));
create policy verde_opslag_wissen on storage.objects for delete to authenticated
  using (bucket_id in ('productfotos', 'documenten') and opslag_mag(name));
