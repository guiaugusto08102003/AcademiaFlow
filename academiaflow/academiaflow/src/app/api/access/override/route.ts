import { NextResponse } from "next/server";
import { getCaller, supabaseAdmin } from "@/lib/supabase/server";
import { openGate } from "@/lib/gate";

/** Liberação manual de emergência (só ADMIN). Registra ANTES de abrir, para a auditoria nunca ficar sem rastro. */
export async function POST(req: Request) {
  const caller = await getCaller(req);
  if (!caller || caller.role !== "ADMIN") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { userId, reason } = await req.json();
  if (typeof reason !== "string" || reason.trim().length < 5) return NextResponse.json({ error: "Informe o motivo da liberação." }, { status: 400 });

  const db = supabaseAdmin();
  if (userId) {
    const { data: u } = await db.from("users").select("id").eq("id", userId).eq("tenant_id", caller.tenant_id).maybeSingle();
    if (!u) return NextResponse.json({ error: "Aluno não encontrado." }, { status: 404 });
  }
  const { error } = await db.from("access_logs").insert({ tenant_id: caller.tenant_id, user_id: userId ?? null, method: "MANUAL_OVERRIDE", status: "GRANTED", reason: reason.trim(), actor_id: caller.id });
  if (error) return NextResponse.json({ error: "Não foi possível registrar a liberação." }, { status: 500 });

  const { data: t } = await db.from("tenants").select("gate_api_config").eq("id", caller.tenant_id).single();
  const opened = await openGate(t?.gate_api_config, { reason: "MANUAL_OVERRIDE", user_id: userId ?? null });
  return NextResponse.json({ ok: true, opened });
}
