'use client';

import { useNavigate, useLocation } from 'react-router-dom';

export default function AuditFilter({ base, current, options }: { base: string; current: string; options: { id: string; label: string }[] }) {
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <div className="filters">
      <label className="m" htmlFor="au">Dokumen</label>
      <select className="inline" id="au" value={current} onChange={(e) => navigate(e.target.value === 'all' ? base : `${base}?doc=${e.target.value}`)}>
        <option value="all">Semua dokumen Anda</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    </div>
  );
}
