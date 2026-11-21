"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function Login() {
  const sb = supabaseBrowser(); const router = useRouter();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [f, setF] = useState({ email: "", password: "", name: "", tenant: "" });
  const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMsg("");
    if (mode === "up") {
      const { error } = await sb.auth.signUp({ email: f.email, password: f.password, options: { data: { name: f.name, tenant: f.tenant } } });
      setBusy(false);
      return error ? setMsg(error.message) : (setMsg("Conta criada. Confirme o e-mail (se exigido) e entre."), setMode("in"));
    }
    const { data, error } = await sb.auth.signInWithPassword({ email: f.email, password: f.password });
    if (error || !data.user) { setBusy(false); return setMsg("E-mail ou senha incorretos."); }
    let { data: p } = await sb.from("users").select("role, lgpd_consent_at").eq("id", data.user.id).maybeSingle();
    if (!p) { // primeiro acesso do dono: cria academia + ADMIN
      const m = data.user.user_metadata;
      const { error: e2 } = await sb.rpc("create_tenant_with_admin", { p_tenant_name: m.tenant ?? "Minha academia", p_user_name: m.name ?? "Admin" });
      if (e2) { setBusy(false); return setMsg("Perfil não encontrado. Peça acesso ao dono da academia."); }
      return router.replace("/onboarding");
    }
    router.replace(p.role === "STUDENT" && !p.lgpd_consent_at ? "/consent" : p.role === "ADMIN" ? "/onboarding" : "/");
  }

  const input = "w-full rounded-lg border border-forest-700/30 bg-white px-3 py-3";
  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="text-2xl font-bold">{mode === "in" ? "Entrar" : "Criar conta da academia"}</h1>
      <form onSubmit={submit} className="mt-6 space-y-3">
        {mode === "up" && <>
          <input className={input} placeholder="Seu nome" value={f.name} onChange={set("name")} required />
          <input className={input} placeholder="Nome da academia" value={f.tenant} onChange={set("tenant")} required />
        </>}
        <input className={input} type="email" placeholder="E-mail" value={f.email} onChange={set("email")} required />
        <input className={input} type="password" minLength={8} placeholder="Senha (mín. 8 caracteres)" value={f.password} onChange={set("password")} required />
        {msg && <p role="alert" className="text-sm text-red-700">{msg}</p>}
        <button disabled={busy} className="w-full rounded-lg bg-forest-900 py-3 font-semibold text-lime-400 disabled:opacity-50">
          {mode === "in" ? "Entrar" : "Criar conta"}
        </button>
      </form>
      <button className="mt-4 text-sm underline" onClick={() => setMode(mode === "in" ? "up" : "in")}>
        {mode === "in" ? "Sou dono e quero criar a conta da academia" : "Já tenho conta"}
      </button>
    </main>
  );
}
