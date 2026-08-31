alter table public.meal_entries
  add column meal_type text not null default 'snack' check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack')),
  add column source text not null default 'vision' check (source in ('manual', 'vision', 'ai_plan')),
  add column updated_at timestamptz not null default timezone('utc', now());

create index meal_entries_user_date_type_idx on public.meal_entries (user_id, eaten_on, meal_type);
create trigger meal_entries_updated_at before update on public.meal_entries for each row execute function public.set_updated_at();
alter publication supabase_realtime add table public.meal_entries;
