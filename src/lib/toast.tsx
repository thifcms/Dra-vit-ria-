import React, { useEffect, useState } from 'react';

type ToastKind = 'success' | 'error' | 'info';
type ToastMsg = { id: number; text: string; kind: ToastKind };

let listeners: ((t: ToastMsg) => void)[] = [];
let counter = 0;

/** Chame de qualquer componente: showToast('Salvo com sucesso!') ou showToast('Falha ao salvar.', 'error') */
export function showToast(text: string, kind: ToastKind = 'success') {
  const msg: ToastMsg = { id: ++counter, text, kind };
  listeners.forEach(fn => fn(msg));
}

/** Monte uma única vez, no topo do App.tsx */
export function ToastHost() {
  const [toasts, setToasts] = useState<ToastMsg[]>([]);

  useEffect(() => {
    const handler = (msg: ToastMsg) => {
      setToasts(prev => [...prev, msg]);
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== msg.id));
      }, 4000);
    };
    listeners.push(handler);
    return () => {
      listeners = listeners.filter(l => l !== handler);
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 max-w-sm">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`px-5 py-4 rounded-2xl shadow-lg text-sm font-medium text-white animate-[fadeIn_0.2s_ease-out] ${
            t.kind === 'error' ? 'bg-[#C27E7E]' : t.kind === 'info' ? 'bg-[#4A4644]' : 'bg-[#8BA888]'
          }`}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
