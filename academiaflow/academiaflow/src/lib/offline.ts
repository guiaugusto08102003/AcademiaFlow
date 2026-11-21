// Mini-wrapper de IndexedDB (key-value). Usado para cache de treinos e progresso do checklist.
const DB = "academiaflow", STORE = "kv";

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
export async function kvGet<T>(key: string): Promise<T | undefined> {
  const db = await open();
  return new Promise((res, rej) => {
    const q = db.transaction(STORE).objectStore(STORE).get(key);
    q.onsuccess = () => res(q.result as T | undefined); q.onerror = () => rej(q.error);
  });
}
export async function kvSet(key: string, value: unknown): Promise<void> {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction(STORE, "readwrite"); t.objectStore(STORE).put(value, key);
    t.oncomplete = () => res(); t.onerror = () => rej(t.error);
  });
}
export async function kvDel(key: string): Promise<void> {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction(STORE, "readwrite"); t.objectStore(STORE).delete(key);
    t.oncomplete = () => res(); t.onerror = () => rej(t.error);
  });
}
