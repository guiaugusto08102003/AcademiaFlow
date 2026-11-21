"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

type K = { active: number; grace: number; blocked: number; paused: number; denied_7d: number; mrr: number };

export default function Painel() {
  const sb = supabaseBrowser(); const router = useRouter();
  const [k, setK] = useState<K | null>(null); const [err, setErr] = useState(false);
  useEffect(() => {
    sb.auth.getSession().then(async ({ data }) => {
      if (!data.session) return router.replace("/login");
      const { data: me } = await sb.from("users").select("role").eq("id", data.session.user.id).single();
      if (me?.role !== "ADMIN") return router.replace("/");
      const { data: kpi, error } = await sb.rpc("admin_kpis");
      error || !kpi ? setErr(true) : setK(kpi as K);
    });
  }, []);
  const items = k && [
    { v: k.active, l: "Alunos ativos" }, { v: k.grace, l: "Em carência" },
    { v: k.blocked, l: "Inadimplentes (bloqueados)" }, { v: k.denied_7d, l: "Entradas negadas em 7 dias" },
  ];
  return (
    <main className="mx-auto max-w-md p-6">
      <a href="/" className="text-sm underline">Início</a>
      <h1 className="mt-2 text-2xl font-bold">Painel</h1>
      {err && <p role="alert" className="mt-4 text-red-700">Não foi possível carregar os indicadores.</p>}
      {k && <>
        <p className="mt-5 text-sm text-forest-700">Receita mensal recorrente</p>
        <p className="text-4xl font-bold">{Number(k.mrr).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p>
        <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-5">
          {items!.map((i) => <div key={i.l}><dd className="text-3xl font-semibold">{i.v}</dd><dt className="text-sm text-forest-700">{i.l}</dt></div>)}
        </dl>
        <p className="mt-4 text-sm text-forest-700">{k.paused} aluno(s) pausado(s). A receita soma planos ativos e em carência.</p>
      </>}
      <nav className="mt-8 space-y-2">
        {[["/admin/alunos", "Alunos: pausa e LGPD"], ["/admin/cobranca", "Cobrança"], ["/admin/acesso", "Acesso e catraca"], ["/onboarding", "Configurações"]].map(([h, t]) =>
          <a key={h} href={h} className="block rounded-lg bg-forest-900 px-5 py-3 font-semibold text-lime-400">{t}</a>)}
      </nav>
    </main>
  );
}
