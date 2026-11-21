"use client";
import { useEffect, useState } from "react";

type BIPEvent = Event & { prompt: () => Promise<void> };

export default function PwaRegister() {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone;
    if (standalone) return;
    const onBip = (e: Event) => { e.preventDefault(); setDeferred(e as BIPEvent); };
    window.addEventListener("beforeinstallprompt", onBip);
    if (/iphone|ipad|ipod/i.test(navigator.userAgent)) setIosHint(true);
    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, []);

  if (!deferred && !iosHint) return null;
  return (
    <div className="fixed inset-x-3 bottom-3 z-50 rounded-xl bg-forest-900 p-4 text-sm text-white shadow-lg">
      {deferred ? (
        <div className="flex items-center justify-between gap-3">
          <span>Instale o AcademiaFlow na tela inicial.</span>
          <button className="rounded-lg bg-lime-400 px-3 py-2 font-semibold text-forest-900"
            onClick={async () => { await deferred.prompt(); setDeferred(null); }}>Instalar</button>
        </div>
      ) : (
        <div className="flex justify-between gap-3">
          <span>No iPhone: toque em Compartilhar e depois em “Adicionar à Tela de Início”.</span>
          <button aria-label="Fechar" onClick={() => setIosHint(false)}>✕</button>
        </div>
      )}
    </div>
  );
}
