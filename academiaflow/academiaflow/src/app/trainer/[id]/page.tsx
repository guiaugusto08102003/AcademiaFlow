"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Exercise, Workout, emptyExercise } from "@/lib/types";

export default function StudentWorkouts() {
  const sb = supabaseBrowser(); const { id } = useParams<{ id: string }>();
  const [student, setStudent] = useState<{ name: string; health_notes: string | null } | null>(null);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [edit, setEdit] = useState<{ id?: string; title: string; exercises: Exercise[] } | null>(null);
  const [notes, setNotes] = useState(""); const [msg, setMsg] = useState("");

  async function load() {
    const { data: st } = await sb.from("users").select("name, health_notes").eq("id", id).single();
    setStudent(st); setNotes(st?.health_notes ?? "");
    const { data } = await sb.from("workouts").select("id, title, exercises_json, updated_at").eq("student_id", id).order("updated_at", { ascending: false });
    setWorkouts((data as Workout[]) ?? []);
  }
  useEffect(() => { load(); }, [id]);

  async function save() {
    if (!edit) return;
    const exercises = edit.exercises.filter((e) => e.name.trim());
    if (!edit.title.trim() || !exercises.length) return setMsg("Informe o título e ao menos um exercício.");
    const { data: s } = await sb.auth.getSession();
    const row = { title: edit.title.trim(), exercises_json: exercises };
    const { error } = edit.id
      ? await sb.from("workouts").update(row).eq("id", edit.id)
      : await sb.from("workouts").insert({ ...row, student_id: id, trainer_id: s.session!.user.id, tenant_id: (await sb.from("users").select("tenant_id").eq("id", id).single()).data!.tenant_id });
    if (error) return setMsg("Não foi possível salvar a ficha.");
    setEdit(null); setMsg(""); load();
  }
  async function remove(wid: string) {
    if (!confirm("Excluir esta ficha?")) return;
    await sb.from("workouts").delete().eq("id", wid); load();
  }
  async function saveNotes() {
    const { error } = await sb.from("users").update({ health_notes: notes || null }).eq("id", id);
    setMsg(error ? "Apenas o dono pode editar restrições de saúde." : "Restrições salvas.");
  }
  const upd = (i: number, k: keyof Exercise, v: string | number) =>
    setEdit({ ...edit!, exercises: edit!.exercises.map((e, j) => (j === i ? { ...e, [k]: v } : e)) });

  const inp = "w-full rounded-lg border border-forest-700/30 bg-white px-3 py-2";
  if (!student) return <main className="p-6">Carregando…</main>;
  return (
    <main className="mx-auto max-w-md p-6 pb-24">
      <a href="/trainer" className="text-sm underline">Alunos</a>
      <h1 className="mt-2 text-2xl font-bold">{student.name}</h1>

      <section className="mt-4 rounded-lg border border-amber-400 bg-amber-100 p-3">
        <label className="font-semibold" htmlFor="hn">Restrições de saúde</label>
        <textarea id="hn" className={`${inp} mt-1`} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Nenhuma restrição registrada" />
        <button className="mt-2 text-sm underline" onClick={saveNotes}>Salvar restrições</button>
      </section>

      {!edit && <>
        <button className="mt-5 w-full rounded-lg bg-forest-900 py-3 font-semibold text-lime-400" onClick={() => setEdit({ title: "", exercises: [emptyExercise()] })}>Nova ficha</button>
        <ul className="mt-4 space-y-2">
          {workouts.map((w) => (
            <li key={w.id} className="flex items-center justify-between rounded-lg border border-forest-900/15 bg-white p-3">
              <div><p className="font-semibold">{w.title}</p><p className="text-sm text-forest-700">{w.exercises_json.length} exercícios</p></div>
              <div className="flex gap-4 text-sm underline">
                <button onClick={() => setEdit({ id: w.id, title: w.title, exercises: w.exercises_json })}>Editar</button>
                <button onClick={() => remove(w.id)}>Excluir</button>
              </div>
            </li>))}
        </ul>
        {workouts.length === 0 && <p className="mt-4 text-forest-700">Este aluno ainda não tem ficha.</p>}
      </>}

      {edit && <section className="mt-5 space-y-3">
        <input className={inp} placeholder="Título (ex.: Treino A – Peito e tríceps)" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} />
        {edit.exercises.map((ex, i) => (
          <div key={i} className="space-y-2 rounded-lg border border-forest-700/20 bg-white p-3">
            <input className={inp} placeholder="Exercício" value={ex.name} onChange={(e) => upd(i, "name", e.target.value)} />
            <div className="grid grid-cols-4 gap-2">
              <input className={inp} inputMode="numeric" aria-label="Séries" placeholder="Séries" value={ex.sets} onChange={(e) => upd(i, "sets", Number(e.target.value) || 0)} />
              <input className={inp} aria-label="Repetições" placeholder="Reps" value={ex.reps} onChange={(e) => upd(i, "reps", e.target.value)} />
              <input className={inp} aria-label="Carga" placeholder="Carga" value={ex.load} onChange={(e) => upd(i, "load", e.target.value)} />
              <input className={inp} aria-label="Descanso (s)" placeholder="Desc. s" value={ex.rest} onChange={(e) => upd(i, "rest", e.target.value)} />
            </div>
            <input className={inp} placeholder="Observações" value={ex.notes} onChange={(e) => upd(i, "notes", e.target.value)} />
            <button className="text-sm underline" onClick={() => setEdit({ ...edit, exercises: edit.exercises.filter((_, j) => j !== i) })}>Remover exercício</button>
          </div>))}
        <button className="underline" onClick={() => setEdit({ ...edit, exercises: [...edit.exercises, emptyExercise()] })}>Adicionar exercício</button>
        <div className="fixed inset-x-0 bottom-0 flex justify-between bg-paper p-4">
          <button className="underline" onClick={() => { setEdit(null); setMsg(""); }}>Cancelar</button>
          <button className="rounded-lg bg-forest-900 px-5 py-3 font-semibold text-lime-400" onClick={save}>Salvar ficha</button>
        </div>
      </section>}
      {msg && <p role="status" className="mt-3 text-sm">{msg}</p>}
    </main>
  );
}
