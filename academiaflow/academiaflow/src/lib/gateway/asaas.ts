import type { SupabaseClient } from "@supabase/supabase-js";

type Cfg = { provider: string; api_key: string; webhook_token?: string; sandbox?: boolean };

export function asaas(cfg: Cfg) {
  const base = cfg.sandbox ? "https://sandbox.asaas.com/api/v3" : "https://api.asaas.com/v3";
  const call = async (path: string, init?: RequestInit) => {
    const r = await fetch(base + path, { ...init, headers: { "Content-Type": "application/json", access_token: cfg.api_key, "User-Agent": "AcademiaFlow" } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.errors?.[0]?.description ?? `Asaas respondeu ${r.status}`);
    return j;
  };
  return {
    createCustomer: (b: { name: string; cpfCnpj?: string; mobilePhone?: string; externalReference: string }) =>
      call("/customers", { method: "POST", body: JSON.stringify(b) }) as Promise<{ id: string }>,
    // billingType UNDEFINED: o aluno escolhe cartão ou Pix na página da cobrança
    createSubscription: (b: { customer: string; value: number; nextDueDate: string; description: string; externalReference: string }) =>
      call("/subscriptions", { method: "POST", body: JSON.stringify({ ...b, billingType: "UNDEFINED", cycle: "MONTHLY" }) }) as Promise<{ id: string }>,
    setSubscriptionActive: (id: string, active: boolean) =>
      call(`/subscriptions/${id}`, { method: "PUT", body: JSON.stringify({ status: active ? "ACTIVE" : "INACTIVE" }) }),
    cancelSubscription: (id: string) => call(`/subscriptions/${id}`, { method: "DELETE" }),
    /** Link (cartão/Pix) da cobrança em aberto: vencida primeiro, depois a pendente. */
    async openPaymentUrl(subId: string): Promise<string | null> {
      for (const status of ["OVERDUE", "PENDING"]) {
        const j = await call(`/subscriptions/${subId}/payments?status=${status}&limit=1`);
        if (j.data?.[0]?.invoiceUrl) return j.data[0].invoiceUrl as string;
      }
      return null;
    },
  };
}

export async function gatewayFor(db: SupabaseClient, tenantId: string) {
  const { data } = await db.from("tenants").select("gateway_config").eq("id", tenantId).single();
  const cfg = data?.gateway_config as Cfg | null;
  if (!cfg?.api_key) throw new Error("Gateway de pagamento não configurado.");
  if (cfg.provider !== "asaas") throw new Error("Por enquanto só o Asaas está implementado.");
  return asaas(cfg);
}
