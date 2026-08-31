create table public.reminder_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  reminder_time time not null default '19:30',
  weekdays smallint[] not null default '{1,3,5,6}' check (weekdays <@ array[0,1,2,3,4,5,6]::smallint[] and cardinality(weekdays) between 1 and 7),
  timezone text not null default 'Asia/Shanghai' check (char_length(timezone) between 1 and 80),
  last_sent_on date,
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  subscription jsonb not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index push_subscriptions_user_idx on public.push_subscriptions (user_id);
alter table public.reminder_settings enable row level security;
alter table public.push_subscriptions enable row level security;
create policy "users manage own reminders" on public.reminder_settings for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users manage own push subscriptions" on public.push_subscriptions for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.save_reminder_settings(
  p_enabled boolean,
  p_reminder_time time,
  p_weekdays smallint[],
  p_timezone text,
  p_subscription jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_endpoint text := p_subscription->>'endpoint';
begin
  if v_user_id is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if p_weekdays is null or not (p_weekdays <@ array[0,1,2,3,4,5,6]::smallint[]) or cardinality(p_weekdays) not between 1 and 7 then raise exception 'invalid weekdays'; end if;
  if char_length(p_timezone) not between 1 and 80 then raise exception 'invalid timezone'; end if;
  if p_enabled and (v_endpoint is null or p_subscription->'keys' is null) then raise exception 'push subscription required'; end if;

  insert into public.reminder_settings (user_id, enabled, reminder_time, weekdays, timezone)
  values (v_user_id, p_enabled, p_reminder_time, p_weekdays, p_timezone)
  on conflict (user_id) do update set enabled = excluded.enabled, reminder_time = excluded.reminder_time, weekdays = excluded.weekdays, timezone = excluded.timezone, updated_at = timezone('utc', now());

  if p_enabled then
    insert into public.push_subscriptions (user_id, endpoint, subscription)
    values (v_user_id, v_endpoint, p_subscription)
    on conflict (endpoint) do update set user_id = excluded.user_id, subscription = excluded.subscription, updated_at = timezone('utc', now());
  end if;
end;
$$;

revoke all on function public.save_reminder_settings(boolean, time, smallint[], text, jsonb) from public;
grant execute on function public.save_reminder_settings(boolean, time, smallint[], text, jsonb) to authenticated;
