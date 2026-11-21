-- Etapa 4: cobrança + Web Push
create unique index if not exists subs_gateway_uq on subscriptions (tenant_id, gateway_sub_id) where gateway_sub_id is not null;
alter table subscriptions add column if not exists last_reminder_for date;  -- evita lembrete duplicado
create index if not exists subs_status_idx on subscriptions (status, grace_until);

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
alter table push_subscriptions enable row level security;
create policy push_own on push_subscriptions for all
  using (user_id = auth.uid() and tenant_id = auth_tenant())
  with check (user_id = auth.uid() and tenant_id = auth_tenant());
