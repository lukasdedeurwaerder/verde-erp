-- ============================================================
-- Herstel van 0007: de controle op testaccounts las r.email ook bij
-- tabellen zonder e-mailkolom, waardoor bv. een product aanmaken faalde.
-- Nu in aparte stappen. (0007 zelf is ook aangepast, zodat een nieuwe
-- databank meteen de goede versie krijgt.)
-- ============================================================

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

  -- Wat de testscripts doen, hoort niet in het logboek: tijdelijke
  -- testbedrijven en testaccounts (@verde-test.invalid).
  -- Aparte stappen: in een "en"-voorwaarde zou de databank ook r.email
  -- opzoeken bij tabellen die geen e-mailkolom hebben.
  if tg_table_name = 'bedrijven' then
    if r.naam like 'TEST % (wordt verwijderd)' then
      return null;
    end if;
  elsif tg_table_name = 'profielen' then
    if r.email like '%@verde-test.invalid' then
      return null;
    end if;
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
