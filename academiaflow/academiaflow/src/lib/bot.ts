import type { SupabaseClient } from "@supabase/supabase-js";
import { gatewayFor } from "./gateway/asaas";

const MENU = "Olá! Como posso ajudar? Responda com um número:\n*1* Horários\n*2* Planos e preços\n*3* Pagar ou renovar a mensalidade";
const brl = (n: number) => Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export async function botReply(db: SupabaseClient, tenantId: string, phone: string, raw: string): Promise<string> {
  const t = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

  if (/^1\b|horario|funciona|abre|fecha/.test(t)) {
    const { data } = await db.from("tenants").select("business_hours_json").eq("id", tenantId).single();
    const h = (data?.business_hours_json ?? {}) as Record<string, { open: string; close: string } | null>;
    const lines = Object.entries(h).map(([d, v]) => `${d}: ${v ? `${v.open} às ${v.close}` : "fechado"}`);
    return lines.length ? `Nossos horários:\n${lines.join("\n")}` : "Os horários ainda não foram cadastrados. Fale com a recepção.";
  }
  if (/^2\b|plano|preco|valor|quanto/.test(t)) {
    const { data } = await db.from("plans").select("name, price, weekly_limit").eq("tenant_id", tenantId).order("price");
    return data?.length ? "Nossos planos:\n" + data.map((p) => `• ${p.name}: ${brl(p.price)}/mês (${p.weekly_limit ? `${p.weekly_limit}x por semana` : "livre"})`).join("\n") : "Os planos ainda não foram cadastrados. Fale com a recepção.";
  }
  if (/^3\b|pagar|pagamento|mensalidade|renov|boleto|pix/.test(t)) {
    // Identifica o aluno pelo número do WhatsApp (últimos 8 dígitos; exige correspondência única).
    const { data: us } = await db.from("users").select("id, name").eq("tenant_id", tenantId).eq("role", "STUDENT").is("anonymized_at", null).like("phone", `%${phone.replace(/\D/g, "").slice(-8)}`);
    if (us?.length !== 1) return "Não encontrei seu cadastro por este número. Fale com a recepção.";
    const { data: sub } = await db.from("subscriptions").select("gateway_sub_id").eq("user_id", us[0].id).maybeSingle();
    if (!sub?.gateway_sub_id) return "Sua cobrança ainda não foi ativada. Fale com a recepção.";
    try {
      const url = await (await gatewayFor(db, tenantId)).openPaymentUrl(sub.gateway_sub_id);
      return url ? `Olá, ${us[0].name.split(" ")[0]}! Pague com cartão ou Pix por este link:\n${url}` : "Você está em dia: não há cobrança em aberto.";
    } catch { return "Não consegui gerar o link agora. Tente de novo em instantes ou fale com a recepção."; }
  }
  return MENU;
}
