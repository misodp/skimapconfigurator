-- Summit '67 — upsert leaderboard row per browser/client id (run after leaderboard.sql).
-- Same PC/browser keeps one row; new save updates only if score is strictly higher.

alter table public.game_saves
  add column if not exists player_client_id text;

-- One row per client id; PostgreSQL UNIQUE allows multiple NULLs (legacy rows without id).
create unique index if not exists game_saves_player_client_id_uidx
  on public.game_saves (player_client_id);

create or replace function public.upsert_game_save(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id text;
  v_id uuid;
  v_name text;
  v_score numeric;
  v_sat_raw numeric;
  v_sat_eff numeric;
  v_ach jsonb;
  v_rep_l numeric;
  v_rep_s numeric;
  v_rep_c numeric;
  v_skiers int;
  v_money numeric;
  v_save jsonb;
begin
  v_client_id := nullif(trim(p_payload->>'player_client_id'), '');
  if v_client_id is null or length(v_client_id) > 200 then
    raise exception 'invalid player_client_id';
  end if;

  v_name := coalesce(nullif(trim(p_payload->>'player_name'), ''), 'Anonymous');
  v_score := coalesce((p_payload->>'score')::numeric, 0);
  v_sat_raw := (p_payload->>'satisfaction_raw')::numeric;
  v_sat_eff := (p_payload->>'satisfaction_effective')::numeric;
  v_ach := coalesce(p_payload->'achievements', '{}'::jsonb);
  v_rep_l := (p_payload->>'reputation_lift')::numeric;
  v_rep_s := (p_payload->>'reputation_slope')::numeric;
  v_rep_c := (p_payload->>'reputation_combined')::numeric;
  v_skiers := coalesce((p_payload->>'top_skiers_in_day')::integer, 0);
  v_money := coalesce((p_payload->>'money')::numeric, 0);
  v_save := p_payload->'save_json';
  if v_save is null then
    raise exception 'save_json required';
  end if;

  insert into public.game_saves (
    player_client_id,
    player_name,
    score,
    satisfaction_raw,
    satisfaction_effective,
    achievements,
    reputation_lift,
    reputation_slope,
    reputation_combined,
    top_skiers_in_day,
    money,
    save_json
  ) values (
    v_client_id,
    v_name,
    v_score,
    v_sat_raw,
    v_sat_eff,
    v_ach,
    v_rep_l,
    v_rep_s,
    v_rep_c,
    v_skiers,
    v_money,
    v_save
  )
  on conflict (player_client_id)
  do update set
    player_name = excluded.player_name,
    score = excluded.score,
    satisfaction_raw = excluded.satisfaction_raw,
    satisfaction_effective = excluded.satisfaction_effective,
    achievements = excluded.achievements,
    reputation_lift = excluded.reputation_lift,
    reputation_slope = excluded.reputation_slope,
    reputation_combined = excluded.reputation_combined,
    top_skiers_in_day = excluded.top_skiers_in_day,
    money = excluded.money,
    save_json = excluded.save_json
  where public.game_saves.score < excluded.score;

  select id into v_id
  from public.game_saves
  where player_client_id = v_client_id
  limit 1;

  return v_id;
end;
$$;

revoke all on function public.upsert_game_save(jsonb) from public;
grant execute on function public.upsert_game_save(jsonb) to anon;
grant execute on function public.upsert_game_save(jsonb) to authenticated;
grant execute on function public.upsert_game_save(jsonb) to service_role;
