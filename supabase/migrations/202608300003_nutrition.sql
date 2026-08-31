create table public.meal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  eaten_on date not null default current_date,
  meal_name text not null check (char_length(meal_name) between 1 and 80),
  items jsonb not null check (jsonb_typeof(items) = 'array'),
  total_calories smallint not null check (total_calories between 0 and 5000),
  protein_grams numeric(6,2) not null check (protein_grams between 0 and 500),
  created_at timestamptz not null default timezone('utc', now())
);

create index meal_entries_user_date_idx on public.meal_entries (user_id, eaten_on desc);
alter table public.meal_entries enable row level security;
create policy "users manage own meals" on public.meal_entries for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
