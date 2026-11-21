import { NextResponse } from "next/server";
import { getCaller, supabaseAdmin } from "@/lib/supabase/server";
import { gatewayFor } from "@/lib/gateway/asaas";

/** ADMIN ativa a cobrança recorrente de um aluno no gateway. */
export async function POST(req: Request) {
  const caller = await getCaller(req);
  if (!caller || caller.role !== "ADMIN") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { userId, planId, dueDate, cpfCnpj } = await req.json();
  if (!userId || !planId || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate ?? "")) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });

  const db = supabaseAdmin();
  const [{ data: user }, { data: plan }, { data: existing }] = await Promise.all([
    db.from("users").select("id, name, phone").eq("id", userId).eq("tenant_id", caller.tenant_id).eq("role", "STUDENT").maybeSingle(),
    db.from("plans").select("id, name, price").eq("id", planId).eq("tenant_id", caller.tenant_id).maybeSingle(),
    db.from("subscriptions").select("id, gateway_sub_id").eq("user_id", userId).eq("tenant_id", caller.tenant_id).maybeSingle(),
  ]);
  if (!user || !plan) return NextResponse.json({ error: "Aluno ou plano não encontrado." }, { status: 404 });
  if (existing?.gateway_sub_id) return NextResponse.json({ error: "Cobrança já ativada para este aluno." }, { status: 409 });

  try {
    const gw = await gatewayFor(db, caller.tenant_id);
    const customer = await gw.createCustomer({ name: user.name, cpfCnpj: cpfCnpj?.replace(/\D/g, "") || undefined, mobilePhone: user.phone ?? undefined, externalReference: user.id });
    const sub = await gw.createSubscription({ customer: customer.id, value: Number(plan.price), nextDueDate: dueDate, description: `${plan.name} – mensalidade`, externalReference: user.id });
    const row = { tenant_id: caller.tenant_id, user_id: user.id, plan_id: plan.id, gateway_sub_id: sub.id, status: "ACTIVE", due_date: dueDate, grace_until: null, amount: plan.price };
    const { error } = existing ? await db.from("subscriptions").update(row).eq("id", existing.id) : await db.from("subscriptions").insert(row);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, gateway_sub_id: sub.id });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Falha ao ativar cobrança." }, { status: 502 });
  }
}
