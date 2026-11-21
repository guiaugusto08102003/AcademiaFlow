-- AcademiaFlow – Etapa 1: schema multi-tenant + RLS (tenant_id + role)
create extension if not exists "pgcrypto";

create type user_role     as enum ('ADMIN','TRAINER','STUDENT');
create type access_status as enum ('ACTIVE','GRACE_PERIOD','PAUSED','BLOCKED');
create type sub_status    as enum ('ACTIVE','GRACE_PERIOD','PAUSED','BLOCKED','CANCELED');
create type access_method as enum ('QR','FACE','MANUAL_OVERRIDE');
create type access_result as enum ('GRANTED','DENIED');

create table tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  business_hours_json jsonb not null default '{}',
  grace_days int not null default 2,
  plan_status text not null default 'TRIAL',
  gateway_config jsonb,       -- criptografar chaves em produção (Vault)
  gate_api_config jsonb,
  whatsapp_config jsonb,
  created_at timestamptz not null default now()
);

create table plans (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  price numeric(10,2) not null,
  weekly_limit int,           -- null = livre
  billing_cycle text not null default 'MONTHLY'
);

create table users (
  id uuid primary key references auth.users(id) on delete cascade,
  tenant_id uuid not null references tenants(id) on delete cascade,
  role user_role not null default 'STUDENT',
  name text not null,
  phone text,
  email text,
  health_notes text,
  lgpd_consent_at timestamptz,
  face_token_url text,
  access_status access_status not null default 'ACTIVE',
  anonymized_at timestamptz,
  created_at timestamptz not null default now()
);

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  plan_id uuid not null references plans(id),
  gateway_sub_id text,
  status sub_status not null default 'ACTIVE',
  due_date date,
  grace_until date,
  amount numeric(10,2) not null
);

create table workouts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  student_id uuid not null references users(id) on delete cascade,
  trainer_id uuid references users(id),
  title text not null,
  exercises_json jsonb not null default '[]',
  updated_at timestamptz not null default now()
);

create table access_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid references users(id),
  method access_method not null,
  status access_result not null,
  reason text,
  "timestamp" timestamptz not null default now()
);

-- Idempotência de webhooks (usado na Etapa 4)
create table webhook_events (
  id text primary key,
  tenant_id uuid references tenants(id),
  received_at timestamptz not null default now()
);

create index on users (tenant_id, role);
create index on subscriptions (tenant_id, user_id);
create index on workouts (tenant_id, student_id);
create index on access_logs (tenant_id, "timestamp" desc);

-- Helpers (security definer evita recursão de RLS em users)
create or replace function auth_tenant() returns uuid
language sql stable security definer set search_path = public as
$$ select tenant_id from users where id = auth.uid() $$;

create or replace function auth_role() returns user_role
language sql stable security definer set search_path = public as
$$ select role from users where id = auth.uid() $$;

alter table tenants       enable row level security;
alter table plans         enable row level security;
alter table users         enable row level security;
alter table subscriptions enable row level security;
alter table workouts      enable row level security;
alter table access_logs   enable row level security;
alter table webhook_events enable row level security;  -- sem policies: só service_role

-- tenants
create policy tenants_select on tenants for select using (id = auth_tenant());
create policy tenants_admin_update on tenants for update
  using (id = auth_tenant() and auth_role() = 'ADMIN');

-- plans: todos leem; só ADMIN escreve
create policy plans_select on plans for select using (tenant_id = auth_tenant());
create policy plans_admin_all on plans for all
  using (tenant_id = auth_tenant() and auth_role() = 'ADMIN')
  with check (tenant_id = auth_tenant() and auth_role() = 'ADMIN');

-- users: ADMIN/TRAINER veem o tenant; STUDENT vê só a si
create policy users_select on users for select using (
  tenant_id = auth_tenant() and (auth_role() in ('ADMIN','TRAINER') or id = auth.uid()));
create policy users_admin_all on users for all
  using (tenant_id = auth_tenant() and auth_role() = 'ADMIN')
  with check (tenant_id = auth_tenant() and auth_role() = 'ADMIN');
-- aluno só registra o próprio consentimento LGPD (via RPC abaixo, sem update direto)

create or replace function accept_lgpd_consent() returns void
language sql security definer set search_path = public as
$$ update users set lgpd_consent_at = now() where id = auth.uid() and lgpd_consent_at is null $$;

-- subscriptions: financeiro só ADMIN; aluno vê a própria; TRAINER sem acesso
create policy subs_admin_all on subscriptions for all
  using (tenant_id = auth_tenant() and auth_role() = 'ADMIN')
  with check (tenant_id = auth_tenant() and auth_role() = 'ADMIN');
create policy subs_student_select on subscriptions for select
  using (tenant_id = auth_tenant() and user_id = auth.uid());

-- workouts: ADMIN/TRAINER CRUD; aluno lê os seus
create policy workouts_staff_all on workouts for all
  using (tenant_id = auth_tenant() and auth_role() in ('ADMIN','TRAINER'))
  with check (tenant_id = auth_tenant() and auth_role() in ('ADMIN','TRAINER'));
create policy workouts_student_select on workouts for select
  using (tenant_id = auth_tenant() and student_id = auth.uid());

-- access_logs: só ADMIN lê; escrita via service_role (validação de catraca)
create policy logs_admin_select on access_logs for select
  using (tenant_id = auth_tenant() and auth_role() = 'ADMIN');
create policy logs_admin_insert on access_logs for insert
  with check (tenant_id = auth_tenant() and auth_role() = 'ADMIN' and method = 'MANUAL_OVERRIDE');

-- Criação de tenant + primeiro ADMIN (chamar após signup)
create or replace function create_tenant_with_admin(p_tenant_name text, p_user_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare t uuid;
begin
  if exists (select 1 from users where id = auth.uid()) then raise exception 'user already exists'; end if;
  insert into tenants(name) values (p_tenant_name) returning id into t;
  insert into users(id, tenant_id, role, name, email)
    values (auth.uid(), t, 'ADMIN', p_user_name, (select email from auth.users where id = auth.uid()));
  return t;
end $$;
