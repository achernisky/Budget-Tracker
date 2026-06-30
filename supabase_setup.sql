-- Run this in your Supabase SQL editor

-- 1. Create the table
create table if not exists budget_data (
  id text primary key default 'shared',
  data jsonb not null default '{}',
  updated_at timestamptz default now()
);

-- 2. Insert the initial shared row
insert into budget_data (id, data) values ('shared', '{}')
on conflict (id) do nothing;

-- 3. Row level security — public read/write (no login required)
alter table budget_data enable row level security;

create policy "Public read"   on budget_data for select using (true);
create policy "Public insert" on budget_data for insert with check (true);
create policy "Public update" on budget_data for update using (true);

-- 4. Enable Realtime on this table so devices sync live
alter publication supabase_realtime add table budget_data;
