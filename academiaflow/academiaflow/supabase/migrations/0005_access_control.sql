-- Etapa 5: controle de acesso
alter table access_logs add column if not exists token_id text;   -- jti do QR: uso único
alter table access_logs add column if not exists actor_id uuid references users(id);  -- quem fez a liberação manual
create unique index if not exists access_logs_token_uq on access_logs (tenant_id, token_id) where token_id is not null;

-- Dias distintos de entrada (fuso de São Paulo) desde p_since; base do limite semanal do plano.
create or replace function week_usage(p_tenant uuid, p_since timestamptz, p_user uuid default null)
returns table(user_id uuid, day date) language sql stable security definer set search_path = public as $$
  select distinct l.user_id, (l."timestamp" at time zone 'America/Sao_Paulo')::date
  from access_logs l
  where l.tenant_id = p_tenant and l.status = 'GRANTED' and l.method in ('QR','FACE')
    and l."timestamp" >= p_since and l.user_id is not null and (p_user is null or l.user_id = p_user)
$$;
revoke all on function week_usage(uuid, timestamptz, uuid) from public, anon, authenticated;
grant execute on function week_usage(uuid, timestamptz, uuid) to service_role;
