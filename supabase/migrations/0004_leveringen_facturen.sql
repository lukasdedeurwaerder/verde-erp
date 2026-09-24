-- ============================================================
-- Fase 3 — leverbonnen, ontvangstbonnen, facturen, creditnota's.
--
-- Het belangrijkste staat in twee functies: document_definitief en
-- document_annuleren. Die doen in ÉÉN transactie alles wat bij die stap
-- hoort: de status van het document, de voorraadbewegingen en de status
-- van de bestelling. Lukt één deel niet, dan gebeurt er niets. Zo kan de
-- voorraad nooit uit de pas lopen met de documenten.
--
-- Beide functies draaien als de ingelogde gebruiker (security invoker):
-- Row Level Security blijft gelden, een student kan dus alleen
-- documenten van het eigen bedrijf definitief maken.
-- ============================================================

-- Een creditnota kan goederen terug in voorraad nemen (retour).
alter table documenten add column voorraad_terug boolean not null default false;

-- Nieuwe soort voorraadbeweging voor zo'n retour.
alter table voorraadmutaties drop constraint voorraadmutaties_soort_check;
alter table voorraadmutaties add constraint voorraadmutaties_soort_check
  check (soort in ('beginvoorraad', 'levering', 'ontvangst', 'correctie', 'retour'));

-- De koppelingen die de databank zelf afdwingt:
--   offerte, bestelbon, leverbon, ontvangstbon en factuur horen bij een bestelling;
--   een creditnota hoort bij een factuur.
alter table documenten add constraint document_hoort_bij_bestelling
  check (soort not in ('offerte', 'bestelbon', 'leverbon', 'ontvangstbon', 'factuur') or bestelling_id is not null);
alter table documenten add constraint creditnota_hoort_bij_factuur
  check (soort <> 'creditnota' or bron_document_id is not null);

-- Per bestelling hoogstens één lopende (niet-geannuleerde) leverbon,
-- ontvangstbon en factuur. Offertes en bestelbonnen mogen er meer zijn.
create unique index een_actief_document_per_bestelling
  on documenten (bestelling_id, soort)
  where soort in ('leverbon', 'ontvangstbon', 'factuur') and status <> 'geannuleerd';

-- ------------------------------------------------------------
-- document_definitief
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
    -- Genoeg voorraad? De productrijen vergrendelen, zodat twee
    -- leverbonnen tegelijk niet allebei de laatste stuks meenemen.
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
end $$;

-- ------------------------------------------------------------
-- document_annuleren
--
-- Voor een definitieve leverbon of ontvangstbon: de voorraad wordt
-- teruggezet met een tegenboeking, zodat de geschiedenis zichtbaar blijft.
-- Een definitieve factuur of creditnota annuleer je niet: in de
-- boekhouding maak je dan een creditnota.
-- ------------------------------------------------------------

create or replace function document_annuleren(p_id uuid)
returns void language plpgsql as $$
declare
  d documenten%rowtype;
begin
  select * into d from documenten where id = p_id for update;
  if not found then
    raise exception 'Document niet gevonden.';
  end if;
  if d.status = 'geannuleerd' then
    raise exception 'Dit document is al geannuleerd.';
  end if;
  if d.status = 'definitief' and d.soort in ('factuur', 'creditnota') then
    raise exception 'Een definitieve % annuleer je niet. Maak een creditnota.', d.soort;
  end if;

  if d.status = 'definitief' and d.soort in ('leverbon', 'ontvangstbon') then
    insert into voorraadmutaties (bedrijf_id, product_id, datum, aantal, soort, document_id, opmerking, aangemaakt_door)
      select bedrijf_id, product_id, current_date, -aantal, 'correctie', document_id,
             'Annulering ' || d.soort || ' ' || d.nummer, auth.uid()
      from voorraadmutaties
      where document_id = p_id and soort in ('levering', 'ontvangst');

    update bestellingen set status = 'klaar'
      where id = d.bestelling_id and status = 'geleverd';
  end if;

  update documenten set status = 'geannuleerd' where id = p_id;
end $$;
