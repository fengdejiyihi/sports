create or replace function public.save_daily_checkin(
  p_checkin_date date,
  p_status text,
  p_duration_minutes smallint,
  p_weight_kg numeric,
  p_waist_cm numeric,
  p_sleep_minutes smallint,
  p_energy_rating smallint,
  p_soreness_rating smallint,
  p_notes text
)
returns public.daily_checkins
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_checkin public.daily_checkins;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  if p_status not in ('completed', 'skipped', 'backfill') then
    raise exception 'invalid status';
  end if;

  if p_status = 'completed' and (p_duration_minutes is null or p_duration_minutes not between 1 and 600) then
    raise exception 'invalid workout duration';
  end if;

  insert into public.daily_checkins (
    user_id, checkin_date, status, duration_minutes, sleep_minutes,
    energy_rating, soreness_rating, notes
  ) values (
    v_user_id, p_checkin_date, p_status, p_duration_minutes, p_sleep_minutes,
    p_energy_rating, p_soreness_rating, nullif(trim(p_notes), '')
  )
  on conflict (user_id, checkin_date) do update set
    status = excluded.status,
    duration_minutes = excluded.duration_minutes,
    sleep_minutes = excluded.sleep_minutes,
    energy_rating = excluded.energy_rating,
    soreness_rating = excluded.soreness_rating,
    notes = excluded.notes
  returning * into v_checkin;

  insert into public.body_measurements (user_id, measured_on, weight_kg, waist_cm)
  values (v_user_id, p_checkin_date, p_weight_kg, p_waist_cm)
  on conflict (user_id, measured_on) do update set
    weight_kg = excluded.weight_kg,
    waist_cm = excluded.waist_cm;

  return v_checkin;
end;
$$;

revoke all on function public.save_daily_checkin(date, text, smallint, numeric, numeric, smallint, smallint, smallint, text) from public;
grant execute on function public.save_daily_checkin(date, text, smallint, numeric, numeric, smallint, smallint, smallint, text) to authenticated;

alter publication supabase_realtime add table public.daily_checkins;
alter publication supabase_realtime add table public.body_measurements;
