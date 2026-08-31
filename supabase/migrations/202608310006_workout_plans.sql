create or replace function public.save_workout_plan(
  p_plan_id uuid,
  p_name text,
  p_weekday smallint,
  p_duration_minutes smallint,
  p_is_active boolean,
  p_items jsonb
)
returns public.workout_plans
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_plan public.workout_plans;
  v_item jsonb;
  v_name text;
  v_sets smallint;
  v_reps_min smallint;
  v_reps_max smallint;
  v_index integer := 0;
begin
  if v_user_id is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if p_name is null or char_length(trim(p_name)) not between 1 and 80 then raise exception 'invalid plan name'; end if;
  if p_weekday is null or p_weekday not between 0 and 6 then raise exception 'invalid weekday'; end if;
  if p_duration_minutes is null or p_duration_minutes not between 1 and 600 then raise exception 'invalid duration'; end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 20 then raise exception 'invalid plan items'; end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_name := trim(v_item->>'exerciseName');
    v_sets := (v_item->>'sets')::smallint;
    v_reps_min := (v_item->>'repsMin')::smallint;
    v_reps_max := (v_item->>'repsMax')::smallint;
    if v_name is null or char_length(v_name) not between 1 and 80 or v_sets is null or v_sets not between 1 and 20 or v_reps_min is null or v_reps_min not between 1 and 200 or v_reps_max is null or v_reps_max not between v_reps_min and 200 then
      raise exception 'invalid plan item';
    end if;
  end loop;

  if p_plan_id is null then
    insert into public.workout_plans (user_id, name, weekday, duration_minutes, is_active)
    values (v_user_id, trim(p_name), p_weekday, p_duration_minutes, coalesce(p_is_active, true))
    returning * into v_plan;
  else
    update public.workout_plans set name = trim(p_name), weekday = p_weekday, duration_minutes = p_duration_minutes, is_active = coalesce(p_is_active, true)
    where id = p_plan_id and user_id = v_user_id
    returning * into v_plan;
    if not found then raise exception 'plan not found'; end if;
  end if;

  delete from public.workout_plan_items where plan_id = v_plan.id;
  for v_item in select value from jsonb_array_elements(p_items) loop
    insert into public.workout_plan_items (plan_id, exercise_name, sets, reps_min, reps_max, sort_order)
    values (v_plan.id, trim(v_item->>'exerciseName'), (v_item->>'sets')::smallint, (v_item->>'repsMin')::smallint, (v_item->>'repsMax')::smallint, v_index);
    v_index := v_index + 1;
  end loop;
  return v_plan;
end;
$$;

create or replace function public.save_daily_checkin(
  p_checkin_date date,
  p_status text,
  p_duration_minutes smallint,
  p_weight_kg numeric,
  p_waist_cm numeric,
  p_sleep_minutes smallint,
  p_energy_rating smallint,
  p_soreness_rating smallint,
  p_notes text,
  p_plan_id uuid
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
  if v_user_id is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if p_status is null or p_status not in ('completed', 'skipped', 'backfill') then raise exception 'invalid status'; end if;
  if p_status = 'completed' and (p_duration_minutes is null or p_duration_minutes not between 1 and 600) then raise exception 'invalid workout duration'; end if;
  if p_plan_id is not null and not exists (select 1 from public.workout_plans where id = p_plan_id and user_id = v_user_id) then raise exception 'invalid workout plan'; end if;

  insert into public.daily_checkins (user_id, checkin_date, plan_id, status, duration_minutes, sleep_minutes, energy_rating, soreness_rating, notes)
  values (v_user_id, p_checkin_date, p_plan_id, p_status, p_duration_minutes, p_sleep_minutes, p_energy_rating, p_soreness_rating, nullif(trim(p_notes), ''))
  on conflict (user_id, checkin_date) do update set
    plan_id = excluded.plan_id,
    status = excluded.status,
    duration_minutes = excluded.duration_minutes,
    sleep_minutes = excluded.sleep_minutes,
    energy_rating = excluded.energy_rating,
    soreness_rating = excluded.soreness_rating,
    notes = excluded.notes
  returning * into v_checkin;

  insert into public.body_measurements (user_id, measured_on, weight_kg, waist_cm)
  values (v_user_id, p_checkin_date, p_weight_kg, p_waist_cm)
  on conflict (user_id, measured_on) do update set weight_kg = excluded.weight_kg, waist_cm = excluded.waist_cm;
  return v_checkin;
end;
$$;

revoke all on function public.save_workout_plan(uuid, text, smallint, smallint, boolean, jsonb) from public;
grant execute on function public.save_workout_plan(uuid, text, smallint, smallint, boolean, jsonb) to authenticated;
revoke all on function public.save_daily_checkin(date, text, smallint, numeric, numeric, smallint, smallint, smallint, text, uuid) from public;
grant execute on function public.save_daily_checkin(date, text, smallint, numeric, numeric, smallint, smallint, smallint, text, uuid) to authenticated;
