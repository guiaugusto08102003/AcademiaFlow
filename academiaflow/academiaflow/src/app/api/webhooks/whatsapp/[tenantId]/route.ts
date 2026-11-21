import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/lib/supabase/server";
import { parseInbound, sendWhatsApp, WaCfg } from "@/lib/whatsapp";
import { botReply } from "@/lib/bot";

const safeEq = (a: string, b: string) => a.length === b.length && a.length > 0 && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Webhook de mensagens recebidas (Z-API / Evolution). Autenticado por `?secret=` (ou header x-webhook-secret). */
export async function POST(req: Request, { params }: { params: { tenantId: string } }) {
  const db = supabaseAdmin();
  const { data: t } = await db.from("tenants").select("whatsapp_config").eq("id", params.tenantId).maybeSingle();
  const cfg = t?.whatsapp_config as WaCfg | undefined;
  const given = new URL(req.url).searchParams.get("secret") ?? req.headers.get("x-webhook-secret") ?? "";
  if (!cfg?.webhook_secret || !safeEq(given, cfg.webhook_secret)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const m = parseInbound(await req.json().catch(() => null));
  if (!m) return NextResponse.json({ ok: true, ignored: true });

  const key = `${params.tenantId}:wa:${m.id}`; // idempotência por mensagem
  const { error: dup } = await db.from("webhook_events").insert({ id: key, tenant_id: params.tenantId });
  if (dup) return dup.code === "23505" ? NextResponse.json({ ok: true, duplicate: true }) : NextResponse.json({ error: "db" }, { status: 500 });
  try {
    await sendWhatsApp(cfg, m.phone, await botReply(db, params.tenantId, m.phone, m.text));
    return NextResponse.json({ ok: true });
  } catch {
    await db.from("webhook_events").delete().eq("id", key);
    return NextResponse.json({ error: "processing_failed" }, { status: 500 });
  }
}
