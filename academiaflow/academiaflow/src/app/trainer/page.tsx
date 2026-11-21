"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

type S = { id: string; name: string; health_notes: string | null };

export default function Students() {
  const sb = supabaseBrowser(); const router = useRouter();
  const [list, setList] = useState<S[]>([]); const [q, setQ] = useState(""); const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      const { data: s } = await sb.auth.getSession();
      if (!s.session) return router.replace("/login");
      const { data: me } = await sb.from("users").select("role").eq("id", s.session.user.id).single();
      if (me?.role === "STUDENT") return router.replace("/");
      const { data } = await sb.from("users").select("id, name, health_notes").eq("role", "STUDENT").is("anonymized_at", null).order("name");
      setList(data ?? []); setLoading(false);
    })();
  }, []);
  const shown = list.filter((s) => s.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="text-2xl font-bold">Alunos</h1>
      <input className="mt-4 w-full rounded-lg border border-forest-700/30 bg-white px-3 py-3" placeholder="Buscar aluno" value={q} onChange={(e) => setQ(e.target.value)} />
      <ul className="mt-4 divide-y divide-forest-900/10">
        {shown.map((s) => (
          <li key={s.id}><a href={`/trainer/${s.id}`} className="flex items-center justify-between py-4">
            <span>{s.name}</span>
            {s.health_notes && <span className="rounded bg-amber-200 px-2 py-0.5 text-xs">Restrição</span>}
          </a></li>))}
      </ul>
      {!loading && shown.length === 0 && <p className="mt-4 text-forest-700">Nenhum aluno encontrado. Importe alunos pelo painel de configurações.</p>}
    </main>
  );
}
