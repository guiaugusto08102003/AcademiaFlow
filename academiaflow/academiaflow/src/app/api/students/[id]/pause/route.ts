import { NextResponse } from "next/server";
import { getCaller, supabaseAdmin } from "@/lib/supabase/server";
import { gatewayFor } from "@/lib/gateway/asaas";

/** ADMIN pausa/reativa o aluno. Pausa sem perder histórico; webhooks não alteram alunos pausados. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const caller = await getCaller(req);
  if (!caller || caller.role !== "ADMIN") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { pause } = await req.json();
  const db = supabaseAdmin();
  const { data: u } = await db.from("users").select("id").eq("id", params.id).eq("tenant_id", caller.tenant_id).eq("role", "STUDENT").maybeSingle();
  if (!u) return NextResponse.json({ error: "Aluno não encontrado." }, { status: 404 });

  const status = pause ? "PAUSED" : "ACTIVE";
  await db.from("users").update({ access_status: status }).eq("id", u.id);
  const { data: sub } = await db.from("subscriptions").select("id, gateway_sub_id").eq("user_id", u.id).maybeSingle();
  if (sub) await db.from("subscriptions").update({ status, grace_until: null }).eq("id", sub.id);

  let gateway: boolean | null = null; // null = sem cobrança no gateway
  if (sub?.gateway_sub_id) {
    try { await (await gatewayFor(db, caller.tenant_id)).setSubscriptionActive(sub.gateway_sub_id, !pause); gateway = true; }
    catch { gateway = false; }
  }
  return NextResponse.json({ ok: true, gateway });
}
