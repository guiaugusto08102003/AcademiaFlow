import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { authGate } from "@/lib/gate";
import { tenantKey } from "@/lib/accessToken";
import { weekSinceISO, weekStartBR } from "@/lib/access";

/**
 * Fallback local: o controlador da catraca baixa este snapshot a cada poucos minutos e, se a API ficar
 * fora do ar, valida o JWT localmente (HS256 com `key`) e confere `users`. Sem nomes (minimiza dados pessoais).
 */
export async function GET(req: Request, { params }: { params: { tenantId: string } }) {
  const db = supabaseAdmin();
  if (!(await authGate(db, req, params.tenantId))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [{ data: users }, { data: subs }, { data: usage }] = await Promise.all([
    db.from("users").select("id, role").eq("tenant_id", params.tenantId).in("access_status", ["ACTIVE", "GRACE_PERIOD"]).is("anonymized_at", null),
    db.from("subscriptions").select("user_id, plans(weekly_limit)").eq("tenant_id", params.tenantId),
    db.rpc("week_usage", { p_tenant: params.tenantId, p_since: weekSinceISO() }),
  ]);
  const limit = new Map((subs ?? []).map((s: any) => [s.user_id, s.plans?.weekly_limit ?? null]));
  const days = new Map<string, string[]>();
  for (const r of usage ?? []) days.set(r.user_id, [...(days.get(r.user_id) ?? []), r.day]);

  return NextResponse.json({
    generated_at: new Date().toISOString(), week_start: weekStartBR(), ttl_seconds: 900,
    key: tenantKey(params.tenantId).toString("base64"), // chave HS256 desta academia
    users: (users ?? []).filter((u) => u.role !== "STUDENT" || limit.has(u.id)).map((u) => ({ id: u.id, weekly_limit: limit.get(u.id) ?? null, days_used: days.get(u.id) ?? [] })),
  });
}
