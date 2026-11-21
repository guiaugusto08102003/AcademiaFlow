export type StudentRow = { nome: string; telefone: string; plano: string; vencimento: string };

function splitLine(line: string, d: string) {
  const out: string[] = []; let cur = ""; let q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === d && !q) { out.push(cur.trim()); cur = ""; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/** Aceita "," ou ";" e cabeçalho nome,telefone,plano,vencimento (ordem livre). */
export function parseStudentsCsv(text: string): { rows: StudentRow[]; errors: string[] } {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim());
  const errors: string[] = [];
  if (lines.length < 2) return { rows: [], errors: ["Arquivo sem linhas de dados."] };
  const d = lines[0].includes(";") ? ";" : ",";
  const head = splitLine(lines[0], d).map((h) => h.toLowerCase());
  const idx = (k: string) => head.indexOf(k);
  const cols = { nome: idx("nome"), telefone: idx("telefone"), plano: idx("plano"), vencimento: idx("vencimento") };
  for (const [k, v] of Object.entries(cols)) if (v < 0) errors.push(`Coluna ausente: ${k}`);
  if (errors.length) return { rows: [], errors };
  const rows: StudentRow[] = [];
  lines.slice(1).forEach((l, i) => {
    const c = splitLine(l, d);
    const r = { nome: c[cols.nome], telefone: (c[cols.telefone] || "").replace(/\D/g, ""), plano: c[cols.plano], vencimento: normDate(c[cols.vencimento]) };
    if (!r.nome || r.telefone.length < 10) errors.push(`Linha ${i + 2}: nome ou telefone inválido`);
    else if (!r.vencimento) errors.push(`Linha ${i + 2}: vencimento inválido (use DD/MM/AAAA)`);
    else rows.push(r);
  });
  return { rows, errors };
}

export function normDate(s?: string): string {
  if (!s) return "";
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}
