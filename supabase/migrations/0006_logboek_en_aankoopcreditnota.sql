-- ============================================================
-- Fase 5 — logboek en aankoopcreditnota.
--
-- LOGBOEK: de databank noteert zelf wie wat deed. Een trigger op de
-- belangrijke tabellen schrijft een regel in `logboek`, met de ingelogde
-- gebruiker (auth.uid()). Omdat het in de databank gebeurt, mist er
-- niets, ook niet wat via een andere weg binnenkomt. Niemand kan het
-- logboek zelf aanpassen: er zijn alleen leesregels.
--
-- AANKOOPCREDITNOTA: de creditnota die een leverancier stuurt, gekoppeld
-- aan een aankoopfactuur. Spiegelbeeld van de verkoopcreditnota.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Logboek
-- ------------------------------------------------------------

-- Een account of bedrijf verwijderen mag niet blokkeren op het logboek.
alter table logboek drop constraint logboek_gebruiker_id_fkey;
alter table logboek add constraint logboek_gebruiker_id_fkey
  foreign key (gebruiker_id) references profielen (id) on delete set null;
alter table logboek drop constraint logboek_bedrijf_id_fkey;
alter table logboek add constraint logboek_bedrijf_id_fkey
  foreign key (bedrijf_id) references bedrijven (id) on delete cascade;

-- Alleen lezen: de docent alles, een student het eigen bedrijf.
drop policy if exists logboek_bedrijf on logboek;
create policy logboek_lezen on logboek for select to authenticated
  using (is_docent() or bedrijf_id = mijn_bedrijf());

create index if not exists logboek_gebruiker on logboek (gebruiker_id, tijdstip desc);

create or replace function logboek_schrijf()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r          record;
  o          record;
  v_bedrijf  uuid;
  v_onderwerp text;
  v_actie    text;
  v_details  jsonb := '{}'::jsonb;
begin
  if tg_op = 'DELETE' then r := old; else r := new; end if;
  if tg_op = 'UPDATE' then o := old; end if;
  v_actie := case tg_op when 'INSERT' then 'aangemaakt' when 'UPDATE' then 'gewijzigd' else 'verwijderd' end;

  if tg_table_name = 'relaties' then
    v_bedrijf := r.bedrijf_id;
    v_onderwerp := case r.soort when 'leverancier' then 'Leverancier ' when 'beide' then 'Klant/leverancier ' else 'Klant ' end || r.naam;

  elsif tg_table_name = 'producten' then
    -- De voorraadkolom wordt door een trigger bijgewerkt; dat is geen actie van iemand.
    if tg_op = 'UPDATE' and (to_jsonb(new) - 'voorraad') = (to_jsonb(old) - 'voorraad') then
      return null;
    end if;
    v_bedrijf := r.bedrijf_id;
    v_onderwerp := 'Product ' || r.naam;

  elsif tg_table_name = 'bestellingen' then
    v_bedrijf := r.bedrijf_id;
    v_onderwerp := case r.soort when 'verkoop' then 'Verkooporder ' else 'Aankooporder ' end
                   || r.jaar || '-' || lpad(r.nummer::text, 4, '0');
    if tg_op = 'UPDATE' then
      if new.status is distinct from old.status then
        v_actie := 'status';
        v_details := jsonb_build_object('van', old.status, 'naar', new.status);
      elsif (to_jsonb(new) - 'bijgewerkt_op') = (to_jsonb(old) - 'bijgewerkt_op') then
        return null;
      end if;
    end if;

  elsif tg_table_name = 'documenten' then
    v_bedrijf := r.bedrijf_id;
    v_onderwerp := initcap(r.soort) || ' ' || coalesce(r.nummer, '');
    if tg_op = 'UPDATE' then
      -- Totalen en betaalde bedragen veranderen vanzelf; enkel de status telt.
      if new.status is not distinct from old.status then
        return null;
      end if;
      v_actie := new.status;
    end if;
    if tg_op <> 'DELETE' then
      v_details := jsonb_build_object('totaal', r.totaal_incl);
    end if;

  elsif tg_table_name = 'boekingen' then
    -- Verkoop- en aankoopboekingen volgen een document; dat staat al in het logboek.
    if r.dagboek not in ('financieel', 'divers') then
      return null;
    end if;
    if tg_op = 'UPDATE' then
      return null;
    end if;
    v_bedrijf := r.bedrijf_id;
    v_onderwerp := case r.dagboek when 'financieel' then 'Bankverrichting ' else 'Diverse boeking ' end || r.omschrijving;

  elsif tg_table_name = 'voorraadmutaties' then
    -- Alleen wat met de hand gebeurt; leverbonnen en ontvangstbonnen staan er al.
    if r.document_id is not null or tg_op = 'UPDATE' then
      return null;
    end if;
    v_bedrijf := r.bedrijf_id;
    v_onderwerp := 'Voorraad ' || coalesce((select naam from producten where id = r.product_id), '');
    v_actie := case when tg_op = 'DELETE' then 'verwijderd' else r.soort end;
    v_details := jsonb_build_object('aantal', r.aantal);

  elsif tg_table_name = 'profielen' then
    if tg_op = 'UPDATE' and to_jsonb(new) = to_jsonb(old) then
      return null;
    end if;
    v_bedrijf := r.bedrijf_id;
    v_onderwerp := 'Account ' || r.naam;

  elsif tg_table_name = 'rekeningen' then
    v_onderwerp := 'Rekening ' || r.nummer || ' ' || r.naam;

  elsif tg_table_name = 'bedrijven' then
    -- Geen bedrijf_id: de regel moet een verwijderd bedrijf overleven.
    v_onderwerp := 'Bedrijf ' || r.naam;

  elsif tg_table_name = 'instellingen' then
    v_onderwerp := 'Instellingen van het dossier';
  end if;

  -- Een bedrijf dat net verwijderd wordt, kan geen logregel meer krijgen.
  if v_bedrijf is not null and not exists (select 1 from bedrijven where id = v_bedrijf) then
    return null;
  end if;

  insert into logboek (bedrijf_id, gebruiker_id, actie, onderwerp, onderwerp_id, details)
  values (
    v_bedrijf,
    (select id from profielen where id = auth.uid()),
    v_actie,
    v_onderwerp,
    case when tg_table_name = 'instellingen' then null else r.id end,
    v_details || jsonb_build_object('tabel', tg_table_name)
  );
  return null;
end $$;

create trigger logboek_relaties after insert or update or delete on relaties
  for each row execute function logboek_schrijf();
create trigger logboek_producten after insert or update or delete on producten
  for each row execute function logboek_schrijf();
create trigger logboek_bestellingen after insert or update or delete on bestellingen
  for each row execute function logboek_schrijf();
create trigger logboek_documenten after insert or update or delete on documenten
  for each row execute function logboek_schrijf();
create trigger logboek_boekingen after insert or delete on boekingen
  for each row execute function logboek_schrijf();
create trigger logboek_voorraad after insert or delete on voorraadmutaties
  for each row execute function logboek_schrijf();
create trigger logboek_profielen after insert or update or delete on profielen
  for each row execute function logboek_schrijf();
create trigger logboek_rekeningen after insert or update or delete on rekeningen
  for each row execute function logboek_schrijf();
create trigger logboek_bedrijven after insert or update on bedrijven
  for each row execute function logboek_schrijf();
create trigger logboek_instellingen after update on instellingen
  for each row execute function logboek_schrijf();

-- Activiteit per persoon, voor het docentenpaneel. Als de gebruiker
-- (security invoker): een student ziet alleen het eigen bedrijf.
create or replace function activiteit_per_persoon(p_bedrijf uuid)
returns table (gebruiker_id uuid, naam text, bedrijf_id uuid, aantal bigint, laatste timestamptz, deze_week bigint)
language sql stable as $$
  select p.id, p.naam, p.bedrijf_id,
         count(l.id), max(l.tijdstip),
         count(l.id) filter (where l.tijdstip > now() - interval '7 days')
  from profielen p
  left join logboek l on l.gebruiker_id = p.id
  where p.rol = 'student'
    and (p_bedrijf is null or p.bedrijf_id = p_bedrijf)
  group by p.id, p.naam, p.bedrijf_id
  order by p.naam
$$;

-- Hoe vaak elke rekening gebruikt wordt: een gebruikte rekening kan niet
-- verwijderd worden, enkel uitgeschakeld.
create or replace function rekening_gebruik()
returns table (rekening_id uuid, aantal bigint)
language sql stable security definer set search_path = public as $$
  select rekening_id, count(*) from boekingslijnen group by rekening_id
  union all
  select rekening_id, count(*) from documentlijnen where rekening_id is not null group by rekening_id
$$;

-- ------------------------------------------------------------
-- 2. Aankoopcreditnota
-- ------------------------------------------------------------

alter table documenten drop constraint creditnota_hoort_bij_factuur;
alter table documenten add constraint creditnota_hoort_bij_factuur
  check (soort not in ('creditnota', 'aankoopcreditnota') or bron_document_id is not null);

create or replace function document_nummeren()
returns trigger language plpgsql as $$
declare voorvoegsel text;
begin
  if new.nummer is null then
    voorvoegsel := case new.soort
      when 'offerte'           then 'OF'
      when 'bestelbon'         then 'BB'
      when 'leverbon'          then 'LB'
      when 'ontvangstbon'      then 'OB'
      when 'factuur'           then 'F'
      when 'creditnota'        then 'CN'
      when 'aankoopfactuur'    then 'AF'
      when 'aankoopcreditnota' then 'ACN'
      else 'D' end;
    new.volgnummer := volgend_nummer(new.bedrijf_id, 'document_' || new.soort, new.jaar);
    new.nummer := voorvoegsel || '-' || new.jaar || '-' || lpad(new.volgnummer::text, 4, '0');
  end if;
  return new;
end $$;

-- Openstaand: verkoop- én aankoopcreditnota's verminderen hun factuur.
create or replace function openstaand(p_id uuid)
returns numeric language sql stable as $$
  select d.totaal_incl
         - d.betaald
         - coalesce((select sum(c.totaal_incl) from documenten c
                     where c.bron_document_id = d.id
                       and c.soort in ('creditnota', 'aankoopcreditnota')
                       and c.status = 'definitief'), 0)
  from documenten d where d.id = p_id
$$;

-- Boeken: de aankoopcreditnota is de aankoopfactuur in spiegelbeeld.
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
  elsif d.soort in ('aankoopfactuur', 'aankoopcreditnota') then
    v_dagboek := 'aankoop';
  else
    return null;
  end if;
  if d.soort in ('creditnota', 'aankoopcreditnota') then v_teken := -1; end if;

  if exists (select 1 from boekingen where document_id = p_id and dagboek = v_dagboek) then
    return null;
  end if;

  select naam into v_relatie from relaties where id = d.relatie_id;

  insert into boekingen (bedrijf_id, dagboek, jaar, datum, omschrijving, relatie_id, document_id, aangemaakt_door)
  values (
    d.bedrijf_id, v_dagboek, extract(year from d.datum)::int, d.datum,
    case d.soort
      when 'factuur'        then 'Factuur '    || d.nummer
      when 'creditnota'     then 'Creditnota ' || d.nummer
      when 'aankoopfactuur' then 'Aankoopfactuur ' || d.nummer || coalesce(' (' || d.extern_nummer || ')', '')
      else                       'Aankoopcreditnota ' || d.nummer || coalesce(' (' || d.extern_nummer || ')', '')
    end || ' · ' || coalesce(v_relatie, ''),
    d.relatie_id, d.id, auth.uid()
  )
  returning id into v_boeking;

  if v_dagboek = 'verkoop' then
    insert into boekingslijnen (boeking_id, rekening_id, omschrijving, debet, credit, volgorde)
    values (v_boeking, rek(i.rek_klanten), v_relatie,
            case when v_teken = 1 then d.totaal_incl else 0 end,
            case when v_teken = 1 then 0 else d.totaal_incl end, 0);

    insert into boekingslijnen (boeking_id, rekening_id, omschrijving, debet, credit, volgorde)
    select v_boeking, r.rekening, null,
           case when v_teken = 1 then 0 else r.bedrag end,
           case when v_teken = 1 then r.bedrag else 0 end, 1
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

    if d.totaal_btw <> 0 then
      insert into boekingslijnen (boeking_id, rekening_id, omschrijving, debet, credit, volgorde)
      values (v_boeking, rek(i.rek_btw_te_betalen), 'Btw',
              case when v_teken = 1 then 0 else d.totaal_btw end,
              case when v_teken = 1 then d.totaal_btw else 0 end, 2);
    end if;

  else
    insert into boekingslijnen (boeking_id, rekening_id, omschrijving, debet, credit, volgorde)
    select v_boeking, r.rekening, null,
           case when v_teken = 1 then r.bedrag else 0 end,
           case when v_teken = 1 then 0 else r.bedrag end, 0
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
      values (v_boeking, rek(i.rek_btw_terug), 'Aftrekbare btw',
              case when v_teken = 1 then d.totaal_btw else 0 end,
              case when v_teken = 1 then 0 else d.totaal_btw end, 1);
    end if;

    insert into boekingslijnen (boeking_id, rekening_id, omschrijving, debet, credit, volgorde)
    values (v_boeking, rek(i.rek_leveranciers), v_relatie,
            case when v_teken = 1 then 0 else d.totaal_incl end,
            case when v_teken = 1 then d.totaal_incl else 0 end, 2);
  end if;

  return v_boeking;
end $$;

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

  elsif d.soort in ('creditnota', 'aankoopcreditnota') then
    select * into factuur from documenten where id = d.bron_document_id;
    if d.soort = 'creditnota' and (factuur.soort <> 'factuur' or factuur.status <> 'definitief') then
      raise exception 'Een creditnota kan alleen bij een definitieve factuur.';
    end if;
    if d.soort = 'aankoopcreditnota' then
      if factuur.soort <> 'aankoopfactuur' or factuur.status <> 'definitief' then
        raise exception 'Een creditnota van een leverancier hoort bij een definitieve aankoopfactuur.';
      end if;
      if coalesce(trim(d.extern_nummer), '') = '' then
        raise exception 'Vul het nummer van de creditnota van de leverancier in.';
      end if;
    end if;
    select coalesce(sum(totaal_incl), 0) into al_gecrediteerd
      from documenten
      where bron_document_id = factuur.id and soort = d.soort and status = 'definitief';
    if al_gecrediteerd + d.totaal_incl > factuur.totaal_incl then
      raise exception 'Te veel gecrediteerd: de factuur bedraagt %, er is al % gecrediteerd en deze creditnota is %.',
        factuur.totaal_incl, al_gecrediteerd, d.totaal_incl;
    end if;

    if d.soort = 'creditnota' and d.voorraad_terug then
      insert into voorraadmutaties (bedrijf_id, product_id, datum, aantal, soort, document_id, opmerking, aangemaakt_door)
        select d.bedrijf_id, l.product_id, d.datum, sum(l.aantal), 'retour', d.id, 'Retour creditnota ' || d.nummer, auth.uid()
        from documentlijnen l
        join producten p on p.id = l.product_id
        where l.document_id = p_id and p.voorraad_bijhouden
        group by l.product_id;
    end if;
  end if;

  update documenten set status = 'definitief', definitief_op = now() where id = p_id;
  perform boek_document(p_id);
end $$;

-- Betalingen: een leverancier kan ook terugbetalen (na een creditnota
-- op een factuur die al betaald was). Dat is een ontvangst op de
-- aankoopfactuur, begrensd tot wat er te veel betaald is.
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
      if v_bedrag < 0 and -v_bedrag > v_open then
        raise exception 'Er staat nog maar % open op aankoopfactuur %.', v_open, d.nummer;
      end if;
      if v_bedrag > 0 and v_open >= 0 then
        raise exception 'Een aankoopfactuur betaal je: het bedrag moet negatief zijn (geld gaat buiten).';
      end if;
      if v_bedrag > 0 and v_bedrag > -v_open then
        raise exception 'De leverancier moet maar % terugbetalen op aankoopfactuur %.', -v_open, d.nummer;
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
