"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { brDate } from "@/lib/dates";
import PushOptIn from "@/components/PushOptIn";

type Sub = { status: string; due_date: string | null; grace_until: string | null; amount: number; gateway_sub_id: string | null };
const LABEL: Record<string, string> = { ACTIVE: "Em dia", GRACE_PERIOD: "Em atraso (carência)", PAUSED: "Plano pausado", BLOCKED: "Acesso bloqueado", CANCELED: "Cancelado" };

export default function Pagamento() {
  const sb = supabaseBrowser();
  const [sub, setSub] = useState<Sub | null | undefined>(undefined); const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => {
    sb.auth.getSession().then(async ({ data }) => {
      if (!data.session) return (location.href = "/login");
      const { data: s } = await sb.from("subscriptions").select("status, due_date, grace_until, amount, gateway_sub_id").maybeSingle();
      setSub(s);
    });
  }, []);
  async function pay() {
    setBusy(true); setMsg("");
    const { data } = await sb.auth.getSession();
    const r = await fetch("/api/payment-link", { headers: { Authorization: `Bearer ${data.session?.access_token}` } });
    const j = await r.json(); setBusy(false);
    if (j.url) return (location.href = j.url);
    setMsg(j.reason === "nothing_due" ? "Não há cobrança em aberto agora." : j.reason === "no_billing" ? "Sua cobrança ainda não foi ativada. Fale com a recepção." : "Não foi possível abrir o pagamento. Tente novamente.");
  }
  if (sub === undefined) return <main className="p-6">Carregando…</main>;
  return (
    <main className="mx-auto max-w-md p-6">
      <a href="/" className="text-sm underline">Início</a>
      <h1 className="mt-2 text-2xl font-bold">Minha mensalidade</h1>
      {!sub ? <p className="mt-4">Você ainda não tem plano ativo. Fale com a recepção.</p> : <>
        <p className="mt-4 text-xl font-semibold">{LABEL[sub.status] ?? sub.status}</p>
        <p className="mt-1">R$ {Number(sub.amount).toFixed(2).replace(".", ",")}{sub.due_date && ` · vence em ${brDate(sub.due_date)}`}</p>
        {sub.status === "GRACE_PERIOD" && sub.grace_until && <p className="mt-1 text-amber-800">Pague até {brDate(sub.grace_until)} para não perder o acesso.</p>}
        {sub.status === "BLOCKED" && <p className="mt-1 text-red-700">Pague para liberar a entrada novamente.</p>}
        {sub.status !== "PAUSED" && <button disabled={busy} onClick={pay} className="mt-5 w-full rounded-lg bg-forest-900 py-3 font-semibold text-lime-400 disabled:opacity-50">Pagar agora (cartão ou Pix)</button>}
        {msg && <p role="status" className="mt-3 text-sm">{msg}</p>}
      </>}
      <PushOptIn />
    </main>
  );
}
