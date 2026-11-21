import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { authGate } from "@/lib/gate";
import { verifyAccessToken } from "@/lib/accessToken";
import { decideAccess, Decision } from "@/lib/access";

/** Chamado pela catraca/leitor. Body: { token } (QR) ou { method: "FACE", user_id } (leitor facial já identificou). */
export async function POST(req: Request, { params }: { params: { tenantId: string } }) {
  const db = supabaseAdmin();
  if (!(await authGate(db, req, params.tenantId))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);

  let d: Decision;
  if (body?.token) {
    const v = verifyAccessToken(body.token, params.tenantId);
    d = v.ok ? await decideAccess(db, params.tenantId, v.sub, "QR", v.jti)
             : { allowed: false, reason: v.reason === "EXPIRED" ? "TOKEN_EXPIRED" : "TOKEN_INVALID" };
  } else if (body?.method === "FACE" && body.user_id) {
    d = await decideAccess(db, params.tenantId, body.user_id, "FACE");
  } else return NextResponse.json({ error: "bad_request" }, { status: 400 });

  return NextResponse.json({ allowed: d.allowed, reason: d.reason ?? null, name: d.name ?? null });
}
