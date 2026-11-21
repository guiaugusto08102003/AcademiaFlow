import { NextResponse } from "next/server";
import { getCaller, supabaseAdmin } from "@/lib/supabase/server";
import { signAccessToken } from "@/lib/accessToken";

/** Aluno logado recebe um JWT de 60 s para virar QR Code. */
export async function POST(req: Request) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: u } = await supabaseAdmin().from("users").select("access_status").eq("id", caller.id).single();
  if (u?.access_status === "BLOCKED" || u?.access_status === "PAUSED") return NextResponse.json({ error: u.access_status }, { status: 403 });
  return NextResponse.json({ token: signAccessToken(caller.id, caller.tenant_id, 60), expires_in: 60 });
}
