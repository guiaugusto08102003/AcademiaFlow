import { supabaseAdmin } from "./supabase/server";
import { notify } from "./notify";
import { addDays, addMonths, brDate, todayBR } from "./dates";

type Db = ReturnType<typeof supabaseAdmin>;
type Status = "ACTIVE" | "GRACE_PERIOD" | "BLOCKED";

async function setState(db: Db, sub: { id: string; user_id: string }, status: Status, extra: Record<string, unknown>) {
  await db.from("subscriptions").update({ status, ...extra }).eq("id", sub.id);
  await db.from("users").update({ access_status: status }).eq("id", sub.user_id);
}

/** Máquina de estados por evento do gateway. Idempotente: reaplicar o mesmo evento não muda o resultado. */
export async function handlePaymentEvent(tenantId: string, event: string, payment: { subscription?: string; dueDate: string }) {
  if (!payment.subscription) return "ignored";
  const db = supabaseAdmin();
  const { data: sub } = await db.from("subscriptions").select("id, user_id, status, due_date")
    .eq("tenant_id", tenantId).eq("gateway_sub_id", payment.subscription).maybeSingle();
  if (!sub) return "unknown_subscription";
  if (sub.status === "PAUSED" || sub.status === "CANCELED") return "skipped_paused"; // pausa/trancamento é respeitada

  if (event === "PAYMENT_CONFIRMED" || event === "PAYMENT_RECEIVED") {
    const next = addMonths(payment.dueDate, 1);
    await setState(db, sub, "ACTIVE", { grace_until: null, due_date: !sub.due_date || next > sub.due_date ? next : sub.due_date });
    if (sub.status !== "ACTIVE") await notify(tenantId, sub.user_id, { title: "Pagamento confirmado", body: "Seu acesso está liberado. Bom treino!" });
    return "active";
  }
  if (event === "PAYMENT_OVERDUE") {
    const { data: t } = await db.from("tenants").select("grace_days").eq("id", tenantId).single();
    const graceUntil = addDays(payment.dueDate, t?.grace_days ?? 2);
    const status: Status = graceUntil < todayBR() ? "BLOCKED" : "GRACE_PERIOD";
    await setState(db, sub, status, { grace_until: graceUntil });
    if (sub.status !== status) await notify(tenantId, sub.user_id, status === "BLOCKED"
      ? { title: "Acesso bloqueado", body: "Sua mensalidade está em atraso. Regularize pelo app para voltar a treinar." }
      : { title: "Mensalidade em atraso", body: `Pague até ${brDate(graceUntil)} para não perder o acesso.` });
    return status.toLowerCase();
  }
  return "ignored";
}

/** Rotina diária: bloqueia carências vencidas e envia lembrete 3 dias antes do vencimento. */
export async function runDailyBilling() {
  const db = supabaseAdmin(); const today = todayBR();
  const { data: expired } = await db.from("subscriptions").select("id, user_id, tenant_id").eq("status", "GRACE_PERIOD").lt("grace_until", today);
  for (const s of expired ?? []) {
    await setState(db, s, "BLOCKED", {});
    await notify(s.tenant_id, s.user_id, { title: "Acesso bloqueado", body: "O prazo de carência acabou. Regularize pelo app para voltar a treinar." });
  }
  const due = addDays(today, 3);
  const { data: soon } = await db.from("subscriptions").select("id, user_id, tenant_id, last_reminder_for").eq("status", "ACTIVE").eq("due_date", due);
  let reminded = 0;
  for (const s of soon ?? []) {
    if (s.last_reminder_for === due) continue;
    await notify(s.tenant_id, s.user_id, { title: "Mensalidade vence em 3 dias", body: `Vencimento em ${brDate(due)}. Pague pelo app com cartão ou Pix.` });
    await db.from("subscriptions").update({ last_reminder_for: due }).eq("id", s.id); reminded++;
  }
  return { blocked: expired?.length ?? 0, reminded };
}
