export type Exercise = { name: string; sets: number; reps: string; load: string; rest: string; notes: string };
export type Workout = { id: string; title: string; exercises_json: Exercise[]; updated_at: string };
export const emptyExercise = (): Exercise => ({ name: "", sets: 3, reps: "12", load: "", rest: "60", notes: "" });
