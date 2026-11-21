// Verificação ponta a ponta contra um ambiente de TESTE (Supabase de dev + app rodando).
//   BASE_URL=http://localhost:3000 NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... npm run verify
// Cria 2 academias descartáveis, testa RLS, idempotência de webhook e QR de uso único, e limpa tudo.
import { createClient } from "@supabase/supabase-js";

const { NEXT_PUBLIC_SUPABASE_URL: URL_, NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON, SUPABASE_SERVICE_ROLE_KEY: SVC } = process.env;
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const opts = { auth: { persistSession: false } };
const db = createClient(URL_, SVC, opts);
const run = Date.now(), PW = "Test12345!", created = { auth: [], tenants: [] };
let fails = 0;
const ok = (c, m) => { console.log(`${c ? "PASS" : "FAIL"}  ${m}`); if (!c) fails++; };
const post = (path, body, headers = {}) => fetch(BASE + path, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => ({})) }));

async function mkUser(tenant_id, role, name) {
  const email = `t${run}.${role.toLowerCase()}.${Math.random().toString(36).slice(2, 6)}@verify.test`;
  const { data, error } = await db.auth.admin.createUser({ email, password: PW, email_confirm: true });
  if (error) throw error; created.auth.push(data.user.id);
  const { error: e2 } = await db.from("users").insert({ id: data.user.id, tenant_id, role, name, email, lgpd_consent_at: new Date().toISOString() });
  if (e2) throw e2; return { id: data.user.id, email };
}
async function login(u) {
  const c = createClient(URL_, ANON, opts); const { data, error } = await c.auth.signInWithPassword({ email: u.email, password: PW });
  if (error) throw error; return { c, token: data.session.access_token };
}
async function mkTenant(name) {
  const { data, error } = await db.from("tenants").insert({ name, gateway_config: { provider: "asaas", api_key: "x", webhook_token: `wh-${run}` }, gate_api_config: { token: `gate-${run}` } }).select("id").single();
  if (error) throw error; created.tenants.push(data.id); return data.id;
}

try {
  const A = await mkTenant(`Verify A ${run}`), B = await mkTenant(`Verify B ${run}`);
  const adminA = await mkUser(A, "ADMIN", "Admin A"), trainerA = await mkUser(A, "TRAINER", "Trainer A");
  const studA = await mkUser(A, "STUDENT", "Aluno A"), studB = await mkUser(B, "STUDENT", "Aluno B");
  const { data: plan } = await db.from("plans").insert({ tenant_id: A, name: `P${run}`, price: 100, weekly_limit: 2 }).select("id").single();
  await db.from("subscriptions").insert({ tenant_id: A, user_id: studA.id, plan_id: plan.id, gateway_sub_id: `sub_${run}`, status: "ACTIVE", due_date: "2030-01-01", amount: 100 });

  console.log("\n— RLS —");
  const ca = await login(adminA), ct = await login(trainerA), cs = await login(studA);
  const { data: uA } = await ca.c.from("users").select("id, tenant_id");
  ok(uA.length >= 3 && uA.every((r) => r.tenant_id === A) && !uA.some((r) => r.id === studB.id), "ADMIN A só enxerga a própria academia");
  const { data: subsT } = await ct.c.from("subscriptions").select("id");
  ok(subsT.length === 0, "TRAINER não acessa financeiro (subscriptions)");
  const { error: wErr } = await ct.c.from("workouts").insert({ tenant_id: A, student_id: studA.id, trainer_id: trainerA.id, title: "Teste", exercises_json: [] });
  ok(!wErr, "TRAINER cria ficha de treino");
  const { data: uS } = await cs.c.from("users").select("id");
  ok(uS.length === 1 && uS[0].id === studA.id, "STUDENT só vê o próprio perfil");
  const { data: esc } = await cs.c.from("users").update({ role: "ADMIN" }).eq("id", studA.id).select();
  ok(!esc || esc.length === 0, "STUDENT não consegue se promover a ADMIN");
  const { data: logsS } = await cs.c.from("access_logs").select("id");
  ok(logsS.length === 0, "STUDENT não lê access_logs");

  console.log("\n— Webhook de pagamento (idempotência e estados) —");
  const hdr = { "asaas-access-token": `wh-${run}` }, hook = `/api/webhooks/payments/${A}`;
  const due = new Date(Date.now() - 10 * 864e5).toISOString().slice(0, 10);
  const ev = (id, event) => ({ id, event, payment: { id: `pay_${run}`, subscription: `sub_${run}`, dueDate: due } });
  ok((await post(hook, ev("e1", "PAYMENT_OVERDUE"))).status === 401, "Webhook sem token é rejeitado (401)");
  const r1 = await post(hook, ev(`evt_${run}_1`, "PAYMENT_OVERDUE"), hdr), r2 = await post(hook, ev(`evt_${run}_1`, "PAYMENT_OVERDUE"), hdr);
  ok(r1.status === 200 && !r1.json.duplicate, "1ª entrega processada");
  ok(r2.status === 200 && r2.json.duplicate === true, "2ª entrega do mesmo evento é ignorada (idempotente)");
  const { data: s1 } = await db.from("users").select("access_status").eq("id", studA.id).single();
  ok(s1.access_status === "BLOCKED", "Atraso além da carência → BLOCKED");
  await post(hook, ev(`evt_${run}_2`, "PAYMENT_CONFIRMED"), hdr);
  const { data: s2 } = await db.from("users").select("access_status").eq("id", studA.id).single();
  ok(s2.access_status === "ACTIVE", "PAYMENT_CONFIRMED → ACTIVE");

  console.log("\n— QR Code de uso único —");
  const tk = await post("/api/access/token", {}, { Authorization: `Bearer ${cs.token}` });
  ok(tk.status === 200 && !!tk.json.token, "Aluno ativo recebe QR");
  const gate = { "x-gate-token": `gate-${run}` }, val = `/api/access/validate/${A}`;
  ok((await post(val, { token: tk.json.token }, gate)).json.allowed === true, "1ª leitura do QR libera");
  ok((await post(val, { token: tk.json.token }, gate)).json.reason === "TOKEN_REUSED", "2ª leitura do mesmo QR é negada");
  ok((await post(val, { token: tk.json.token }, {})).status === 401, "Catraca sem token é rejeitada");
} catch (e) { console.error("ERRO:", e); fails++; }
finally {
  for (const t of created.tenants) for (const tb of ["access_logs", "workouts", "subscriptions", "plans", "webhook_events", "push_subscriptions"]) await db.from(tb).delete().eq("tenant_id", t);
  for (const id of created.auth) await db.auth.admin.deleteUser(id);
  for (const t of created.tenants) await db.from("tenants").delete().eq("id", t);
}
console.log(fails ? `\n${fails} verificação(ões) falharam.` : "\nTudo certo."); process.exit(fails ? 1 : 0);
