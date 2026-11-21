"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { supabaseBrowser } from "@/lib/supabase/client";

const ERR: Record<string, string> = {
  BLOCKED: "Seu acesso está bloqueado por mensalidade em atraso. Regularize em “Minha mensalidade”.",
  PAUSED: "Seu plano está pausado. Fale com a recepção para reativar.",
};

export default function Qr() {
  const sb = supabaseBrowser();
  const [img, setImg] = useState(""); const [left, setLeft] = useState(0); const [err, setErr] = useState("");
  const expAt = useRef(0); const busy = useRef(false);

  const refresh = useCallback(async () => {
    if (busy.current) return; busy.current = true;
    try {
      const { data } = await sb.auth.getSession();
      if (!data.session) return (location.href = "/login");
      const r = await fetch("/api/access/token", { method: "POST", headers: { Authorization: `Bearer ${data.session.access_token}` } });
      const j = await r.json();
      if (!r.ok) { setImg(""); return setErr(ERR[j.error] ?? "Não foi possível gerar o QR Code."); }
      setImg(await QRCode.toDataURL(j.token, { margin: 1, width: 320, errorCorrectionLevel: "M" }));
      expAt.current = Date.now() + j.expires_in * 1000; setErr("");
    } catch { setErr("Sem conexão. O QR Code precisa de internet; peça a liberação na recepção."); }
    finally { busy.current = false; }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(() => {
      const s = Math.max(0, Math.round((expAt.current - Date.now()) / 1000)); setLeft(s);
      if (s <= 15) refresh(); // renova antes de expirar
    }, 1000);
    return () => clearInterval(t);
  }, [refresh]);

  return (
    <main className="mx-auto max-w-md p-6 text-center">
      <a href="/" className="block text-left text-sm underline">Início</a>
      <h1 className="mt-2 text-2xl font-bold">Minha entrada</h1>
      {img && <><img src={img} alt="QR Code de entrada" className="mx-auto mt-6 w-72 rounded-lg bg-white p-2" />
        <p className="mt-3 text-sm text-forest-700">Aproxime do leitor. Este código muda a cada minuto ({left}s).</p></>}
      {err && <p role="alert" className="mt-6">{err}</p>}
      {err && <button onClick={refresh} className="mt-4 rounded-lg bg-forest-900 px-5 py-3 font-semibold text-lime-400">Tentar novamente</button>}
    </main>
  );
}
