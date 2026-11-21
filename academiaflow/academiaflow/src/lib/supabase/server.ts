import { createClient } from "@supabase/supabase-js";

/** Service role: só em rotas de servidor. Ignora RLS — valide permissão antes. */
export const supabaseAdmin = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

/** Valida o Bearer token e retorna o perfil (tenant + role) do chamador. */
export async function getCaller(req: Request) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const admin = supabaseAdmin();
  const { data } = await admin.auth.getUser(token);
  if (!data.user) return null;
  const { data: profile } = await admin.from("users").select("id, tenant_id, role").eq("id", data.user.id).single();
  return profile as { id: string; tenant_id: string; role: "ADMIN" | "TRAINER" | "STUDENT" } | null;
}
