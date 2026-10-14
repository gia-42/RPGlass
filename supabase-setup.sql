-- RPGlass: one save per player (current career, Hall of Fame and achievements).
-- Paste this whole file into Supabase > SQL Editor > New query, then click Run. It is safe to run more than once.

create table if not exists public.rpglass_saves (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  career     jsonb,
  hof        jsonb not null default '[]'::jsonb,
  ach        jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.rpglass_saves enable row level security;

drop policy if exists "rpglass read own save"   on public.rpglass_saves;
drop policy if exists "rpglass insert own save" on public.rpglass_saves;
drop policy if exists "rpglass update own save" on public.rpglass_saves;
drop policy if exists "rpglass delete own save" on public.rpglass_saves;

create policy "rpglass read own save"   on public.rpglass_saves for select using (auth.uid() = user_id);
create policy "rpglass insert own save" on public.rpglass_saves for insert with check (auth.uid() = user_id);
create policy "rpglass update own save" on public.rpglass_saves for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "rpglass delete own save" on public.rpglass_saves for delete using (auth.uid() = user_id);
