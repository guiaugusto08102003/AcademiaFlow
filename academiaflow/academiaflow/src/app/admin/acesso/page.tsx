"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

type Log = { id: string; method: string; status: string; reason: string | null; timestamp: string; users: { name: string } | null };
const METHOD: Record<string, string> = { QR: "QR Code", FACE: "Facial", MANUAL_OVERRIDE: "Liberação manual" };
const REASON: Record<string, string> = { BLOCKED: "Bloqueado", PAUSED: "Plano pausado", WEEKLY_LIMIT: "Limite semanal", NO_PLAN: "Sem plano", NO_CONSENT: "Sem consentimento" };

export default function Acesso() {
  const sb = supabaseBrowser(); const router = useRouter();
  const [students, setStudents] = useState<{ id: string; name: string }[]>([]); const [logs, setLogs] = useState<Log[]>([]);
  const [userId, setUserId] = useState(""); const [reason, setReason] = useState(""); const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);

  async function load() {
    const { data: s } = await sb.auth.getSession();
    if (!s.session) return router.replace("/login");
    const { data: me } = await sb.from("users").select("role").eq("id", s.session.user.id).single();
    if (me?.role !== "ADMIN") return router.replace("/");
    const [{ data: st }, { data: lg }] = await Promise.all([
      sb.from("users").select("id, name").eq("role", "STUDENT").is("anonymized_at", null).order("name"),
      sb.from("access_logs").select("id, method, status, reason, timestamp, users!access_logs_user_id_fkey(name)").order("timestamp", { ascending: false }).limit(30)]);
    setStudents(st ?? []); setLogs((lg as unknown as Log[]) ?? []);
  }
  useEffect(() => { load(); }, []);

  async function release() {
    if (!confirm("Liberar a entrada agora? A ação fica registrada com seu nome.")) return;
    setBusy(true); setMsg("");
    const { data } = await sb.auth.getSession();
    const r = await fetch("/api/access/override", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token}` }, body: JSON.stringify({ userId: userId || null, reason }) });
    const j = await r.json(); setBusy(false);
    if (!r.ok) return setMsg(j.error ?? "Erro ao liberar.");
    setMsg(j.opened ? "Entrada liberada e registrada." : "Registrado, mas a catraca não respondeu. Abra manualmente."); setReason(""); load();
  }
  const inp = "w-full rounded-lg border border-forest-700/30 bg-white px-3 py-3";
  return (
    <main className="mx-auto max-w-md p-6">
      <a href="/" className="text-sm underline">Início</a>
      <h1 className="mt-2 text-2xl font-bold">Acesso e catraca</h1>
      <section className="mt-4 space-y-2 rounded-lg border border-amber-400 bg-amber-100 p-3">
        <h2 className="font-semibold">Liberação manual de emergência</h2>
        <select className={inp} value={userId} onChange={(e) => setUserId(e.target.value)}>
          <option value="">Visitante / sem cadastro</option>{students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <input className={inp} placeholder="Motivo (obrigatório)" value={reason} onChange={(e) => setReason(e.target.value)} />
        <button disabled={busy || reason.trim().length < 5} onClick={release} className="w-full rounded-lg bg-forest-900 py-3 font-semibold text-lime-400 disabled:opacity-40">Liberar entrada</button>
        {msg && <p role="status" className="text-sm">{msg}</p>}
      </section>
      <h2 className="mt-6 font-semibold">Últimos acessos</h2>
      <ul className="mt-2 divide-y divide-forest-900/10">
        {logs.map((l) => (
          <li key={l.id} className="py-2 text-sm">
            <div className="flex justify-between"><span>{l.users?.name ?? "Visitante"}</span><span className={l.status === "GRANTED" ? "text-forest-700" : "text-red-700"}>{l.status === "GRANTED" ? "Liberado" : "Negado"}</span></div>
            <div className="text-forest-700">{new Date(l.timestamp).toLocaleString("pt-BR")} · {METHOD[l.method]}{l.reason && ` · ${REASON[l.reason] ?? l.reason}`}</div>
          </li>))}
      </ul>
      {logs.length === 0 && <p className="mt-2 text-forest-700">Nenhum acesso registrado ainda.</p>}
    </main>
  );
}
