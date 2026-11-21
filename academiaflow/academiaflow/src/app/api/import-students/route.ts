import { NextResponse } from "next/server";
import { getCaller, supabaseAdmin } from "@/lib/supabase/server";
import { StudentRow } from "@/lib/csv";

export async function POST(req: Request) {
  const caller = await getCaller(req);
  if (!caller || caller.role !== "ADMIN") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { rows } = (await req.json()) as { rows: StudentRow[] };
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > 500)
    return NextResponse.json({ error: "Envie de 1 a 500 linhas." }, { status: 400 });

  const db = supabaseAdmin();
  const { data: plans } = await db.from("plans").select("id, name, price").eq("tenant_id", caller.tenant_id);
  const byName = new Map((plans ?? []).map((p) => [p.name.trim().toLowerCase(), p]));
  const report = { imported: 0, errors: [] as string[] };

  for (const [i, r] of rows.entries()) {
    const plan = byName.get(r.plano.trim().toLowerCase());
    if (!plan) { report.errors.push(`Linha ${i + 2}: plano "${r.plano}" não cadastrado`); continue; }

    // Aluno ainda não tem login próprio: e-mail técnico derivado do telefone (único por academia).
    const email = `${r.telefone}.${caller.tenant_id.slice(0, 8)}@alunos.academiaflow.app`;
    const { data: au, error } = await db.auth.admin.createUser({
      email, email_confirm: true, password: crypto.randomUUID(), user_metadata: { imported: true },
    });
    if (error || !au.user) { report.errors.push(`Linha ${i + 2}: ${error?.message ?? "falha ao criar"}`); continue; }

    const { error: e2 } = await db.from("users").insert({
      id: au.user.id, tenant_id: caller.tenant_id, role: "STUDENT", name: r.nome, phone: r.telefone, email,
    });
    const { error: e3 } = await db.from("subscriptions").insert({
      tenant_id: caller.tenant_id, user_id: au.user.id, plan_id: plan.id, status: "ACTIVE", due_date: r.vencimento, amount: plan.price,
    });
    if (e2 || e3) {
      await db.auth.admin.deleteUser(au.user.id); // rollback (cascade remove users/subscriptions)
      report.errors.push(`Linha ${i + 2}: ${(e2 ?? e3)!.message}`); continue;
    }
    report.imported++;
  }
  return NextResponse.json(report);
}
