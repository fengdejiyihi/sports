create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  sex text not null default 'unspecified' check (sex in ('male', 'female', 'unspecified')),
  birth_date date,
  height_cm numeric(5,2) check (height_cm between 100 and 250),
  activity_level text not null default 'moderate' check (activity_level in ('low', 'moderate', 'high')),
  target_weight_kg numeric(5,2) check (target_weight_kg between 25 and 300),
  target_rate_kg_per_week numeric(3,2) not null default 0.30 check (target_rate_kg_per_week between 0.10 and 1.00),
  timezone text not null default 'Asia/Shanghai',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.workout_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  weekday smallint not null check (weekday between 0 and 6),
  duration_minutes smallint not null check (duration_minutes between 1 and 600),
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.workout_plan_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.workout_plans(id) on delete cascade,
  exercise_name text not null check (char_length(exercise_name) between 1 and 80),
  sets smallint check (sets between 1 and 20),
  reps_min smallint check (reps_min between 1 and 200),
  reps_max smallint check (reps_max between reps_min and 200),
  sort_order smallint not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- ponytail: one primary check-in per day; add a session table only when multiple daily workout sessions are required.
create table public.daily_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  checkin_date date not null default current_date,
  plan_id uuid references public.workout_plans(id) on delete set null,
  status text not null check (status in ('completed', 'skipped', 'backfill')),
  duration_minutes smallint check (duration_minutes between 1 and 600),
  sleep_minutes smallint check (sleep_minutes between 0 and 1440),
  energy_rating smallint check (energy_rating between 1 and 5),
  soreness_rating smallint check (soreness_rating between 1 and 5),
  notes text check (char_length(notes) <= 1000),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, checkin_date)
);

create table public.body_measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  measured_on date not null default current_date,
  weight_kg numeric(5,2) not null check (weight_kg between 25 and 300),
  waist_cm numeric(5,2) check (waist_cm between 30 and 200),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, measured_on)
);

create index daily_checkins_user_date_idx on public.daily_checkins (user_id, checkin_date desc);
create index body_measurements_user_date_idx on public.body_measurements (user_id, measured_on desc);
create index workout_plans_user_weekday_idx on public.workout_plans (user_id, weekday) where is_active;

create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger workout_plans_updated_at before update on public.workout_plans for each row execute function public.set_updated_at();
create trigger workout_plan_items_updated_at before update on public.workout_plan_items for each row execute function public.set_updated_at();
create trigger daily_checkins_updated_at before update on public.daily_checkins for each row execute function public.set_updated_at();
create trigger body_measurements_updated_at before update on public.body_measurements for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.workout_plans enable row level security;
alter table public.workout_plan_items enable row level security;
alter table public.daily_checkins enable row level security;
alter table public.body_measurements enable row level security;

create policy "users manage own profile" on public.profiles for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users manage own workout plans" on public.workout_plans for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users manage own plan items" on public.workout_plan_items for all to authenticated using (exists (select 1 from public.workout_plans where id = plan_id and user_id = auth.uid())) with check (exists (select 1 from public.workout_plans where id = plan_id and user_id = auth.uid()));
create policy "users manage own check-ins" on public.daily_checkins for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users manage own measurements" on public.body_measurements for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
