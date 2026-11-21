-- Etapa 2: nome de plano único por academia (usado no match do CSV)
create unique index if not exists plans_tenant_name_uq on plans (tenant_id, lower(name));
