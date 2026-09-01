alter table public.profiles
  add column diet_preferences text[] not null default '{}',
  add column allergens text[] not null default '{}',
  add column food_budget text check (food_budget in ('low', 'medium', 'high'));

create table public.nutrition_daily_targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  target_date date not null,
  training_day boolean not null default false,
  target_calories smallint not null check (target_calories between 800 and 5000),
  protein_grams numeric(6,2) not null check (protein_grams between 20 and 500),
  plan jsonb not null check (jsonb_typeof(plan) = 'object'),
  note text check (char_length(note) <= 1000),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, target_date)
);

create index nutrition_daily_targets_user_date_idx on public.nutrition_daily_targets (user_id, target_date desc);

create trigger nutrition_daily_targets_updated_at before update on public.nutrition_daily_targets for each row execute function public.set_updated_at();

alter table public.nutrition_daily_targets enable row level security;
create policy "users manage own daily nutrition targets" on public.nutrition_daily_targets for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter publication supabase_realtime add table public.nutrition_daily_targets;
