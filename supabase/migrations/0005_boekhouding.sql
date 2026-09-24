-- ============================================================
-- Fase 4 — de boekhouding.
--
--   dagboek VERKOPEN   vult zichzelf: een factuur of creditnota die
--                      definitief wordt, wordt meteen geboekt.
--   dagboek AANKOPEN   vult zichzelf met aankoopfacturen.
--   FINANCIEEL         de uittreksels van de gedeelde bankrekening,
--                      met de hand, via betaling_boeken().
--   DIVERS             alles wat overblijft, via divers_boeken().
--
-- Balans en resultatenrekening zijn geen tabellen: saldi_tot() berekent
-- ze uit de boekingslijnen. Wat in een dagboek staat, staat dus meteen
-- in de balans.
--
-- Alle functies draaien als de ingelogde gebruiker (security invoker),
-- behalve gedeelde_bankrekening(): die laat iedereen het volledige
-- uittreksel van de gedeelde rekening zien, ook de regels van de andere
-- dochter. Boeken voor de andere dochter blijft onmogelijk.
-- ============================================================

-- Een aankoopfactuur heeft het nummer van de leverancier én een eigen
-- volgnummer in het aankoopdagboek (AF-2026-0001).
alter table documenten add column extern_nummer text;

create or replace function document_nummeren()
returns trigger language plpgsql as $$
declare voorvoegsel text;
begin
  if new.nummer is null then
    voorvoegsel := case new.soort
      when 'offerte'        then 'OF'
      when 'bestelbon'      then 'BB'
      when 'leverbon'       then 'LB'
      when 'ontvangstbon'   then 'OB'
      when 'factuur'        then 'F'
      when 'creditnota'     then 'CN'
      when 'aankoopfactuur' then 'AF'
      else 'D' end;
    new.volgnummer := volgend_nummer(new.bedrijf_id, 'document_' || new.soort, new.jaar);
    new.nummer := voorvoegsel || '-' || new.jaar || '-' || lpad(new.volgnummer::text, 4, '0');
  end if;
  return new;
end $$;

-- Ook van een aankoopfactuur maar één lopende per aankooporder.
drop index een_actief_document_per_bestelling;
create unique index een_actief_document_per_bestelling
  on documenten (bestelling_id, soort)
  where soort in ('leverbon', 'ontvangstbon', 'factuur', 'aankoopfactuur') and status <> 'geannuleerd';

-- Hulpje: rekening opzoeken op nummer.
create or replace function rek(p_nummer text)
returns uuid language sql stable as $$
  select id from rekeningen where nummer = p_nummer
$$;

-- ------------------------------------------------------------
-- boek_document: een definitieve factuur, creditnota of aankoopfactuur
-- in het juiste dagboek boeken.
--
--   factuur          400 Klanten  D  incl.  /  7xx omzet  C  excl.  /  451 btw  C
--   creditnota       omgekeerd
--   aankoopfactuur   6xx kosten   D  excl.  /  411 btw    D         /  440 leveranciers C incl.
--
-- De bedragen per lijn worden precies zo afgerond als de totalen van het
-- document (per lijn op de cent), zodat de boeking altijd klopt met de pdf.
-- ------------------------------------------------------------

create or replace function boek_document(p_id uuid)
returns uuid language plpgsql as $$
declare
  d          documenten%rowtype;
  i          instellingen%rowtype;
  v_dagboek  text;
  v_boeking  uuid;
  v_relatie  text;
  v_teken    int := 1;   -- 1 = gewone richting, -1 = omgekeerd (creditnota)
begin
  select * into d from documenten where id = p_id;
  select * into i from instellingen where id = 1;

  if d.soort in ('factuur', 'creditnota') then
    v_dagboek := 'verkoop';
    if d.soort = 'creditnota' then v_teken := -1; end if;
  elsif d.soort = 'aankoopfactuur' then
    v_dagboek := 'aankoop';
  else
    return null;
  end if;

  -- Nooit twee keer boeken.
  if exists (select 1 from boekingen where document_id = p_id and dagboek = v_dagboek) then
    return null;
  end if;

  select naam into v_relatie from relaties where id = d.relatie_id;

  insert into boekingen (bedrijf_id, dagboek, jaar, datum, omschrijving, relatie_id, document_id, aangemaakt_door)
  values (
    d.bedrijf_id, v_dagboek, extract(year from d.datum)::int, d.datum,
    case d.soort
      when 'factuur'        then 'Factuur '        || d.nummer
      when 'creditnota'     then 'Creditnota '     || d.nummer
      else                       'Aankoopfactuur ' || d.nummer || coalesce(' (' || d.extern_nummer || ')', '')
    end || ' · ' || coalesce(v_relatie, ''),
    d.relatie_id, d.id, auth.uid()
  )
  returning id into v_boeking;

  if v_dagboek = 'verkoop' then
    -- Klanten: het totaal incl. btw.
    insert into boekingslijnen (boeking_id, rekening_id, omschrijving, debet, credit, volgorde)
    values (v_boeking, rek(i.rek_klanten), v_relatie,
            case when v_teken = 1 then d.totaal_incl else 0 end,
            case when v_teken = 1 then 0 else d.totaal_incl end, 0);

    -- Omzet per rekening, excl. btw.
    insert into boekingslijnen (boeking_id, rekening_id, omschrijving, debet, credit, volgorde)
    select v_boeking, r.rekening, null,
           case when v_teken = 1 then 0 else r.bedrag end,
           case when v_teken = 1 then r.bedrag else 0 end,
           1
    from (
      select coalesce(l.rekening_id, p.verkoop_rekening_id,
                      case when p.id is not null and not p.voorraad_bijhouden then rek('702') end,
                      rek(i.rek_omzet)) as rekening,
             sum(round(l.aantal * l.eenheidsprijs * (1 - l.korting_pct / 100), 2)) as bedrag
      from documentlijnen l
      left join producten p on p.id = l.product_id
      where l.document_id = p_id
      group by 1
    ) r
    where r.bedrag <> 0;

    -- Btw.
    if d.totaal_btw <> 0 then
      insert into boekingslijnen (boeking_id, rekening_id, omschrijving, debet, credit, volgorde)
      values (v_boeking, rek(i.rek_btw_te_betalen), 'Btw',
              case when v_teken = 1 then 0 else d.totaal_btw end,
              case when v_teken = 1 then d.totaal_btw else 0 end, 2);
    end if;

  else
    -- Kosten per rekening, excl. btw.
    insert into boekingslijnen (boeking_id, rekening_id, omschrijving, debet, credit, volgorde)
    select v_boeking, r.rekening, null, r.bedrag, 0, 0
    from (
      select coalesce(l.rekening_id, p.aankoop_rekening_id, rek(i.rek_aankopen)) as rekening,
             sum(round(l.aantal * l.eenheidsprijs * (1 - l.korting_pct / 100), 2)) as bedrag
      from documentlijnen l
      left join producten p on p.id = l.product_id
      where l.document_id = p_id
      group by 1
    ) r
    where r.bedrag <> 0;

    if d.totaal_btw <> 0 then
      insert into boekingslijnen (boeking_id, rekening_id, omschrijving, debet, credit, volgorde)
      values (v_boeking, rek(i.rek_btw_terug), 'Aftrekbare btw', d.totaal_btw, 0, 1);
    end if;

    insert into boekingslijnen (boeking_id, rekening_id, omschrijving, debet, credit, volgorde)
    values (v_boeking, rek(i.rek_leveranciers), v_relatie, 0, d.totaal_incl, 2);
  end if;

  return v_boeking;
end $$;

-- ------------------------------------------------------------
-- document_definitief: zoals in fase 3, plus de aankoopfactuur en het
-- boeken in het dagboek.
-- ------------------------------------------------------------

create or replace function document_definitief(p_id uuid)
returns void language plpgsql as $$
declare
  d          documenten%rowtype;
  tekort     text;
  factuur    documenten%rowtype;
  al_gecrediteerd numeric;
begin
  select * into d from documenten where id = p_id for update;
  if not found then
    raise exception 'Document niet gevonden.';
  end if;
  if d.status <> 'concept' then
    raise exception 'Alleen een concept kan definitief gemaakt worden.';
  end if;
  if not exists (select 1 from documentlijnen where document_id = p_id) then
    raise exception 'Dit document heeft geen lijnen.';
  end if;

  if d.soort = 'leverbon' then
    perform 1 from producten
      where id in (select product_id from documentlijnen where document_id = p_id)
      for update;

    select string_agg(format('%s (voorraad %s, nodig %s)', p.naam, p.voorraad, n.nodig), ', ')
      into tekort
      from (
        select product_id, sum(aantal) as nodig
        from documentlijnen
        where document_id = p_id and product_id is not null
        group by product_id
      ) n
      join producten p on p.id = n.product_id
      where p.voorraad_bijhouden and p.voorraad < n.nodig;

    if tekort is not null then
      raise exception 'Onvoldoende voorraad: %. Registreer eerst een ontvangst of pas de voorraad aan.', tekort;
    end if;

    insert into voorraadmutaties (bedrijf_id, product_id, datum, aantal, soort, document_id, opmerking, aangemaakt_door)
      select d.bedrijf_id, l.product_id, d.datum, -sum(l.aantal), 'levering', d.id, 'Leverbon ' || d.nummer, auth.uid()
      from documentlijnen l
      join producten p on p.id = l.product_id
      where l.document_id = p_id and p.voorraad_bijhouden
      group by l.product_id;

    update bestellingen set status = 'geleverd'
      where id = d.bestelling_id and status in ('nieuw', 'in_behandeling', 'klaar');

  elsif d.soort = 'ontvangstbon' then
    insert into voorraadmutaties (bedrijf_id, product_id, datum, aantal, soort, document_id, opmerking, aangemaakt_door)
      select d.bedrijf_id, l.product_id, d.datum, sum(l.aantal), 'ontvangst', d.id, 'Ontvangstbon ' || d.nummer, auth.uid()
      from documentlijnen l
      join producten p on p.id = l.product_id
      where l.document_id = p_id and p.voorraad_bijhouden
      group by l.product_id;

    update bestellingen set status = 'geleverd'
      where id = d.bestelling_id and status in ('nieuw', 'in_behandeling', 'klaar');

  elsif d.soort = 'factuur' then
    update bestellingen set status = 'gefactureerd'
      where id = d.bestelling_id and status <> 'geannuleerd';

  elsif d.soort = 'aankoopfactuur' then
    if coalesce(trim(d.extern_nummer), '') = '' then
      raise exception 'Vul het factuurnummer van de leverancier in.';
    end if;
    update bestellingen set status = 'gefactureerd'
      where id = d.bestelling_id and status <> 'geannuleerd';

  elsif d.soort = 'creditnota' then
    select * into factuur from documenten where id = d.bron_document_id;
    if factuur.soort <> 'factuur' or factuur.status <> 'definitief' then
      raise exception 'Een creditnota kan alleen bij een definitieve factuur.';
    end if;
    select coalesce(sum(totaal_incl), 0) into al_gecrediteerd
      from documenten
      where bron_document_id = factuur.id and soort = 'creditnota' and status = 'definitief';
    if al_gecrediteerd + d.totaal_incl > factuur.totaal_incl then
      raise exception 'Te veel gecrediteerd: de factuur bedraagt %, er is al % gecrediteerd en deze creditnota is %.',
        factuur.totaal_incl, al_gecrediteerd, d.totaal_incl;
    end if;

    if d.voorraad_terug then
      insert into voorraadmutaties (bedrijf_id, product_id, datum, aantal, soort, document_id, opmerking, aangemaakt_door)
        select d.bedrijf_id, l.product_id, d.datum, sum(l.aantal), 'retour', d.id, 'Retour creditnota ' || d.nummer, auth.uid()
        from documentlijnen l
        join producten p on p.id = l.product_id
        where l.document_id = p_id and p.voorraad_bijhouden
        group by l.product_id;
    end if;
  end if;

  update documenten set status = 'definitief', definitief_op = now() where id = p_id;

  -- Meteen in het dagboek (doet niets voor offertes, bonnen, ...).
  perform boek_document(p_id);
end $$;

-- ------------------------------------------------------------
-- Openstaand bedrag van een factuur of aankoopfactuur.
--
-- Bij een factuur tellen de definitieve creditnota's mee: wat
-- gecrediteerd is, hoeft de klant niet meer te betalen. `betaald` is het
-- netto ontvangen (of betaalde) bedrag: een terugbetaling maakt het kleiner.
-- ------------------------------------------------------------

create or replace function openstaand(p_id uuid)
returns numeric language sql stable as $$
  select d.totaal_incl
         - d.betaald
         - coalesce((select sum(c.totaal_incl) from documenten c
                     where c.bron_document_id = d.id and c.soort = 'creditnota' and c.status = 'definitief'), 0)
  from documenten d where d.id = p_id
$$;

-- ------------------------------------------------------------
-- betaling_boeken: één regel van een rekeninguittreksel.
--
--   p_bedrag > 0   geld komt binnen   550 Bank D  /  tegenrekening C
--   p_bedrag < 0   geld gaat buiten   tegenrekening D  /  550 Bank C
--
-- De tegenrekening is 400 Klanten (betaling van een factuur), 440
-- Leveranciers (betaling van een aankoopfactuur), of een vrij gekozen
-- rekening (kapitaal, bankkosten, lonen, ...).
-- ------------------------------------------------------------

create or replace function betaling_boeken(
  p_bedrijf      uuid,
  p_datum        date,
  p_uittreksel   text,
  p_omschrijving text,
  p_bedrag       numeric,
  p_document     uuid,
  p_rekening     uuid
) returns uuid language plpgsql as $$
declare
  i          instellingen%rowtype;
  d          documenten%rowtype;
  v_tegen    uuid;
  v_relatie  uuid;
  v_boeking  uuid;
  v_bedrag   numeric := round(p_bedrag, 2);
  v_open     numeric;
begin
  if not mag_bedrijf(p_bedrijf) then
    raise exception 'Je kunt alleen boeken voor je eigen bedrijf.';
  end if;
  if v_bedrag = 0 then
    raise exception 'Het bedrag mag niet nul zijn.';
  end if;
  select * into i from instellingen where id = 1;

  if p_document is not null then
    select * into d from documenten where id = p_document for update;
    if not found or d.bedrijf_id <> p_bedrijf then
      raise exception 'Die factuur hoort niet bij dit bedrijf.';
    end if;
    if d.status <> 'definitief' then
      raise exception 'Alleen een definitieve factuur kan betaald worden.';
    end if;
    v_open := openstaand(d.id);

    if d.soort = 'factuur' then
      v_tegen := rek(i.rek_klanten);
      -- Ontvangst: niet meer dan wat openstaat. Terugbetaling: niet meer dan wat te veel betaald is.
      if v_bedrag > 0 and v_bedrag > v_open then
        raise exception 'Er staat nog maar % open op factuur %.', v_open, d.nummer;
      end if;
      if v_bedrag < 0 and v_open >= 0 then
        raise exception 'Factuur % is niet te veel betaald; er valt niets terug te betalen.', d.nummer;
      end if;
      if v_bedrag < 0 and -v_bedrag > -v_open then
        raise exception 'Er is maar % te veel betaald op factuur %.', -v_open, d.nummer;
      end if;
      update documenten set betaald = betaald + v_bedrag where id = d.id;

    elsif d.soort = 'aankoopfactuur' then
      v_tegen := rek(i.rek_leveranciers);
      if v_bedrag > 0 then
        raise exception 'Een aankoopfactuur betaal je: het bedrag moet negatief zijn (geld gaat buiten).';
      end if;
      if -v_bedrag > v_open then
        raise exception 'Er staat nog maar % open op aankoopfactuur %.', v_open, d.nummer;
      end if;
      update documenten set betaald = betaald - v_bedrag where id = d.id;

    else
      raise exception 'Koppel een betaling aan een factuur of aankoopfactuur. Een creditnota verrekent zich met haar factuur.';
    end if;
    v_relatie := d.relatie_id;
  else
    if p_rekening is null then
      raise exception 'Kies een factuur of een tegenrekening.';
    end if;
    if p_rekening = rek(i.rek_bank) then
      raise exception 'De tegenrekening kan niet de bank zelf zijn.';
    end if;
    v_tegen := p_rekening;
  end if;

  insert into boekingen (bedrijf_id, dagboek, jaar, datum, omschrijving, relatie_id, document_id, uittreksel_nummer, aangemaakt_door)
  values (p_bedrijf, 'financieel', extract(year from p_datum)::int, p_datum,
          coalesce(nullif(trim(p_omschrijving), ''), case when d.id is not null then 'Betaling ' || d.nummer else 'Bankverrichting' end),
          v_relatie, p_document, nullif(trim(p_uittreksel), ''), auth.uid())
  returning id into v_boeking;

  insert into boekingslijnen (boeking_id, rekening_id, debet, credit, volgorde) values
    (v_boeking, rek(i.rek_bank),
     case when v_bedrag > 0 then v_bedrag else 0 end,
     case when v_bedrag < 0 then -v_bedrag else 0 end, 0),
    (v_boeking, v_tegen,
     case when v_bedrag < 0 then -v_bedrag else 0 end,
     case when v_bedrag > 0 then v_bedrag else 0 end, 1);

  return v_boeking;
end $$;

-- ------------------------------------------------------------
-- divers_boeken: een vrije boeking met eigen lijnen (afschrijvingen,
-- kapitaal, correcties). Lijnen als JSON: [{rekening_id, omschrijving,
-- debet, credit}, ...]. De evenwichtscontrole doet de rest.
-- ------------------------------------------------------------

create or replace function divers_boeken(
  p_bedrijf      uuid,
  p_datum        date,
  p_omschrijving text,
  p_lijnen       jsonb
) returns uuid language plpgsql as $$
declare
  v_boeking uuid;
begin
  if not mag_bedrijf(p_bedrijf) then
    raise exception 'Je kunt alleen boeken voor je eigen bedrijf.';
  end if;
  if coalesce(trim(p_omschrijving), '') = '' then
    raise exception 'Geef de boeking een omschrijving.';
  end if;
  if jsonb_array_length(p_lijnen) < 2 then
    raise exception 'Een boeking heeft minstens twee lijnen.';
  end if;

  insert into boekingen (bedrijf_id, dagboek, jaar, datum, omschrijving, aangemaakt_door)
  values (p_bedrijf, 'divers', extract(year from p_datum)::int, p_datum, trim(p_omschrijving), auth.uid())
  returning id into v_boeking;

  insert into boekingslijnen (boeking_id, rekening_id, omschrijving, debet, credit, volgorde)
  select v_boeking,
         (l ->> 'rekening_id')::uuid,
         nullif(trim(l ->> 'omschrijving'), ''),
         round(coalesce((l ->> 'debet')::numeric, 0), 2),
         round(coalesce((l ->> 'credit')::numeric, 0), 2),
         (ord - 1)::int
  from jsonb_array_elements(p_lijnen) with ordinality as t(l, ord);

  return v_boeking;
end $$;

-- ------------------------------------------------------------
-- boeking_verwijderen: alleen financiële en diverse boekingen. Die van
-- verkopen en aankopen volgen hun document en verdwijnen niet los.
-- Een betaling die verdwijnt, zet het openstaande bedrag weer open.
-- ------------------------------------------------------------

create or replace function boeking_verwijderen(p_id uuid)
returns void language plpgsql as $$
declare
  b        boekingen%rowtype;
  d        documenten%rowtype;
  v_bank   numeric;
begin
  select * into b from boekingen where id = p_id for update;
  if not found then
    raise exception 'Boeking niet gevonden.';
  end if;
  if b.dagboek not in ('financieel', 'divers') then
    raise exception 'Een boeking uit het dagboek % hoort bij een document en kan niet los verwijderd worden. Maak een creditnota.', b.dagboek;
  end if;

  if b.dagboek = 'financieel' and b.document_id is not null then
    select * into d from documenten where id = b.document_id for update;
    -- Netto bankbedrag van deze boeking: + binnen, - buiten.
    select coalesce(sum(l.debet - l.credit), 0) into v_bank
      from boekingslijnen l
      where l.boeking_id = p_id and l.rekening_id = rek((select rek_bank from instellingen where id = 1));
    if d.soort = 'factuur' then
      update documenten set betaald = betaald - v_bank where id = d.id;
    elsif d.soort = 'aankoopfactuur' then
      update documenten set betaald = betaald + v_bank where id = d.id;
    end if;
  end if;

  delete from boekingen where id = p_id;
end $$;

-- ------------------------------------------------------------
-- saldi_tot: saldo per rekening tot en met een datum. p_bedrijf null =
-- alle bedrijven samen (de docent in het geconsolideerde zicht; een
-- student ziet door RLS sowieso enkel het eigen bedrijf).
-- ------------------------------------------------------------

create or replace function saldi_tot(p_bedrijf uuid, p_tot date)
returns table (rekening_id uuid, nummer text, naam text, soort text, debet numeric, credit numeric, saldo numeric)
language sql stable as $$
  select r.id, r.nummer, r.naam, r.soort,
         sum(l.debet), sum(l.credit),
         case when r.soort in ('actief', 'kost') then sum(l.debet) - sum(l.credit)
              else sum(l.credit) - sum(l.debet) end
  from boekingslijnen l
  join boekingen b on b.id = l.boeking_id
  join rekeningen r on r.id = l.rekening_id
  where (p_bedrijf is null or b.bedrijf_id = p_bedrijf)
    and (p_tot is null or b.datum <= p_tot)
  group by r.id, r.nummer, r.naam, r.soort
  order by r.nummer
$$;

-- ------------------------------------------------------------
-- voorraad_op_balans: de voorraad op rekening 340 laten overeenkomen met
-- de werkelijke voorraad (tegen aankoopprijs). Het verschil gaat naar
-- 6094 Voorraadwijziging, zoals bij een eindejaarsverrichting.
-- ------------------------------------------------------------

create or replace function voorraad_op_balans(p_bedrijf uuid, p_datum date)
returns numeric language plpgsql as $$
declare
  v_waarde   numeric;
  v_geboekt  numeric;
  v_verschil numeric;
begin
  if not mag_bedrijf(p_bedrijf) then
    raise exception 'Je kunt alleen boeken voor je eigen bedrijf.';
  end if;

  select coalesce(sum(round(greatest(voorraad, 0) * aankoopprijs, 2)), 0) into v_waarde
    from producten where bedrijf_id = p_bedrijf and voorraad_bijhouden;

  select coalesce(sum(l.debet - l.credit), 0) into v_geboekt
    from boekingslijnen l join boekingen b on b.id = l.boeking_id
    where b.bedrijf_id = p_bedrijf and l.rekening_id = rek('340');

  v_verschil := v_waarde - v_geboekt;
  if v_verschil = 0 then
    return 0;
  end if;

  perform divers_boeken(p_bedrijf, p_datum, 'Voorraad op de balans bijwerken',
    jsonb_build_array(
      jsonb_build_object('rekening_id', rek('340'),  'omschrijving', 'Handelsgoederen',
                         'debet', greatest(v_verschil, 0), 'credit', greatest(-v_verschil, 0)),
      jsonb_build_object('rekening_id', rek('6094'), 'omschrijving', 'Voorraadwijziging',
                         'debet', greatest(-v_verschil, 0), 'credit', greatest(v_verschil, 0))
    ));
  return v_verschil;
end $$;

-- ------------------------------------------------------------
-- gedeelde_bankrekening: het volledige uittreksel van de rekening die
-- beide dochters delen, voor iedereen die ingelogd is. Alleen lezen.
-- ------------------------------------------------------------

create or replace function gedeelde_bankrekening(p_tot date default null)
returns table (boeking_id uuid, datum date, uittreksel_nummer text, omschrijving text,
               bedrag numeric, bedrijf_id uuid, bedrijf_naam text, bedrijf_kleur text, aangemaakt_op timestamptz)
language sql stable security definer set search_path = public as $$
  select b.id, b.datum, b.uittreksel_nummer, b.omschrijving,
         sum(l.debet - l.credit), bd.id, bd.naam, bd.kleur, b.aangemaakt_op
  from boekingslijnen l
  join boekingen b on b.id = l.boeking_id
  join bedrijven bd on bd.id = b.bedrijf_id
  where auth.uid() is not null
    and bd.actief
    and l.rekening_id = (select id from rekeningen where nummer = (select rek_bank from instellingen where id = 1))
    and (p_tot is null or b.datum <= p_tot)
  group by b.id, b.datum, b.uittreksel_nummer, b.omschrijving, bd.id, bd.naam, bd.kleur, b.aangemaakt_op
  order by b.datum, b.aangemaakt_op
$$;

-- ------------------------------------------------------------
-- Wat al definitief was vóór deze migratie, alsnog boeken.
-- ------------------------------------------------------------

select boek_document(id)
from documenten
where status = 'definitief' and soort in ('factuur', 'creditnota', 'aankoopfactuur')
order by datum, aangemaakt_op;
