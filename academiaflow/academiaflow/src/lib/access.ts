import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, todayBR } from "./dates";

export type Decision = { allowed: boolean; reason?: string; name?: string };

export const weekStartBR = () => { const t = todayBR(); return addDays(t, -((new Date(t + "T00:00:00Z").getUTCDay() + 6) % 7)); }; // segunda-feira
export const weekSinceISO = () => `${weekStartBR()}T00:00:00-03:00`;

/** Regras: status → consentimento (facial) → limite semanal do plano. Registra em access_logs. */
export async function decideAccess(db: SupabaseClient, tenantId: string, userId: string, method: "QR" | "FACE", tokenId?: string): Promise<Decision> {
  const { data: u } = await db.from("users").select("id, name, role, access_status, lgpd_consent_at, anonymized_at")
    .eq("id", userId).eq("tenant_id", tenantId).maybeSingle();
  if (!u || u.anonymized_at) return { allowed: false, reason: "USER_NOT_FOUND" };

  let reason: string | undefined;
  if (u.access_status === "BLOCKED") reason = "BLOCKED";
  else if (u.access_status === "PAUSED") reason = "PAUSED";
  else if (method === "FACE" && !u.lgpd_consent_at) reason = "NO_CONSENT"; // biometria exige consentimento LGPD
  else if (u.role === "STUDENT") {
    const { data: sub } = await db.from("subscriptions").select("plans(weekly_limit)").eq("user_id", u.id).maybeSingle();
    if (!sub) reason = "NO_PLAN";
    else {
      const limit = (sub as any).plans?.weekly_limit as number | null;
      if (limit != null) {
        const { data: days } = await db.rpc("week_usage", { p_tenant: tenantId, p_since: weekSinceISO(), p_user: u.id });
        const used = new Set((days ?? []).map((r: { day: string }) => r.day));
        if (!used.has(todayBR()) && used.size >= limit) reason = "WEEKLY_LIMIT"; // reentrar no mesmo dia não consome
      }
    }
  }
  const allowed = !reason;
  const { error } = await db.from("access_logs").insert({ tenant_id: tenantId, user_id: u.id, method, status: allowed ? "GRANTED" : "DENIED", reason: reason ?? null, token_id: tokenId ?? null });
  if (error?.code === "23505") return { allowed: false, reason: "TOKEN_REUSED" }; // mesmo QR apresentado duas vezes
  return { allowed, reason, name: allowed ? u.name.split(" ")[0] : undefined };
}
