import webpush from "web-push";
import { supabaseAdmin } from "./supabase/server";

let ready = false;
/** Nunca lança: falha de push não pode derrubar webhook nem cron. */
export async function sendPush(userId: string, p: { title: string; body: string; url?: string }) {
  try {
    const { VAPID_PRIVATE_KEY, NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_SUBJECT } = process.env;
    if (!VAPID_PRIVATE_KEY || !NEXT_PUBLIC_VAPID_PUBLIC_KEY) return;
    if (!ready) { webpush.setVapidDetails(VAPID_SUBJECT ?? "mailto:contato@example.com", NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY); ready = true; }
    const db = supabaseAdmin();
    const { data } = await db.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", userId);
    await Promise.all((data ?? []).map(async (s) => {
      try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify({ url: "/pagamento", ...p })); }
      catch (e: any) { if (e.statusCode === 404 || e.statusCode === 410) await db.from("push_subscriptions").delete().eq("id", s.id); }
    }));
  } catch { /* ignora */ }
}
