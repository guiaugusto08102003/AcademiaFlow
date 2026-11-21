"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

type S = { id: string; name: string; access_status: string };
const ST: Record<string, string> = { ACTIVE: "Em dia", GRACE_PERIOD: "Carência", PAUSED: "Pausado", BLOCKED: "Bloqueado" };

export default function Alunos() {
  const sb = supabaseBrowser(); const router = useRouter();
  const [list, setList] = useState<S[]>([]); const [q, setQ] = useState(""); const [msg, setMsg] = useState("");
  async function load() {
    const { data: s } = await sb.auth.getSession();
    if (!s.session) return router.replace("/login");
    const { data: me } = await sb.from("users").select("role").eq("id", s.session.user.id).single();
    if (me?.role !== "ADMIN") return router.replace("/");
    const { data } = await sb.from("users").select("id, name, access_status").eq("role", "STUDENT").is("anonymized_at", null).order("name");
    setList(data ?? []);
  }
  useEffect(() => { load(); }, []);

  async function act(id: string, path: "pause" | "anonymize", body: object, ask: string) {
    if (!confirm(ask)) return;
    setMsg("");
    const { data } = await sb.auth.getSession();
    const r = await fetch(`/api/students/${id}/${path}`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token}` }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) return setMsg(j.error ?? "Erro.");
    if (j.gateway === false || j.gatewayCanceled === false) setMsg("Feito no app, mas o gateway não respondeu. Ajuste a assinatura no painel do gateway.");
    load();
  }
  const shown = list.filter((s) => s.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <main className="mx-auto max-w-md p-6">
      <a href="/admin" className="text-sm underline">Painel</a>
      <h1 className="mt-2 text-2xl font-bold">Alunos</h1>
      <input className="mt-3 w-full rounded-lg border border-forest-700/30 bg-white px-3 py-3" placeholder="Buscar aluno" value={q} onChange={(e) => setQ(e.target.value)} />
      <ul className="mt-3 divide-y divide-forest-900/10">
        {shown.map((s) => { const paused = s.access_status === "PAUSED"; return (
          <li key={s.id} className="py-3">
            <div className="flex justify-between"><span>{s.name}</span><span className="text-sm text-forest-700">{ST[s.access_status]}</span></div>
            <div className="mt-1 flex gap-5 text-sm underline">
              <button onClick={() => act(s.id, "pause", { pause: !paused }, paused ? "Reativar este aluno? Se houver cobrança em atraso, o status será ajustado no próximo aviso do gateway." : "Pausar este aluno? A entrada é bloqueada e a cobrança é suspensa.")}>{paused ? "Reativar" : "Pausar"}</button>
              <button onClick={() => act(s.id, "anonymize", {}, `Anonimizar ${s.name}? Nome, contato, saúde, treinos e login são removidos e isso não pode ser desfeito.`)}>Anonimizar (LGPD)</button>
            </div>
          </li>); })}
      </ul>
      {msg && <p role="status" className="mt-3 text-sm">{msg}</p>}
    </main>
  );
}
