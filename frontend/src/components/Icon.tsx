import type { ReactNode } from 'react';

const PATHS: Record<string, ReactNode> = {
  queue: (<><rect x="3" y="3" width="7" height="9" rx="2" /><rect x="14" y="3" width="7" height="5" rx="2" /><rect x="14" y="12" width="7" height="9" rx="2" /><rect x="3" y="16" width="7" height="5" rx="2" /></>),
  upload: (<><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 16v3a2 2 0 002 2h12a2 2 0 002-2v-3" /></>),
  voucher: (<><path d="M4 5h16v5a2 2 0 000 4v5H4v-5a2 2 0 000-4z" /><path d="M14 5v14" strokeDasharray="2 3" /></>),
  audit: (<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>),
  users: (<><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0113 0" /><path d="M16 4.5a3.5 3.5 0 010 7M18 20a6.5 6.5 0 00-3-5.5" /></>),
  lock: (<><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 018 0v4" /></>),
  warn: (<><path d="M12 3l10 18H2z" /><path d="M12 10v5M12 18v.5" /></>),
  ok: <path d="M5 12l5 5 9-10" />,
  file: (<><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></>),
};

export default function Icon({ name, size }: { name: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: 'none' }}>
      {PATHS[name]}
    </svg>
  );
}
