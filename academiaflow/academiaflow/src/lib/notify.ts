import { sendPush } from "./push";
import { sendWhatsApp } from "./whatsapp";
import { supabaseAdmin } from "./supabase/server";

/** Aviso ao aluno por Web Push e, se a academia configurou, por WhatsApp. Nunca lança. */
export async function notify(tenantId: string, userId: string, p: { title: string; body: string; url?: string }) {
  await sendPush(userId, p);
  try {
    const db = supabaseAdmin();
    const [{ data: t }, { data: u }] = await Promise.all([
      db.from("tenants").select("whatsapp_config").eq("id", tenantId).single(),
      db.from("users").select("phone").eq("id", userId).single(),
    ]);
    if (t?.whatsapp_config && u?.phone) await sendWhatsApp(t.whatsapp_config, u.phone, `*${p.title}*\n${p.body}`);
  } catch { /* ignora */ }
}
