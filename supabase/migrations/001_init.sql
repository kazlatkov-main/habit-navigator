-- supabase/migrations/001_init.sql
create table public.settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  start_date date,
  quit_day_offset int not null default 21,
  baseline_cigs numeric not null default 22.5,
  pack_price_eur numeric not null default 3.60,
  cigs_per_pack int not null default 20,
  created_at timestamptz not null default now()
);

create table public.habit_days (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day date not null,
  taichi_minutes int,
  taichi_quality int check (taichi_quality between 1 and 5),
  state_before int check (state_before between 1 and 5),
  state_after int check (state_after between 1 and 5),
  sleep_quality int check (sleep_quality between 1 and 5),
  morning_craving int check (morning_craving between 1 and 5),
  confidence int check (confidence between 1 and 5),
  morning_done_at timestamptz,
  cig_count_final int check (cig_count_final >= 0),
  mood int check (mood between 1 and 5),
  stress int check (stress between 1 and 5),
  wife_smoked boolean,
  alcohol boolean,
  identity_vote int check (identity_vote between 1 and 5),
  hardest_moment text,
  what_helped text,
  withdrawal jsonb,
  note text,
  evening_done_at timestamptz,
  primary key (user_id, day)
);

create table public.craving_events (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  ts timestamptz not null default now(),
  kind text not null check (kind in ('smoked','resisted')),
  trigger text not null check (trigger in
    ('стрес','кафе','след_ядене','скука','пауза_работа','шофиране','жена_ми_запали','алкохол','друго')),
  intensity int not null check (intensity between 1 and 5),
  instead text check (instead in
    ('дишане_60с','отложих_10мин','микро_тай_чи','чай_вода','отмина_само','друго')),
  note text,
  unique (user_id, client_id)
);

alter table public.settings enable row level security;
alter table public.habit_days enable row level security;
alter table public.craving_events enable row level security;

create policy "own settings" on public.settings for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own days" on public.habit_days for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own events" on public.craving_events for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
