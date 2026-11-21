"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

const toKey = (b64: string) => {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

export default function PushOptIn() {
  const sb = supabaseBrowser();
  const [state, setState] = useState<"hidden" | "ask" | "on" | "denied">("hidden"); const [err, setErr] = useState("");
  const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  useEffect(() => {
    if (!vapid || !("serviceWorker" in navigator) || !("PushManager" in window)) return; // iOS só em PWA instalado
    setState(Notification.permission === "granted" ? "on" : Notification.permission === "denied" ? "denied" : "ask");
  }, [vapid]);

  async function enable() {
    setErr("");
    if ((await Notification.requestPermission()) !== "granted") return setState("denied");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(vapid!) });
      const j = sub.toJSON(); const { data } = await sb.auth.getSession(); const uid = data.session!.user.id;
      const { data: me } = await sb.from("users").select("tenant_id").eq("id", uid).single();
      const { error } = await sb.from("push_subscriptions").upsert({ tenant_id: me!.tenant_id, user_id: uid, endpoint: j.endpoint!, p256dh: j.keys!.p256dh, auth: j.keys!.auth }, { onConflict: "endpoint" });
      if (error) throw error; setState("on");
    } catch { setErr("Não foi possível ativar os avisos. Tente de novo."); }
  }
  if (state === "hidden") return null;
  return (
    <div className="mt-6 rounded-lg border border-forest-900/15 bg-white p-4">
      {state === "on" && <p>Avisos de vencimento ativados neste aparelho.</p>}
      {state === "denied" && <p>Avisos bloqueados. Libere as notificações nas configurações do navegador.</p>}
      {state === "ask" && <><p>Receba lembrete antes do vencimento e aviso se houver atraso.</p>
        <button onClick={enable} className="mt-2 rounded-lg bg-forest-900 px-4 py-2 font-semibold text-lime-400">Ativar avisos</button></>}
      {err && <p role="alert" className="mt-2 text-sm text-red-700">{err}</p>}
    </div>
  );
}
