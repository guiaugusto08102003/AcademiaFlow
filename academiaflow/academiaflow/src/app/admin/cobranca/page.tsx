"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { brDate, todayBR } from "@/lib/dates";

type Row = { id: string; name: string; access_status: string; subscriptions: { plan_id: string; due_date: string | null; gateway_sub_id: string | null }[] };
type Plan = { id: string; name: string; price: number };

export default function Cobranca() {
  const sb = supabaseBrowser(); const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]); const [plans, setPlans] = useState<Plan[]>([]);
  const [open, setOpen] = useState(""); const [f, setF] = useState({ planId: "", dueDate: todayBR(), cpf: "" }); const [msg, setMsg] = useState("");

  async function load() {
    const { data: s } = await sb.auth.getSession();
    if (!s.session) return router.replace("/login");
    const { data: me } = await sb.from("users").select("role").eq("id", s.session.user.id).single();
    if (me?.role !== "ADMIN") return router.replace("/");
    const [{ data: r }, { data: p }] = await Promise.all([
      sb.from("users").select("id, name, access_status, subscriptions(plan_id, due_date, gateway_sub_id)").eq("role", "STUDENT").is("anonymized_at", null).order("name"),
      sb.from("plans").select("id, name, price").order("name")]);
    setRows((r as Row[]) ?? []); setPlans(p ?? []);
  }
  useEffect(() => { load(); }, []);

  async function activate(userId: string) {
    setMsg("");
    const { data } = await sb.auth.getSession();
    const res = await fetch("/api/subscriptions", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token}` }, body: JSON.stringify({ userId, planId: f.planId, dueDate: f.dueDate, cpfCnpj: f.cpf }) });
    const j = await res.json();
    if (!res.ok) return setMsg(j.error ?? "Erro ao ativar.");
    setOpen(""); load();
  }
  const inp = "w-full rounded-lg border border-forest-700/30 bg-white px-3 py-2";
  return (
    <main className="mx-auto max-w-md p-6">
      <a href="/" className="text-sm underline">Início</a>
      <h1 className="mt-2 text-2xl font-bold">Cobrança dos alunos</h1>
      <ul className="mt-4 divide-y divide-forest-900/10">
        {rows.map((r) => { const s = r.subscriptions[0]; return (
          <li key={r.id} className="py-3">
            <div className="flex items-center justify-between">
              <div><p>{r.name}</p><p className="text-sm text-forest-700">{s?.gateway_sub_id ? `Cobrança ativa · vence ${s.due_date ? brDate(s.due_date) : "-"} · ${r.access_status}` : "Cobrança não ativada"}</p></div>
              {!s?.gateway_sub_id && <button className="text-sm underline" onClick={() => { setOpen(r.id); setF({ planId: s?.plan_id ?? plans[0]?.id ?? "", dueDate: s?.due_date ?? todayBR(), cpf: "" }); }}>Ativar</button>}
            </div>
            {open === r.id && <div className="mt-2 space-y-2">
              <select className={inp} value={f.planId} onChange={(e) => setF({ ...f, planId: e.target.value })}>{plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
              <input className={inp} type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} />
              <input className={inp} inputMode="numeric" placeholder="CPF do aluno" value={f.cpf} onChange={(e) => setF({ ...f, cpf: e.target.value })} />
              <button className="rounded-lg bg-forest-900 px-4 py-2 font-semibold text-lime-400" onClick={() => activate(r.id)}>Ativar cobrança mensal</button>
            </div>}
          </li>); })}
      </ul>
      {msg && <p role="alert" className="mt-3 text-sm text-red-700">{msg}</p>}
    </main>
  );
}
