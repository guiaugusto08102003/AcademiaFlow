"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function Home() {
  const sb = supabaseBrowser(); const router = useRouter();
  const [role, setRole] = useState<string | null>(null);
  useEffect(() => {
    sb.auth.getSession().then(async ({ data }) => {
      if (!data.session) return router.replace("/login");
      const { data: p } = await sb.from("users").select("role, lgpd_consent_at").eq("id", data.session.user.id).maybeSingle();
      if (p?.role === "STUDENT" && !p.lgpd_consent_at) return router.replace("/consent");
      setRole(p?.role ?? localStorage.getItem("af_role")); // offline: último papel conhecido
      if (p?.role) localStorage.setItem("af_role", p.role);
    });
  }, []);
  const link = "block rounded-lg bg-forest-900 px-5 py-4 font-semibold text-lime-400";
  return (
    <main className="mx-auto max-w-md space-y-3 p-6">
      <h1 className="text-3xl font-bold">AcademiaFlow</h1>
      {role === "STUDENT" && <a href="/treino" className={link}>Meu treino</a>}
      {role === "STUDENT" && <a href="/qr" className={link}>Minha entrada (QR Code)</a>}
      {role === "STUDENT" && <a href="/pagamento" className={link}>Minha mensalidade</a>}
      {(role === "TRAINER" || role === "ADMIN") && <a href="/trainer" className={link}>Fichas de treino</a>}
      {role === "ADMIN" && <a href="/admin" className={link}>Painel</a>}
      {role === "ADMIN" && <a href="/admin/alunos" className={link}>Alunos: pausa e LGPD</a>}
      {role === "ADMIN" && <a href="/admin/acesso" className={link}>Acesso e catraca</a>}
      {role === "ADMIN" && <a href="/admin/cobranca" className={link}>Cobrança dos alunos</a>}
      {role === "ADMIN" && <a href="/onboarding" className={link}>Configurações da academia</a>}
      <button className="text-sm underline" onClick={async () => { await sb.auth.signOut(); router.replace("/login"); }}>Sair</button>
    </main>
  );
}
