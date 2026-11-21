"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function Consent() {
  const sb = supabaseBrowser(); const router = useRouter();
  const [ok, setOk] = useState(false); const [err, setErr] = useState("");
  async function accept() {
    const { error } = await sb.rpc("accept_lgpd_consent");
    if (error) return setErr("Não foi possível registrar. Tente novamente.");
    router.replace("/");
  }
  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="text-2xl font-bold">Seus dados na academia</h1>
      <p className="mt-3">Para usar o app, precisamos do seu consentimento para tratar:</p>
      <ul className="mt-2 list-disc pl-5 space-y-1">
        <li>Biometria facial, se você usar a entrada por reconhecimento facial.</li>
        <li>Dados de saúde e restrições físicas, para o professor montar seu treino com segurança.</li>
        <li>Dados de cobrança e pagamento da sua mensalidade.</li>
      </ul>
      <p className="mt-3 text-sm">Você pode pedir a exclusão ou anonimização dos seus dados a qualquer momento na recepção.</p>
      <label className="mt-5 flex items-start gap-3">
        <input type="checkbox" className="mt-1 h-5 w-5" checked={ok} onChange={(e) => setOk(e.target.checked)} />
        <span>Li e concordo com o tratamento dos meus dados nas finalidades acima.</span>
      </label>
      {err && <p role="alert" className="mt-2 text-sm text-red-700">{err}</p>}
      <button disabled={!ok} onClick={accept} className="mt-5 w-full rounded-lg bg-forest-900 py-3 font-semibold text-lime-400 disabled:opacity-40">
        Aceitar e continuar
      </button>
    </main>
  );
}
