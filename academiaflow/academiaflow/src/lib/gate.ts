import { timingSafeEqual } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export type GateCfg = { url?: string; token?: string } | null | undefined;
const eq = (a: string, b: string) => a.length === b.length && a.length > 0 && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** A catraca/leitor chama nossa API enviando o token compartilhado (x-gate-token ou Bearer). */
export async function authGate(db: SupabaseClient, req: Request, tenantId: string) {
  const given = req.headers.get("x-gate-token") ?? req.headers.get("authorization")?.replace("Bearer ", "") ?? "";
  const { data } = await db.from("tenants").select("id, gate_api_config").eq("id", tenantId).maybeSingle();
  const expected = (data?.gate_api_config as GateCfg)?.token ?? "";
  return data && eq(given, expected) ? data : null;
}

/** Nós chamamos a catraca (liberação manual). Retorna false se não configurada ou sem resposta em 5 s. */
export async function openGate(cfg: GateCfg, payload: object): Promise<boolean> {
  if (!cfg?.url) return false;
  try {
    const r = await fetch(cfg.url, { method: "POST", signal: AbortSignal.timeout(5000),
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.token ?? ""}` },
      body: JSON.stringify({ action: "open", ...payload }) });
    return r.ok;
  } catch { return false; }
}
