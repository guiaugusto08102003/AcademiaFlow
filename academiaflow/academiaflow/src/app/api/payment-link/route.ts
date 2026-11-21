import { NextResponse } from "next/server";
import { getCaller, supabaseAdmin } from "@/lib/supabase/server";
import { gatewayFor } from "@/lib/gateway/asaas";

/** Aluno obtém o link de pagamento (cartão/Pix) da própria cobrança em aberto. */
export async function GET(req: Request) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = supabaseAdmin();
  const { data: sub } = await db.from("subscriptions").select("gateway_sub_id").eq("user_id", caller.id).maybeSingle();
  if (!sub?.gateway_sub_id) return NextResponse.json({ url: null, reason: "no_billing" });
  try {
    const url = await (await gatewayFor(db, caller.tenant_id)).openPaymentUrl(sub.gateway_sub_id);
    return NextResponse.json({ url, reason: url ? null : "nothing_due" });
  } catch { return NextResponse.json({ error: "gateway" }, { status: 502 }); }
}
