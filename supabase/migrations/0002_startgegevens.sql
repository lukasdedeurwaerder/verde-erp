-- ============================================================
-- Startgegevens: twee dochters, de instellingen en het
-- rekeningenstelsel.
--
-- De namen van de dochters zijn voorlopig. De docent past ze aan bij
-- Instellingen zodra de studenten ze gekozen hebben.
-- ============================================================

insert into bedrijven (naam, kleur, volgorde) values
  ('Dochter A', '#2563eb', 1),
  ('Dochter B', '#059669', 2);

insert into instellingen (id, moeder_naam) values (1, 'Verde');

-- ------------------------------------------------------------
-- Vereenvoudigd Belgisch rekeningenstelsel (MAR).
--
-- Bewust beperkt tot wat een studentenbedrijf nodig heeft. De docent
-- kan rekeningen toevoegen, hernoemen of uitschakelen bij Instellingen.
-- Nummers volgen het MAR zodat ze overeenkomen met de cursus.
-- ------------------------------------------------------------

insert into rekeningen (nummer, naam, soort) values
  -- Klasse 1: eigen vermogen en schulden op lange termijn
  ('100',  'Kapitaal',                                   'passief'),
  ('140',  'Overgedragen resultaat',                     'passief'),
  ('170',  'Schulden op meer dan één jaar',              'passief'),

  -- Klasse 2: vaste activa
  ('230',  'Installaties, machines en uitrusting',       'actief'),
  ('2309', 'Afschrijvingen op installaties en machines', 'actief'),
  ('240',  'Meubilair en rollend materieel',             'actief'),
  ('2409', 'Afschrijvingen op meubilair en rollend materieel', 'actief'),

  -- Klasse 3: voorraden
  ('340',  'Handelsgoederen',                            'actief'),

  -- Klasse 4: vorderingen en schulden op korte termijn
  ('400',  'Handelsdebiteuren',                          'actief'),
  ('411',  'Terug te vorderen btw',                      'actief'),
  ('416',  'Diverse vorderingen',                        'actief'),
  ('440',  'Leveranciers',                               'passief'),
  ('451',  'Te betalen btw',                             'passief'),
  ('489',  'Diverse schulden',                           'passief'),

  -- Klasse 5: liquide middelen
  ('550',  'Kredietinstellingen: rekening-courant',      'actief'),
  ('570',  'Kas',                                        'actief'),

  -- Klasse 6: kosten
  ('604',  'Aankopen van handelsgoederen',               'kost'),
  ('6094', 'Voorraadwijziging handelsgoederen',          'kost'),
  ('610',  'Huur en huurlasten',                         'kost'),
  ('611',  'Onderhoud en herstellingen',                 'kost'),
  ('612',  'Leveringen aan de onderneming (energie, water)', 'kost'),
  ('613',  'Vergoedingen aan derden (diensten)',         'kost'),
  ('614',  'Reclame en publiciteit',                     'kost'),
  ('615',  'Verzekeringen',                              'kost'),
  ('616',  'Kantoor- en administratiekosten',            'kost'),
  ('620',  'Bezoldigingen',                              'kost'),
  ('630',  'Afschrijvingen',                             'kost'),
  ('640',  'Bedrijfsbelastingen',                        'kost'),
  ('650',  'Financiële kosten (bankkosten, interest)',   'kost'),

  -- Klasse 7: opbrengsten
  ('700',  'Verkopen van handelsgoederen',               'opbrengst'),
  ('702',  'Verkopen van diensten',                      'opbrengst'),
  ('708',  'Toegekende kortingen',                       'opbrengst'),
  ('740',  'Subsidies en andere bedrijfsopbrengsten',    'opbrengst'),
  ('751',  'Financiële opbrengsten',                     'opbrengst');
