-- Summit '67 — leaderboard rows written when the player saves (optional Supabase feature).
-- Run in Supabase SQL editor or via migration.

create table if not exists public.game_saves (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  player_name text not null default 'Anonymous',
  -- Leaderboard score: round((money/10 + sat×1000 + peak_skiers×5) / 1000) — see computeLeaderboardScore + submitLeaderboardFromSave
  score numeric not null default 0,
  satisfaction_raw numeric,
  satisfaction_effective numeric,
  achievements jsonb not null default '{}'::jsonb,
  reputation_lift numeric,
  reputation_slope numeric,
  reputation_combined numeric,
  -- Peak daily visitors reached during that session (not necessarily the last day)
  top_skiers_in_day integer not null default 0,
  money numeric not null default 0,
  save_json jsonb not null,
  -- Stable id per browser (localStorage); used to upsert when score improves — see upsert_game_save.sql
  player_client_id text
);

create index if not exists game_saves_created_at_idx on public.game_saves (created_at desc);
create index if not exists game_saves_score_idx on public.game_saves (score desc);

create unique index if not exists game_saves_player_client_id_uidx
  on public.game_saves (player_client_id);

alter table public.game_saves enable row level security;

-- Allow anonymous clients (anon key) to insert saves only.
drop policy if exists "Allow anon insert game_saves" on public.game_saves;
create policy "Allow anon insert game_saves"
  on public.game_saves
  for insert
  to anon
  with check (true);

-- Public read for in-game Hall of Fame (top scores). Safe: no secrets in selected columns.
drop policy if exists "Allow anon select game_saves" on public.game_saves;
create policy "Allow anon select game_saves"
  on public.game_saves
  for select
  to anon
  using (true);

-- Optional: run supabase/upsert_game_save.sql for per-client upsert (higher score only).
-- After that, the app calls rpc("upsert_game_save") instead of a plain insert.
