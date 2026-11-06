-- One row per open browser. Holds a random id only: no IP address or device details.
create table presence (
  visitor_id uuid primary key,
  user_id uuid references users(id) on delete cascade,
  last_seen_at timestamptz not null default now()
);
create index on presence (last_seen_at);
alter table presence enable row level security;
