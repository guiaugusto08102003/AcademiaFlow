"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { parseStudentsCsv, StudentRow } from "@/lib/csv";

const DAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const STEPS = ["Horários", "Planos", "Pagamentos", "Catraca", "WhatsApp", "Alunos"];
type Plan = { name: string; price: string; weekly_limit: string };

export default function Onboarding() {
  const sb = supabaseBrowser(); const router = useRouter();
  const [step, setStep] = useState(0); const [tid, setTid] = useState(""); const [msg, setMsg] = useState("");
  const [hours, setHours] = useState(DAYS.map((d) => ({ d, on: d !== "Dom", open: "06:00", close: "21:00" })));
  const [plans, setPlans] = useState<Plan[]>([{ name: "", price: "", weekly_limit: "" }]);
  const [gw, setGw] = useState({ provider: "asaas", api_key: "", webhook_token: "", sandbox: true });
  const [gate, setGate] = useState({ url: "", token: "" });
  const [wa, setWa] = useState({ provider: "zapi", url: "", instance: "", token: "", client_token: "", webhook_secret: "" });
  const [csv, setCsv] = useState<{ rows: StudentRow[]; errors: string[] } | null>(null);
  const [result, setResult] = useState<{ imported: number; errors: string[] } | null>(null);

  useEffect(() => {
    sb.auth.getUser().then(async ({ data }) => {
      if (!data.user) return router.replace("/login");
      const { data: u } = await sb.from("users").select("tenant_id, role").eq("id", data.user.id).single();
      if (!u || u.role !== "ADMIN") return router.replace("/");
      setTid(u.tenant_id);
    });
  }, []);

  useEffect(() => { setWa((w) => ({ ...w, webhook_secret: crypto.randomUUID() })); }, []);
  const saveTenant = async (patch: object) => {
    const { error } = await sb.from("tenants").update(patch).eq("id", tid);
    if (error) { setMsg("Não foi possível salvar. Tente novamente."); return false; }
    setMsg(""); return true;
  };
  async function next() {
    let ok = true;
    if (step === 0) ok = await saveTenant({ business_hours_json: Object.fromEntries(hours.map((h) => [h.d, h.on ? { open: h.open, close: h.close } : null])) });
    if (step === 1) {
      const valid = plans.filter((p) => p.name && Number(p.price) > 0);
      if (!valid.length) return setMsg("Cadastre ao menos um plano com nome e preço.");
      await sb.from("plans").delete().eq("tenant_id", tid); // wizard reenviável
      const { error } = await sb.from("plans").insert(valid.map((p) => ({ tenant_id: tid, name: p.name, price: Number(p.price), weekly_limit: p.weekly_limit ? Number(p.weekly_limit) : null })));
      ok = !error; if (error) setMsg("Erro ao salvar planos (nomes devem ser únicos).");
    }
    if (step === 2) ok = await saveTenant({ gateway_config: gw });
    if (step === 3) ok = await saveTenant({ gate_api_config: gate });
    if (step === 4) ok = await saveTenant({ whatsapp_config: wa });
    if (ok) setStep(step + 1);
  }
  async function onFile(f?: File) { if (f) setCsv(parseStudentsCsv(await f.text())); }
  async function doImport() {
    const { data: s } = await sb.auth.getSession();
    const res = await fetch("/api/import-students", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${s.session?.access_token}` }, body: JSON.stringify({ rows: csv!.rows }) });
    setResult(await res.json());
  }

  const inp = "w-full rounded-lg border border-forest-700/30 bg-white px-3 py-3";
  const btn = "rounded-lg bg-forest-900 px-5 py-3 font-semibold text-lime-400";
  return (
    <main className="mx-auto max-w-md p-6 pb-24">
      <p className="text-sm text-forest-700">Passo {step + 1} de {STEPS.length}</p>
      <div className="mt-1 h-1.5 rounded bg-forest-900/10"><div className="h-1.5 rounded bg-forest-900" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} /></div>
      <h1 className="mt-4 text-2xl font-bold">{STEPS[step]}</h1>

      {step === 0 && <div className="mt-4 space-y-2">{hours.map((h, i) => (
        <div key={h.d} className="flex items-center gap-2">
          <label className="flex w-16 items-center gap-2"><input type="checkbox" checked={h.on} onChange={(e) => setHours(hours.map((x, j) => j === i ? { ...x, on: e.target.checked } : x))} />{h.d}</label>
          <input type="time" disabled={!h.on} className={inp} value={h.open} onChange={(e) => setHours(hours.map((x, j) => j === i ? { ...x, open: e.target.value } : x))} />
          <input type="time" disabled={!h.on} className={inp} value={h.close} onChange={(e) => setHours(hours.map((x, j) => j === i ? { ...x, close: e.target.value } : x))} />
        </div>))}</div>}

      {step === 1 && <div className="mt-4 space-y-3">
        {plans.map((p, i) => (
          <div key={i} className="space-y-2 rounded-lg border border-forest-700/20 p-3">
            <input className={inp} placeholder="Nome (ex.: 3x por semana)" value={p.name} onChange={(e) => setPlans(plans.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
            <div className="flex gap-2">
              <input className={inp} inputMode="decimal" placeholder="Preço R$" value={p.price} onChange={(e) => setPlans(plans.map((x, j) => j === i ? { ...x, price: e.target.value.replace(",", ".") } : x))} />
              <input className={inp} inputMode="numeric" placeholder="Aulas/sem. (vazio = livre)" value={p.weekly_limit} onChange={(e) => setPlans(plans.map((x, j) => j === i ? { ...x, weekly_limit: e.target.value } : x))} />
            </div>
          </div>))}
        <button className="underline" onClick={() => setPlans([...plans, { name: "", price: "", weekly_limit: "" }])}>Adicionar plano</button>
      </div>}

      {step === 2 && <div className="mt-4 space-y-3">
        <select className={inp} value={gw.provider} onChange={(e) => setGw({ ...gw, provider: e.target.value })}><option value="asaas">Asaas</option><option value="stripe">Stripe</option><option value="pagarme">Pagar.me</option></select>
        <input className={inp} placeholder="Chave de API" value={gw.api_key} onChange={(e) => setGw({ ...gw, api_key: e.target.value })} />
        <input className={inp} placeholder="Token do webhook" value={gw.webhook_token} onChange={(e) => setGw({ ...gw, webhook_token: e.target.value })} />
        <label className="flex items-center gap-2"><input type="checkbox" checked={gw.sandbox} onChange={(e) => setGw({ ...gw, sandbox: e.target.checked })} />Modo de testes (sandbox)</label>
        <p className="break-all text-sm">Cadastre este endereço de webhook no gateway: {process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/payments/{tid}</p>
        <p className="text-sm text-forest-700">Só o Asaas está disponível por enquanto. Pode pular e configurar depois.</p></div>}

      {step === 3 && <div className="mt-4 space-y-3">
        <input className={inp} placeholder="URL da API da catraca/trava" value={gate.url} onChange={(e) => setGate({ ...gate, url: e.target.value })} />
        <input className={inp} placeholder="Token da catraca" value={gate.token} onChange={(e) => setGate({ ...gate, token: e.target.value })} />
        <p className="text-sm text-forest-700">Sem catraca? Deixe em branco.</p></div>}

      {step === 4 && <div className="mt-4 space-y-3">
        <select className={inp} value={wa.provider} onChange={(e) => setWa({ ...wa, provider: e.target.value })}><option value="zapi">Z-API</option><option value="evolution">Evolution API</option></select>
        <input className={inp} placeholder="URL base" value={wa.url} onChange={(e) => setWa({ ...wa, url: e.target.value })} />
        <input className={inp} placeholder="Instância" value={wa.instance} onChange={(e) => setWa({ ...wa, instance: e.target.value })} />
        <input className={inp} placeholder="Token" value={wa.token} onChange={(e) => setWa({ ...wa, token: e.target.value })} />
        <input className={inp} placeholder="Client-Token (Z-API, se ativado)" value={wa.client_token} onChange={(e) => setWa({ ...wa, client_token: e.target.value })} />
        <p className="break-all text-sm">Webhook de mensagens recebidas: {process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/whatsapp/{tid}?secret={wa.webhook_secret}</p>
        <p className="text-sm text-forest-700">Refazer este passo gera um novo segredo: atualize a URL no provedor.</p></div>}

      {step === 5 && <div className="mt-4 space-y-3">
        <p>Envie um CSV com as colunas <b>nome, telefone, plano, vencimento</b> (DD/MM/AAAA). O plano deve ter o mesmo nome cadastrado no passo 2.</p>
        <input type="file" accept=".csv,text/csv" onChange={(e) => onFile(e.target.files?.[0])} />
        {csv && <div className="text-sm">
          <p>{csv.rows.length} linhas válidas.</p>
          {csv.errors.slice(0, 5).map((e) => <p key={e} className="text-red-700">{e}</p>)}
          {csv.rows.length > 0 && !result && <button className={`${btn} mt-2`} onClick={doImport}>Importar {csv.rows.length} alunos</button>}
        </div>}
        {result && <div className="text-sm"><p className="font-semibold">{result.imported} alunos importados.</p>{result.errors.slice(0, 8).map((e) => <p key={e} className="text-red-700">{e}</p>)}</div>}
      </div>}

      {msg && <p role="alert" className="mt-3 text-sm text-red-700">{msg}</p>}
      <div className="fixed inset-x-0 bottom-0 flex justify-between gap-3 bg-paper p-4">
        {step > 0 ? <button className="underline" onClick={() => setStep(step - 1)}>Voltar</button> : <span />}
        {step < 5 ? <button className={btn} onClick={next}>{step >= 2 ? "Salvar e continuar" : "Continuar"}</button>
          : <button className={btn} onClick={() => router.replace("/")}>Concluir</button>}
      </div>
    </main>
  );
}
