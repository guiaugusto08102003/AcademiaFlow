"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { kvGet, kvSet } from "@/lib/offline";
import { Workout } from "@/lib/types";

export default function Treino() {
  const sb = supabaseBrowser();
  const [uid, setUid] = useState(""); const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [active, setActive] = useState(0); const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [status, setStatus] = useState<"loading" | "online" | "offline">("loading");
  const [lock, setLock] = useState(false); const sentinel = useRef<WakeLockSentinel | null>(null);

  const w = workouts[active];
  const ckey = w ? `checks:${w.id}:${w.updated_at}` : ""; // ficha editada => progresso zera

  // 1) cache primeiro, 2) servidor quando houver rede (e a cada reconexão)
  const sync = useCallback(async (user: string) => {
    const cached = await kvGet<Workout[]>(`workouts:${user}`);
    if (cached) { setWorkouts(cached); setStatus("offline"); }
    if (!navigator.onLine) return;
    const { data, error } = await sb.from("workouts").select("id, title, exercises_json, updated_at").eq("student_id", user).order("updated_at", { ascending: false });
    if (error || !data) return;
    await kvSet(`workouts:${user}`, data); setWorkouts(data as Workout[]); setStatus("online");
  }, []);

  useEffect(() => {
    sb.auth.getSession().then(({ data }) => { // getSession lê do storage local: funciona offline
      if (!data.session) return (location.href = "/login");
      setUid(data.session.user.id); sync(data.session.user.id);
    });
  }, [sync]);
  useEffect(() => {
    if (!uid) return;
    const on = () => sync(uid), off = () => setStatus("offline");
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, [uid, sync]);
  useEffect(() => { if (ckey) kvGet<Record<string, boolean>>(ckey).then((c) => setChecks(c ?? {})); }, [ckey]);

  async function toggle(k: string) {
    const next = { ...checks, [k]: !checks[k] }; setChecks(next); await kvSet(ckey, next);
  }
  async function toggleLock() {
    if (lock) { await sentinel.current?.release(); sentinel.current = null; return setLock(false); }
    try { sentinel.current = await navigator.wakeLock.request("screen"); setLock(true); } catch { /* sem suporte ou bateria baixa */ }
  }
  useEffect(() => { // o navegador solta o lock ao ocultar a aba: reativa ao voltar
    const re = async () => { if (lock && document.visibilityState === "visible") try { sentinel.current = await navigator.wakeLock.request("screen"); } catch {} };
    document.addEventListener("visibilitychange", re);
    return () => { document.removeEventListener("visibilitychange", re); sentinel.current?.release(); };
  }, [lock]);

  const total = w ? w.exercises_json.reduce((a, e) => a + e.sets, 0) : 0;
  const done = Object.values(checks).filter(Boolean).length;
  const canLock = typeof navigator !== "undefined" && "wakeLock" in navigator;

  return (
    <main className="mx-auto max-w-md p-4 pb-20">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Meu treino</h1>
        <span className="text-xs text-forest-700">{status === "online" ? "Atualizado" : status === "offline" ? "Offline: versão salva" : ""}</span>
      </div>
      {status !== "loading" && workouts.length === 0 && <p className="mt-6">Seu professor ainda não publicou uma ficha. Quando publicar, ela aparece aqui.</p>}

      {workouts.length > 1 && <div className="mt-3 flex gap-2 overflow-x-auto">
        {workouts.map((x, i) => <button key={x.id} onClick={() => setActive(i)} className={`whitespace-nowrap rounded-full px-4 py-2 text-sm ${i === active ? "bg-forest-900 text-lime-400" : "bg-white"}`}>{x.title}</button>)}
      </div>}

      {w && <>
        <h2 className="mt-4 text-lg font-semibold">{w.title}</h2>
        <p className="text-sm text-forest-700">{done} de {total} séries feitas</p>
        <div className="mt-1 h-1.5 rounded bg-forest-900/10"><div className="h-1.5 rounded bg-forest-900" style={{ width: total ? `${(done / total) * 100}%` : 0 }} /></div>
        <ul className="mt-4 space-y-3">
          {w.exercises_json.map((ex, i) => (
            <li key={i} className="rounded-lg border border-forest-900/15 bg-white p-4">
              <p className="text-lg font-semibold">{ex.name}</p>
              <p className="text-sm text-forest-700">{ex.reps} reps{ex.load && ` · ${ex.load}`}{ex.rest && ` · descanso ${ex.rest}s`}</p>
              {ex.notes && <p className="mt-1 text-sm">{ex.notes}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                {Array.from({ length: ex.sets }, (_, s) => { const k = `${i}-${s}`; return (
                  <button key={k} aria-pressed={!!checks[k]} aria-label={`Série ${s + 1} de ${ex.name}`} onClick={() => toggle(k)}
                    className={`h-12 w-12 rounded-full border-2 font-semibold ${checks[k] ? "border-forest-900 bg-forest-900 text-lime-400" : "border-forest-700/40"}`}>{s + 1}</button>); })}
              </div>
            </li>))}
        </ul>
        <button className="mt-3 text-sm underline" onClick={async () => { setChecks({}); await kvSet(ckey, {}); }}>Zerar séries</button>
      </>}

      {canLock && <button onClick={toggleLock} className={`fixed inset-x-4 bottom-4 rounded-lg py-3 font-semibold ${lock ? "bg-lime-400 text-forest-900" : "bg-forest-900 text-lime-400"}`}>
        {lock ? "Tela ligada: toque para desativar" : "Manter tela ligada no treino"}</button>}
    </main>
  );
}
