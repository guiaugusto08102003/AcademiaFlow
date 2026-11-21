import { NextResponse } from "next/server";
import { getCaller, supabaseAdmin } from "@/lib/supabase/server";
import { gatewayFor } from "@/lib/gateway/asaas";

/**
 * LGPD: anonimiza o aluno sob solicitação. Remove dados pessoais, treinos, push e login;
 * mantém registros financeiros e de acesso sem identificação (obrigações de guarda e auditoria).
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const caller = await getCaller(req);
  if (!caller || caller.role !== "ADMIN") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const db = supabaseAdmin();
  const { data: u } = await db.from("users").select("id, anonymized_at").eq("id", params.id).eq("tenant_id", caller.tenant_id).eq("role", "STUDENT").maybeSingle();
  if (!u) return NextResponse.json({ error: "Aluno não encontrado." }, { status: 404 });
  if (u.anonymized_at) return NextResponse.json({ ok: true, already: true });

  const { data: sub } = await db.from("subscriptions").select("id, gateway_sub_id").eq("user_id", u.id).maybeSingle();
  let gatewayCanceled: boolean | null = null;
  if (sub?.gateway_sub_id) {
    try { await (await gatewayFor(db, caller.tenant_id)).cancelSubscription(sub.gateway_sub_id); gatewayCanceled = true; } catch { gatewayCanceled = false; }
  }
  await db.from("workouts").delete().eq("student_id", u.id);
  await db.from("push_subscriptions").delete().eq("user_id", u.id);
  if (sub) await db.from("subscriptions").update({ status: "CANCELED", grace_until: null }).eq("id", sub.id);
  const { error } = await db.from("users").update({
    name: "Aluno anonimizado", phone: null, email: null, health_notes: null, face_token_url: null,
    lgpd_consent_at: null, access_status: "BLOCKED", anonymized_at: new Date().toISOString(),
  }).eq("id", u.id);
  if (error) return NextResponse.json({ error: "Falha ao anonimizar." }, { status: 500 });
  await db.auth.admin.updateUserById(u.id, { email: `anon-${u.id}@anonimizado.invalid`, ban_duration: "876000h" }); // impede novo login
  return NextResponse.json({ ok: true, gatewayCanceled });
}
