-- =============================================================================
-- DPMS : Distributor Performance Management System
-- Schéma initial (Supabase / PostgreSQL 15+)
--
-- Principes :
--  * Un seul rôle applicatif : l'administrateur (table admins). Les
--    distributeurs n'ont aucun compte : ils sont uniquement des destinataires.
--  * Les calculs (KPI) sont faits par @dpms/core côté serveur web, puis
--    enregistrés en une seule transaction par apply_monthly_import().
--  * Les SMS sont envoyés par le téléphone Android de l'administrateur :
--    il "réserve" des messages en attente (claim_sms), les envoie avec sa SIM,
--    puis remonte le statut (report_sms_status).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Administrateurs
-- -----------------------------------------------------------------------------
create table public.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  full_name  text,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- Le tout premier compte créé devient administrateur. Ensuite, désactiver les
-- inscriptions dans Supabase (Authentication > Sign In / Providers).
create or replace function public.handle_first_admin()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.admins) then
    insert into public.admins (user_id) values (new.id);
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created_first_admin
  after insert on auth.users
  for each row execute function public.handle_first_admin();

-- -----------------------------------------------------------------------------
-- Paramètres
-- -----------------------------------------------------------------------------
create table public.settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

insert into public.settings (key, value) values
  ('ttc_rate',                 '1.26'),   -- TTC = HT × 1,26
  ('sms_interval_seconds',     '5'),      -- pause entre deux SMS (anti-blocage opérateur)
  ('sms_gsm_friendly',         'true'),   -- retirer les accents hors GSM (160 car./SMS)
  ('alert_low_rate_threshold', '0.5');    -- alerte si taux < 50 %

-- -----------------------------------------------------------------------------
-- Référentiel : régions et distributeurs
-- -----------------------------------------------------------------------------
create table public.zones (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  sort_order int  not null default 0,
  created_at timestamptz not null default now()
);

create table public.distributors (
  id         uuid primary key default gen_random_uuid(),
  zone_id    uuid references public.zones (id) on delete set null,
  name       text not null,
  phone      text unique check (phone ~ '^\+236[0-9]{8}$'),
  raw_phone  text,
  city       text not null default '',
  active     boolean not null default true,
  sort_order int not null default 0,
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index distributors_zone_idx on public.distributors (zone_id);

-- -----------------------------------------------------------------------------
-- Périodes, imports, objectifs, ventes
-- -----------------------------------------------------------------------------
create table public.periods (
  code           text primary key check (code ~ '^[0-9]{4}-[0-9]{2}$'),
  starts_on      date not null,
  ends_on        date not null,
  status         text not null default 'open' check (status in ('open', 'closed')),
  weeks          jsonb not null default '[]',   -- [{label:"s1", dates:[...]}]
  as_of          date,                          -- dernier jour avec des ventes
  summary        jsonb,                         -- KPI par région + total
  last_import_id uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table public.import_batches (
  id              uuid primary key default gen_random_uuid(),
  period_code     text not null references public.periods (code) on delete cascade,
  source          text not null default 'web' check (source in ('web', 'mobile')),
  file_name       text not null,
  storage_path    text,
  sheet_name      text,
  status          text not null default 'applied' check (status in ('applied', 'superseded', 'failed')),
  nb_distributors int not null default 0,
  nb_sales        int not null default 0,
  issues          jsonb not null default '[]',
  created_by      uuid default auth.uid(),
  created_at      timestamptz not null default now()
);
create index import_batches_period_idx on public.import_batches (period_code, created_at desc);

alter table public.periods
  add constraint periods_last_import_fk
  foreign key (last_import_id) references public.import_batches (id) on delete set null;

create table public.targets (
  distributor_id uuid not null references public.distributors (id) on delete cascade,
  period_code    text not null references public.periods (code) on delete cascade,
  objective_ht   numeric(16, 2),
  objective_ttc  numeric(16, 2),
  import_id      uuid references public.import_batches (id) on delete set null,
  primary key (distributor_id, period_code)
);

create type public.product as enum ('zebra', 'dw');

create table public.daily_sales (
  distributor_id uuid not null references public.distributors (id) on delete cascade,
  period_code    text not null references public.periods (code) on delete cascade,
  sale_date      date not null,
  product        public.product not null,
  amount         numeric(16, 2) not null,
  import_id      uuid references public.import_batches (id) on delete set null,
  primary key (distributor_id, sale_date, product),
  check (to_char(sale_date, 'YYYY-MM') = period_code)
);
create index daily_sales_period_idx on public.daily_sales (period_code, sale_date);

-- Indicateurs calculés (instantané au dernier import du mois)
create table public.performances (
  distributor_id      uuid not null references public.distributors (id) on delete cascade,
  period_code         text not null references public.periods (code) on delete cascade,
  as_of               date,
  realise_zebra       numeric(16, 2) not null default 0,
  realise_dw          numeric(16, 2) not null default 0,
  realise_ttc         numeric(16, 2) not null default 0,
  objectif_ht         numeric(16, 2),
  objectif_ttc        numeric(16, 2),
  taux                numeric(10, 6),
  raf                 numeric(16, 2),
  moyenne_journaliere numeric(16, 2) not null default 0,
  objectif_journalier numeric(16, 2),
  projection          numeric(16, 2) not null default 0,
  rang                int,
  rang_region         int,
  semaines            jsonb not null default '[]',
  import_id           uuid references public.import_batches (id) on delete set null,
  computed_at         timestamptz not null default now(),
  primary key (distributor_id, period_code)
);
create index performances_period_rank_idx on public.performances (period_code, rang);

-- -----------------------------------------------------------------------------
-- SMS : modèles, campagnes, messages, passerelle Android
-- -----------------------------------------------------------------------------
create table public.sms_templates (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  body       text not null,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.sms_templates (name, body) values
  ('Point de situation',
   'Bonjour {{nom}}, au {{date_arrete}} votre realise {{periode}} est de {{realise}} FCFA sur un objectif de {{objectif}} ({{taux}}). Reste a faire : {{raf}} FCFA. Rang : {{rang}}/{{nb_distributeurs}}.'),
  ('Encouragement fin de mois',
   'Bonjour {{nom}}, il reste {{jours_restants}} jours. Pour atteindre votre objectif, visez {{objectif_journalier}} FCFA par jour. Courage !');

create table public.gateway_devices (
  id           uuid primary key default gen_random_uuid(),
  owner        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name         text not null,
  push_token   text,
  app_version  text,
  battery      int,
  last_seen_at timestamptz,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

create table public.sms_campaigns (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  template_id   uuid references public.sms_templates (id) on delete set null,
  body_template text not null,                 -- copie du modèle au moment de l'envoi
  period_code   text references public.periods (code) on delete set null,
  target        jsonb not null default '{}',   -- critères de ciblage utilisés
  status        text not null default 'queued'
                check (status in ('draft', 'queued', 'sending', 'paused', 'completed', 'cancelled')),
  scheduled_at  timestamptz,                   -- null = dès que possible
  is_test       boolean not null default false,
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  started_at    timestamptz,
  completed_at  timestamptz
);

create table public.sms_messages (
  id             uuid primary key default gen_random_uuid(),
  campaign_id    uuid not null references public.sms_campaigns (id) on delete cascade,
  distributor_id uuid references public.distributors (id) on delete set null,
  phone          text not null check (phone ~ '^\+[0-9]{8,15}$'),
  body           text not null,
  segments       int not null default 1,
  status         text not null default 'pending'
                 check (status in ('pending', 'claimed', 'sent', 'delivered', 'failed', 'cancelled')),
  attempts       int not null default 0,
  device_id      uuid references public.gateway_devices (id) on delete set null,
  claimed_at     timestamptz,
  sent_at        timestamptz,
  delivered_at   timestamptz,
  error          text,
  created_at     timestamptz not null default now()
);
create index sms_messages_campaign_idx on public.sms_messages (campaign_id, status);
create index sms_messages_pending_idx on public.sms_messages (created_at) where status = 'pending';

create table public.alerts (
  id         uuid primary key default gen_random_uuid(),
  type       text not null,
  severity   text not null default 'info' check (severity in ('info', 'success', 'warning', 'error')),
  title      text not null,
  body       text,
  payload    jsonb not null default '{}',
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index alerts_unread_idx on public.alerts (created_at desc) where read_at is null;

create table public.audit_logs (
  id         bigint generated always as identity primary key,
  actor      uuid default auth.uid(),
  action     text not null,
  entity     text not null,
  entity_id  text,
  details    jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Vues
-- -----------------------------------------------------------------------------
create view public.v_campaign_stats with (security_invoker = true) as
select
  c.*,
  count(m.id)                                           as total,
  count(m.id) filter (where m.status = 'pending')       as nb_pending,
  count(m.id) filter (where m.status = 'claimed')       as nb_claimed,
  count(m.id) filter (where m.status in ('sent', 'delivered')) as nb_sent,
  count(m.id) filter (where m.status = 'delivered')     as nb_delivered,
  count(m.id) filter (where m.status = 'failed')        as nb_failed,
  coalesce(sum(m.segments), 0)                          as total_segments
from public.sms_campaigns c
left join public.sms_messages m on m.campaign_id = c.id
group by c.id;

create view public.v_performances with (security_invoker = true) as
select
  p.*,
  d.name  as distributor_name,
  d.phone,
  d.city,
  d.active,
  z.id    as zone_id,
  z.name  as zone_name
from public.performances p
join public.distributors d on d.id = p.distributor_id
left join public.zones z on z.id = d.zone_id;

-- -----------------------------------------------------------------------------
-- Import mensuel (une transaction : tout ou rien)
--
-- p = {
--   period, sheet_name, file_name, storage_path, weeks, as_of, summary, issues,
--   distributors: [{ region, name, phone, raw_phone, city, objective_ht, objective_ttc,
--                    perf: { realise_zebra, ..., rang, rang_region, semaines } }],
--   sales: [{ d: <index distributeur>, date, product, amount }]
-- }
-- Ré-importer le même mois remplace intégralement ses ventes et ses KPI.
-- -----------------------------------------------------------------------------
create or replace function public.apply_monthly_import(p jsonb)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_period    text := p->>'period';
  v_import_id uuid;
  v_ids       uuid[] := '{}';
  v_zone_id   uuid;
  v_dist_id   uuid;
  v_d         jsonb;
  v_idx       int := 0;
begin
  if not public.is_admin() then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  if v_period !~ '^[0-9]{4}-[0-9]{2}$' then
    raise exception 'Période invalide : %', v_period;
  end if;

  insert into periods (code, starts_on, ends_on, weeks)
  values (
    v_period,
    to_date(v_period || '-01', 'YYYY-MM-DD'),
    (to_date(v_period || '-01', 'YYYY-MM-DD') + interval '1 month - 1 day')::date,
    coalesce(p->'weeks', '[]')
  )
  on conflict (code) do update set weeks = excluded.weeks, updated_at = now();

  if (select status from periods where code = v_period) = 'closed' then
    raise exception 'La période % est clôturée : réouvrez-la avant de réimporter.', v_period;
  end if;

  update import_batches set status = 'superseded'
  where period_code = v_period and status = 'applied';

  insert into import_batches (period_code, file_name, storage_path, sheet_name,
                              nb_distributors, nb_sales, issues)
  values (v_period, coalesce(p->>'file_name', 'import.xlsx'), p->>'storage_path', p->>'sheet_name',
          jsonb_array_length(p->'distributors'), jsonb_array_length(p->'sales'),
          coalesce(p->'issues', '[]'))
  returning id into v_import_id;

  -- Régions et distributeurs (rapprochement par téléphone, sinon par nom)
  for v_d in select value from jsonb_array_elements(p->'distributors') loop
    insert into zones (name, sort_order)
    values (v_d->>'region', (select coalesce(max(sort_order), 0) + 1 from zones))
    on conflict (name) do nothing;
    select id into v_zone_id from zones where name = v_d->>'region';

    v_dist_id := null;
    if v_d->>'phone' is not null then
      select id into v_dist_id from distributors where phone = v_d->>'phone';
    end if;
    if v_dist_id is null then
      select id into v_dist_id from distributors
      where upper(name) = upper(v_d->>'name')
        and (phone is null or v_d->>'phone' is null)
      limit 1;
    end if;

    if v_dist_id is null then
      insert into distributors (zone_id, name, phone, raw_phone, city, sort_order)
      values (v_zone_id, v_d->>'name', v_d->>'phone', v_d->>'raw_phone',
              coalesce(v_d->>'city', ''), v_idx)
      returning id into v_dist_id;
    else
      update distributors set
        zone_id    = v_zone_id,
        name       = v_d->>'name',
        phone      = coalesce(v_d->>'phone', phone),
        raw_phone  = v_d->>'raw_phone',
        city       = coalesce(v_d->>'city', city),
        sort_order = v_idx,
        updated_at = now()
      where id = v_dist_id;
    end if;
    v_ids := v_ids || v_dist_id;
    v_idx := v_idx + 1;
  end loop;

  -- Objectifs
  insert into targets (distributor_id, period_code, objective_ht, objective_ttc, import_id)
  select v_ids[(e.ord)::int], v_period,
         (e.value->>'objective_ht')::numeric, (e.value->>'objective_ttc')::numeric, v_import_id
  from jsonb_array_elements(p->'distributors') with ordinality as e(value, ord)
  on conflict (distributor_id, period_code) do update set
    objective_ht = excluded.objective_ht,
    objective_ttc = excluded.objective_ttc,
    import_id = excluded.import_id;

  -- Ventes : remplacement complet du mois
  delete from daily_sales where period_code = v_period;
  insert into daily_sales (distributor_id, period_code, sale_date, product, amount, import_id)
  select v_ids[(s->>'d')::int + 1], v_period, (s->>'date')::date,
         (s->>'product')::product, (s->>'amount')::numeric, v_import_id
  from jsonb_array_elements(p->'sales') as s;

  -- Indicateurs
  delete from performances where period_code = v_period;
  insert into performances (
    distributor_id, period_code, as_of, realise_zebra, realise_dw, realise_ttc,
    objectif_ht, objectif_ttc, taux, raf, moyenne_journaliere, objectif_journalier,
    projection, rang, rang_region, semaines, import_id)
  select
    v_ids[(e.ord)::int], v_period, (p->>'as_of')::date,
    (k->>'realise_zebra')::numeric, (k->>'realise_dw')::numeric, (k->>'realise_ttc')::numeric,
    (k->>'objectif_ht')::numeric, (k->>'objectif_ttc')::numeric, (k->>'taux')::numeric,
    (k->>'raf')::numeric, (k->>'moyenne_journaliere')::numeric,
    (k->>'objectif_journalier')::numeric, (k->>'projection')::numeric,
    (k->>'rang')::int, (k->>'rang_region')::int, coalesce(k->'semaines', '[]'), v_import_id
  from jsonb_array_elements(p->'distributors') with ordinality as e(value, ord),
       lateral (select e.value->'perf' as k) x;

  update periods set
    as_of = (p->>'as_of')::date,
    summary = p->'summary',
    last_import_id = v_import_id,
    updated_at = now()
  where code = v_period;

  insert into audit_logs (action, entity, entity_id, details)
  values ('import', 'period', v_period,
          jsonb_build_object('import_id', v_import_id, 'file', p->>'file_name',
                             'distributors', jsonb_array_length(p->'distributors'),
                             'sales', jsonb_array_length(p->'sales')));

  insert into alerts (type, severity, title, body, payload)
  values ('import_done', 'success', 'Import terminé',
          format('%s : %s distributeurs, %s ventes journalières.', v_period,
                 jsonb_array_length(p->'distributors'), jsonb_array_length(p->'sales')),
          jsonb_build_object('import_id', v_import_id, 'period', v_period));

  return v_import_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Campagnes SMS
-- messages = [{ distributor_id, phone, body, segments }] (déjà personnalisés)
-- -----------------------------------------------------------------------------
create or replace function public.create_sms_campaign(
  p_name text,
  p_template_id uuid,
  p_body_template text,
  p_period_code text,
  p_target jsonb,
  p_messages jsonb,
  p_scheduled_at timestamptz default null,
  p_is_test boolean default false
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  if jsonb_array_length(p_messages) = 0 then
    raise exception 'La campagne ne contient aucun destinataire.';
  end if;

  insert into sms_campaigns (name, template_id, body_template, period_code, target, scheduled_at, is_test)
  values (p_name, p_template_id, p_body_template, p_period_code, coalesce(p_target, '{}'),
          p_scheduled_at, p_is_test)
  returning id into v_id;

  insert into sms_messages (campaign_id, distributor_id, phone, body, segments)
  select v_id, (m->>'distributor_id')::uuid, m->>'phone', m->>'body', coalesce((m->>'segments')::int, 1)
  from jsonb_array_elements(p_messages) as m;

  insert into audit_logs (action, entity, entity_id, details)
  values ('campaign_create', 'sms_campaign', v_id::text,
          jsonb_build_object('name', p_name, 'messages', jsonb_array_length(p_messages)));
  return v_id;
end;
$$;

create or replace function public.set_campaign_status(p_campaign_id uuid, p_status text)
returns void
language plpgsql
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  if p_status not in ('queued', 'paused', 'cancelled') then
    raise exception 'Statut non autorisé : %', p_status;
  end if;
  update sms_campaigns set status = p_status,
    completed_at = case when p_status = 'cancelled' then now() else completed_at end
  where id = p_campaign_id and status not in ('completed', 'cancelled');
  if p_status = 'cancelled' then
    update sms_messages set status = 'cancelled'
    where campaign_id = p_campaign_id and status in ('pending', 'claimed');
  end if;
  insert into audit_logs (action, entity, entity_id, details)
  values ('campaign_' || p_status, 'sms_campaign', p_campaign_id::text, '{}');
end;
$$;

create or replace function public.retry_failed_sms(p_campaign_id uuid)
returns int
language plpgsql
set search_path = public
as $$
declare
  n int;
begin
  if not public.is_admin() then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  update sms_messages set status = 'pending', error = null, device_id = null, claimed_at = null
  where campaign_id = p_campaign_id and status = 'failed';
  get diagnostics n = row_count;
  if n > 0 then
    update sms_campaigns set status = 'sending', completed_at = null where id = p_campaign_id;
  end if;
  return n;
end;
$$;

-- -----------------------------------------------------------------------------
-- Passerelle Android
-- -----------------------------------------------------------------------------

-- Réserve jusqu'à p_limit messages à envoyer. Les messages réservés depuis plus
-- de 10 minutes sans retour (téléphone éteint, appli tuée) sont remis en file.
create or replace function public.claim_sms(p_device_id uuid, p_limit int default 10)
returns setof public.sms_messages
language plpgsql
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;

  update gateway_devices set last_seen_at = now() where id = p_device_id;

  update sms_messages set status = 'pending', device_id = null, claimed_at = null
  where status = 'claimed' and claimed_at < now() - interval '10 minutes';

  update sms_campaigns set status = 'sending', started_at = coalesce(started_at, now())
  where status = 'queued' and (scheduled_at is null or scheduled_at <= now())
    and exists (select 1 from sms_messages m where m.campaign_id = sms_campaigns.id and m.status = 'pending');

  return query
  update sms_messages m set
    status = 'claimed', device_id = p_device_id, claimed_at = now(), attempts = m.attempts + 1
  where m.id in (
    select m2.id
    from sms_messages m2
    join sms_campaigns c on c.id = m2.campaign_id
    where m2.status = 'pending' and c.status = 'sending'
    order by c.is_test desc, m2.created_at, m2.id
    limit greatest(1, least(p_limit, 50))
    for update of m2 skip locked
  )
  returning m.*;
end;
$$;

create or replace function public.report_sms_status(
  p_message_id uuid,
  p_status text,
  p_error text default null
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_campaign uuid;
  v_name text;
  v_left int;
  v_failed int;
  v_total int;
begin
  if not public.is_admin() then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  if p_status not in ('sent', 'delivered', 'failed') then
    raise exception 'Statut invalide : %', p_status;
  end if;

  update sms_messages set
    status       = case
                     -- un accusé "envoyé" arrivant après "livré" ne doit pas rétrograder
                     when status = 'delivered' and p_status = 'sent' then status
                     else p_status end,
    sent_at      = case when p_status in ('sent', 'delivered') then coalesce(sent_at, now()) else sent_at end,
    delivered_at = case when p_status = 'delivered' then now() else delivered_at end,
    error        = case when p_status = 'failed' then p_error else null end
  where id = p_message_id and status <> 'cancelled'
  returning campaign_id into v_campaign;

  if v_campaign is null then
    return;
  end if;

  select count(*) filter (where status in ('pending', 'claimed')),
         count(*) filter (where status = 'failed'),
         count(*)
  into v_left, v_failed, v_total
  from sms_messages where campaign_id = v_campaign;

  if v_left = 0 then
    update sms_campaigns set status = 'completed', completed_at = now()
    where id = v_campaign and status = 'sending'
    returning name into v_name;

    if v_name is not null then
      insert into alerts (type, severity, title, body, payload)
      values ('campaign_done',
              case when v_failed = 0 then 'success' when v_failed * 5 > v_total then 'error' else 'warning' end,
              'Campagne terminée',
              format('« %s » : %s/%s SMS envoyés, %s échec(s).', v_name, v_total - v_failed, v_total, v_failed),
              jsonb_build_object('campaign_id', v_campaign, 'failed', v_failed, 'total', v_total));
    end if;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Horodatage automatique
-- -----------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger distributors_touch before update on public.distributors
  for each row execute function public.touch_updated_at();
create trigger sms_templates_touch before update on public.sms_templates
  for each row execute function public.touch_updated_at();
create trigger settings_touch before update on public.settings
  for each row execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Sécurité : Row Level Security, accès réservé aux administrateurs
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'admins', 'settings', 'zones', 'distributors', 'periods', 'import_batches', 'targets',
    'daily_sales', 'performances', 'sms_templates', 'gateway_devices', 'sms_campaigns',
    'sms_messages', 'alerts', 'audit_logs'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy admin_all on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())',
      t);
  end loop;
end;
$$;

-- Le journal d'audit est en ajout seul
drop policy admin_all on public.audit_logs;
create policy admin_read on public.audit_logs for select to authenticated using (public.is_admin());
create policy admin_insert on public.audit_logs for insert to authenticated with check (public.is_admin());

revoke all on function public.apply_monthly_import(jsonb) from public, anon;
revoke all on function public.create_sms_campaign(text, uuid, text, text, jsonb, jsonb, timestamptz, boolean) from public, anon;
revoke all on function public.set_campaign_status(uuid, text) from public, anon;
revoke all on function public.retry_failed_sms(uuid) from public, anon;
revoke all on function public.claim_sms(uuid, int) from public, anon;
revoke all on function public.report_sms_status(uuid, text, text) from public, anon;

-- -----------------------------------------------------------------------------
-- Temps réel (web + mobile) et stockage des fichiers importés (Supabase)
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      public.sms_messages, public.sms_campaigns, public.alerts, public.periods;
  end if;
end;
$$;

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public) values ('imports', 'imports', false)
    on conflict (id) do nothing;
    execute $p$
      create policy imports_admin on storage.objects for all to authenticated
      using (bucket_id = 'imports' and public.is_admin())
      with check (bucket_id = 'imports' and public.is_admin())
    $p$;
  end if;
end;
$$;
