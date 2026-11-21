-- Etapa 6: KPIs do painel (security invoker: RLS continua valendo; só ADMIN recebe dados)
create or replace function admin_kpis() returns json
language sql stable security invoker set search_path = public as $$
  select case when auth_role() = 'ADMIN' then json_build_object(
    'active',  (select count(*) from users where role = 'STUDENT' and anonymized_at is null and access_status = 'ACTIVE'),
    'grace',   (select count(*) from users where role = 'STUDENT' and anonymized_at is null and access_status = 'GRACE_PERIOD'),
    'blocked', (select count(*) from users where role = 'STUDENT' and anonymized_at is null and access_status = 'BLOCKED'),
    'paused',  (select count(*) from users where role = 'STUDENT' and anonymized_at is null and access_status = 'PAUSED'),
    'denied_7d', (select count(*) from access_logs where status = 'DENIED' and "timestamp" > now() - interval '7 days'),
    'mrr', (select coalesce(sum(amount), 0) from subscriptions where status in ('ACTIVE','GRACE_PERIOD'))
  ) end
$$;
