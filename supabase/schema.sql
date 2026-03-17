-- Spread Madness — run once in Supabase SQL Editor
-- Prefix sm_ to avoid conflicts when sharing a database with other projects.

-- Players (bracket participants)
create table if not exists sm_players (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null default '#6366f1',
  avatar_emoji text not null default '🏀',
  created_at timestamptz default now()
);

-- Teams (68 tournament teams)
create table if not exists sm_teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  seed int not null,
  region text not null,
  espn_id text,
  is_eliminated boolean not null default false,
  created_at timestamptz default now()
);

-- Games (matchups; spread_team_id = team that is favored)
create table if not exists sm_games (
  id uuid primary key default gen_random_uuid(),
  round int not null,
  region text,
  team1_id uuid references sm_teams(id),
  team2_id uuid references sm_teams(id),
  spread numeric,
  spread_team_id uuid references sm_teams(id),
  team1_score int,
  team2_score int,
  status text not null default 'scheduled', -- scheduled | in_progress | final
  winner_team_id uuid references sm_teams(id),
  cover_team_id uuid references sm_teams(id),
  next_game_id uuid references sm_games(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Ownership: one active row per team; updated when underdog covers (steal)
create table if not exists sm_ownership (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references sm_teams(id),
  player_id uuid not null references sm_players(id),
  acquired_round int not null,
  transferred_from_player_id uuid references sm_players(id),
  is_active boolean not null default true,
  created_at timestamptz default now()
);

-- Partial unique: only one active ownership per team
create unique index sm_ownership_one_active_per_team
  on sm_ownership (team_id) where is_active = true;

-- Config (admin password hash, draft_locked, current_round)
create table if not exists sm_config (
  key text primary key,
  value text,
  updated_at timestamptz default now()
);

-- Transfer events for feed (optional; can derive from ownership history)
create table if not exists sm_transfer_events (
  id uuid primary key default gen_random_uuid(),
  game_id uuid references sm_games(id),
  team_id uuid references sm_teams(id),
  from_player_id uuid references sm_players(id),
  to_player_id uuid references sm_players(id),
  round int not null,
  created_at timestamptz default now()
);

-- RLS
alter table sm_players enable row level security;
alter table sm_teams enable row level security;
alter table sm_games enable row level security;
alter table sm_ownership enable row level security;
alter table sm_config enable row level security;
alter table sm_transfer_events enable row level security;

create policy "sm_players_read" on sm_players for select using (true);
create policy "sm_teams_read" on sm_teams for select using (true);
create policy "sm_games_read" on sm_games for select using (true);
create policy "sm_ownership_read" on sm_ownership for select using (true);
create policy "sm_config_read" on sm_config for select using (true);
create policy "sm_transfer_events_read" on sm_transfer_events for select using (true);

create policy "sm_players_all" on sm_players for all using (true) with check (true);
create policy "sm_teams_all" on sm_teams for all using (true) with check (true);
create policy "sm_games_all" on sm_games for all using (true) with check (true);
create policy "sm_ownership_all" on sm_ownership for all using (true) with check (true);
create policy "sm_config_all" on sm_config for all using (true) with check (true);
create policy "sm_transfer_events_all" on sm_transfer_events for all using (true) with check (true);

-- Realtime
alter publication supabase_realtime add table sm_games;
alter publication supabase_realtime add table sm_ownership;
alter publication supabase_realtime add table sm_transfer_events;

-- Default config (teams are seeded from ESPN on first app load when sm_teams is empty)
insert into sm_config (key, value) values
('draft_locked', 'false'),
('current_round', '1'),
('admin_password_hash', '')
on conflict (key) do update set value = excluded.value;
