-- Move Spread Madness objects from public → spread_madness (data-preserving for tables).
-- Tables: ALTER TABLE ... SET SCHEMA (rows, indexes, RLS, triggers move with the table).
-- Also moves matching types, sequences, functions (finalize_game + sm_*), views, and materialized views.
--
-- BEFORE running:
-- 1) Optional: Supabase → Database → Backups (or SQL dump) for peace of mind.
-- 2) Required: Dashboard → Project Settings → API → Exposed schemas → add `spread_madness` → Save.
--
-- AFTER running: deploy app code that sets supabase-js db.schema to `spread_madness`.
--
-- Safe to re-run: idempotent; cleans empty duplicate tables in either schema when the other holds data.

create schema if not exists spread_madness;

grant usage on schema spread_madness to anon, authenticated, service_role;

-- Remove any public.sm_* from the realtime publication (all known app tables, not only the three in schema.sql)
do $$
declare
  r record;
begin
  for r in
    select pub.schemaname, pub.tablename
    from pg_publication_tables pub
    where pub.pubname = 'supabase_realtime'
      and pub.schemaname = 'public'
      and pub.tablename in (
        'sm_teams', 'sm_games', 'sm_game_instances', 'sm_players', 'sm_ownership',
        'sm_config', 'sm_game_config', 'sm_transfer_events'
      )
  loop
    execute format('alter publication supabase_realtime drop table %I.%I', r.schemaname, r.tablename);
  end loop;
end $$;

-- If empty placeholder tables exist in spread_madness (e.g. schema.sql ran while data lived in public),
-- drop them in dependency order so ALTER TABLE public… SET SCHEMA can succeed.
do $$
declare
  need_drop boolean := false;
  t text;
  tbl text[] := array['sm_teams','sm_games','sm_game_instances','sm_players','sm_ownership','sm_config','sm_game_config','sm_transfer_events'];
  c_pub bigint;
  c_spr bigint;
begin
  foreach t in array tbl
  loop
    if to_regclass('public.' || t) is not null and to_regclass('spread_madness.' || t) is not null then
      execute format('select count(*) from public.%I', t) into c_pub;
      execute format('select count(*) from spread_madness.%I', t) into c_spr;
      if c_spr = 0 and c_pub > 0 then
        need_drop := true;
        exit;
      end if;
    end if;
  end loop;
  if need_drop then
    execute 'drop table if exists spread_madness.sm_transfer_events cascade';
    execute 'drop table if exists spread_madness.sm_ownership cascade';
    execute 'drop table if exists spread_madness.sm_game_config cascade';
    execute 'drop table if exists spread_madness.sm_players cascade';
    execute 'drop table if exists spread_madness.sm_games cascade';
    execute 'drop table if exists spread_madness.sm_teams cascade';
    execute 'drop table if exists spread_madness.sm_game_instances cascade';
    execute 'drop table if exists spread_madness.sm_config cascade';
  end if;
end $$;

-- Fail fast if both schemas still have the same table name with data in both (needs manual merge)
do $$
declare
  t text;
  tbl text[] := array['sm_teams','sm_games','sm_game_instances','sm_players','sm_ownership','sm_config','sm_game_config','sm_transfer_events'];
  c_pub bigint;
  c_spr bigint;
begin
  foreach t in array tbl
  loop
    if to_regclass('public.' || t) is not null and to_regclass('spread_madness.' || t) is not null then
      execute format('select count(*) from public.%I', t) into c_pub;
      execute format('select count(*) from spread_madness.%I', t) into c_spr;
      if c_pub > 0 and c_spr > 0 then
        raise exception 'spread_madness migration: table % has rows in both public and spread_madness; resolve manually before re-running.', t;
      end if;
    end if;
  end loop;
end $$;

-- Drop empty duplicate public.* when canonical data is already in spread_madness
do $$
declare
  t text;
  tbl text[] := array['sm_teams','sm_games','sm_game_instances','sm_players','sm_ownership','sm_config','sm_game_config','sm_transfer_events'];
  c_pub bigint;
  c_spr bigint;
begin
  foreach t in array tbl
  loop
    if to_regclass('public.' || t) is not null and to_regclass('spread_madness.' || t) is not null then
      execute format('select count(*) from public.%I', t) into c_pub;
      execute format('select count(*) from spread_madness.%I', t) into c_spr;
      if c_pub = 0 and c_spr >= 0 then
        execute format('drop table public.%I cascade', t);
      end if;
    end if;
  end loop;
end $$;

-- Move any remaining public.sm_* into spread_madness
do $$
declare
  tbl text[] := array['sm_teams','sm_games','sm_game_instances','sm_players','sm_ownership','sm_config','sm_game_config','sm_transfer_events'];
  t text;
begin
  foreach t in array tbl
  loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I set schema spread_madness', t);
    end if;
  end loop;
end $$;

-- Enum / domain types named sm_* (not table row types; those moved with the table)
do $$
declare
  r record;
begin
  for r in
    select t.typname
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typtype in ('e', 'd')
      and t.typname like 'sm\_%' escape '\'
  loop
    execute format('alter type public.%I set schema spread_madness', r.typname);
  end loop;
end $$;

-- Standalone sequences named sm_*
do $$
declare
  r record;
begin
  for r in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'S'
      and c.relname like 'sm\_%' escape '\'
  loop
    execute format('alter sequence public.%I set schema spread_madness', r.relname);
  end loop;
end $$;

-- Functions: sm_* first, then finalize_game (app RPC), so dependencies move before callers
do $$
declare
  r record;
  fq text;
begin
  for r in
    select p.proname, pg_get_function_identity_arguments(p.oid) as ident
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind in ('f', 'p')
      and (p.proname = 'finalize_game' or p.proname like 'sm\_%' escape '\')
    order by case when p.proname = 'finalize_game' then 1 else 0 end, p.proname, p.oid
  loop
    if exists (
      select 1
      from pg_proc p2
      join pg_namespace n2 on n2.oid = p2.pronamespace
      where n2.nspname = 'spread_madness'
        and p2.proname = r.proname
        and pg_get_function_identity_arguments(p2.oid) is not distinct from r.ident
    ) then
      raise exception 'spread_madness migration: function %(%): already exists in spread_madness; drop one copy manually.', r.proname, r.ident;
    end if;
    fq := quote_ident(r.proname) || '(' || r.ident || ')';
    execute 'alter function public.' || fq || ' set schema spread_madness';
  end loop;
end $$;

-- Views and materialized views named sm_*
do $$
declare
  r record;
begin
  for r in
    select c.relname, c.relkind
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('v', 'm')
      and c.relname like 'sm\_%' escape '\'
  loop
    if r.relkind = 'v' then
      execute format('alter view public.%I set schema spread_madness', r.relname);
    else
      execute format('alter materialized view public.%I set schema spread_madness', r.relname);
    end if;
  end loop;
end $$;

-- Re-register realtime tables under spread_madness (idempotent)
do $$
begin
  if to_regclass('spread_madness.sm_games') is not null
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'spread_madness' and tablename = 'sm_games'
     ) then
    alter publication supabase_realtime add table spread_madness.sm_games;
  end if;
  if to_regclass('spread_madness.sm_ownership') is not null
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'spread_madness' and tablename = 'sm_ownership'
     ) then
    alter publication supabase_realtime add table spread_madness.sm_ownership;
  end if;
  if to_regclass('spread_madness.sm_transfer_events') is not null
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'spread_madness' and tablename = 'sm_transfer_events'
     ) then
    alter publication supabase_realtime add table spread_madness.sm_transfer_events;
  end if;
end $$;

-- API roles
grant select, insert, update, delete on table spread_madness.sm_teams to anon, authenticated, service_role;
grant select, insert, update, delete on table spread_madness.sm_games to anon, authenticated, service_role;
grant select, insert, update, delete on table spread_madness.sm_game_instances to anon, authenticated, service_role;
grant select, insert, update, delete on table spread_madness.sm_players to anon, authenticated, service_role;
grant select, insert, update, delete on table spread_madness.sm_ownership to anon, authenticated, service_role;
grant select, insert, update, delete on table spread_madness.sm_config to anon, authenticated, service_role;
grant select, insert, update, delete on table spread_madness.sm_game_config to anon, authenticated, service_role;
grant select, insert, update, delete on table spread_madness.sm_transfer_events to anon, authenticated, service_role;

-- PG15: no "GRANT ... ON ALL TYPES IN SCHEMA"; grant per enum/domain in spread_madness (re-run safe)
do $$
declare
  r record;
begin
  for r in
    select ns.nspname as schema_name, t.typname
    from pg_type t
    join pg_namespace ns on ns.oid = t.typnamespace
    where ns.nspname = 'spread_madness'
      and t.typtype in ('e', 'd')
  loop
    execute format(
      'grant usage on type %I.%I to anon, authenticated, service_role',
      r.schema_name,
      r.typname
    );
  end loop;
end $$;

grant execute on all functions in schema spread_madness to anon, authenticated, service_role;
grant select, usage on all sequences in schema spread_madness to anon, authenticated, service_role;

-- Ensure no Spread Madness objects remain in public
do $$
declare
  tleft text;
  vleft text;
  sleft text;
  fleft text;
  yleft text;
  parts text := '';
begin
  select string_agg(tablename, ', ' order by tablename)
    into tleft
  from pg_tables
  where schemaname = 'public'
    and tablename in (
      'sm_teams', 'sm_games', 'sm_game_instances', 'sm_players', 'sm_ownership',
      'sm_config', 'sm_game_config', 'sm_transfer_events'
    );

  select string_agg(c.relname, ', ' order by c.relname)
    into vleft
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('v', 'm')
    and c.relname like 'sm\_%' escape '\';

  select string_agg(c.relname, ', ' order by c.relname)
    into sleft
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'S'
    and c.relname like 'sm\_%' escape '\';

  select string_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', ', ' order by p.proname)
    into fleft
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prokind in ('f', 'p')
    and (p.proname = 'finalize_game' or p.proname like 'sm\_%' escape '\');

  select string_agg(t.typname, ', ' order by t.typname)
    into yleft
  from pg_type t
  join pg_namespace n on n.oid = t.typnamespace
  where n.nspname = 'public'
    and t.typtype in ('e', 'd')
    and t.typname like 'sm\_%' escape '\';

  if tleft is not null then
    parts := parts || ' tables: ' || tleft;
  end if;
  if vleft is not null then
    parts := parts || ' views/materialized views: ' || vleft;
  end if;
  if sleft is not null then
    parts := parts || ' sequences: ' || sleft;
  end if;
  if fleft is not null then
    parts := parts || ' functions: ' || fleft;
  end if;
  if yleft is not null then
    parts := parts || ' types: ' || yleft;
  end if;

  if length(parts) > 0 then
    raise exception 'spread_madness migration: objects still in public:%', parts;
  end if;
end $$;
