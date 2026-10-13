'use client';

import { useCallback, useState } from 'react';

/** Penanda "sedang memproses" untuk aksi server yang async. */
export function useBusy(): [boolean, (fn: () => Promise<void>) => void] {
  const [busy, setBusy] = useState(false);
  const start = useCallback((fn: () => Promise<void>) => {
    setBusy(true);
    fn().catch(() => {}).finally(() => setBusy(false));
  }, []);
  return [busy, start];
}
