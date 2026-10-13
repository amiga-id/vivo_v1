'use client';

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

type Show = (msg: string, bad?: boolean) => void;
const Ctx = createContext<Show>(() => {});
export const useToast = () => useContext(Ctx);

export default function ToastProvider({ children }: { children: ReactNode }) {
  const [t, setT] = useState<{ msg: string; bad: boolean; on: boolean }>({ msg: '', bad: false, on: false });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback<Show>((msg, bad = false) => {
    setT({ msg, bad, on: true });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setT((x) => ({ ...x, on: false })), 3200);
  }, []);
  return (
    <Ctx.Provider value={show}>
      {children}
      <div className={`toast${t.bad ? ' bad' : ''}${t.on ? ' on' : ''}`} role="status" aria-live="polite">{t.msg}</div>
    </Ctx.Provider>
  );
}
