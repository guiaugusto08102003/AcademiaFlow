export type WaCfg = { provider?: "zapi" | "evolution"; url?: string; instance?: string; token?: string; client_token?: string; webhook_secret?: string };
export type Inbound = { id: string; phone: string; text: string };

const to55 = (p: string) => { const d = p.replace(/\D/g, ""); return d.startsWith("55") ? d : "55" + d; };

/** Envia texto. Nunca lança; retorna false em qualquer falha. */
export async function sendWhatsApp(cfg: WaCfg | null | undefined, phone: string, text: string): Promise<boolean> {
  if (!cfg?.token || !cfg.instance) return false;
  const number = to55(phone);
  try {
    const r = cfg.provider === "evolution"
      ? await fetch(`${cfg.url}/message/sendText/${cfg.instance}`, { method: "POST", signal: AbortSignal.timeout(8000),
          headers: { "Content-Type": "application/json", apikey: cfg.token }, body: JSON.stringify({ number, text }) })
      : await fetch(`${cfg.url || "https://api.z-api.io"}/instances/${cfg.instance}/token/${cfg.token}/send-text`, { method: "POST", signal: AbortSignal.timeout(8000),
          headers: { "Content-Type": "application/json", ...(cfg.client_token ? { "Client-Token": cfg.client_token } : {}) }, body: JSON.stringify({ phone: number, message: text }) });
    return r.ok;
  } catch { return false; }
}

/** Normaliza o webhook de mensagem recebida (Z-API e Evolution v2). Ignora mensagens próprias, grupos e não-texto. */
export function parseInbound(b: any): Inbound | null {
  if (b?.data?.key) { // Evolution: messages.upsert
    const k = b.data.key, m = b.data.message ?? {};
    const text = m.conversation ?? m.extendedTextMessage?.text;
    if (k.fromMe || String(k.remoteJid).endsWith("@g.us") || !text) return null;
    return { id: k.id, phone: String(k.remoteJid).split("@")[0], text };
  }
  if (b?.phone && b?.text?.message !== undefined) { // Z-API: ao receber
    if (b.fromMe || b.isGroup) return null;
    return { id: b.messageId ?? `${b.phone}:${b.momment ?? Date.now()}`, phone: String(b.phone), text: String(b.text.message) };
  }
  return null;
}
