import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/lib/supabase/server";
import { handlePaymentEvent } from "@/lib/billing";

const safeEq = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export async function POST(req: Request, { params }: { params: { tenantId: string } }) {
  const db = supabaseAdmin();
  const { data: t } = await db.from("tenants").select("gateway_config").eq("id", params.tenantId).maybeSingle();
  const expected: string | undefined = t?.gateway_config?.webhook_token;
  if (!expected || !safeEq(req.headers.get("asaas-access-token") ?? "", expected))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.event) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  // Idempotência: a PK de webhook_events rejeita o mesmo evento entregue duas vezes.
  const key = `${params.tenantId}:${body.id ?? `${body.event}:${body.payment?.id}`}`;
  const { error: dup } = await db.from("webhook_events").insert({ id: key, tenant_id: params.tenantId });
  if (dup) return dup.code === "23505" ? NextResponse.json({ ok: true, duplicate: true }) : NextResponse.json({ error: "db" }, { status: 500 });

  try {
    const result = body.payment ? await handlePaymentEvent(params.tenantId, body.event, body.payment) : "no_payment";
    return NextResponse.json({ ok: true, result });
  } catch {
    await db.from("webhook_events").delete().eq("id", key); // libera para o gateway reenviar
    return NextResponse.json({ error: "processing_failed" }, { status: 500 });
  }
}
