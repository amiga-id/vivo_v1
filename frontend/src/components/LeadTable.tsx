import { reassignTask } from '@/lib/api';
import type { WorkloadRow } from '@/lib/types';
import { Badge, Due } from './ui';
import { useToast } from './Toast';
import { useBusy } from './useBusy';

export default function LeadTable({ rows, finance }: { rows: WorkloadRow[]; finance: { id: string; name: string }[] }) {
  const toast = useToast();
  const [pending, start] = useBusy();
  const open = (d: WorkloadRow) => ['Dalam Review', 'Perlu Tindakan', 'Diproses'].includes(d.status);
  return (
    <>
      <div className="kpis">
        {finance.map((f) => <div className="kpi" key={f.id}><b>{rows.filter((d) => d.reviewer === f.id && open(d)).length}</b><span>Tugas terbuka: {f.name}</span></div>)}
        <div className="kpi warn"><b>{rows.filter((d) => d.conflict).length}</b><span>Konflik penugasan</span></div>
      </div>
      <section className="card">
        <h2>Beban kerja tim</h2>
        <p className="sub">Layar ini hanya memuat status dan penugasan. Nilai transaksi dan isi dokumen tidak dikirim ke peran Anda.</p>
        <div className="tblw">
          <table className="tbl">
            <thead><tr><th>Dokumen</th><th>Status</th><th>Tenggat</th><th>Penugasan</th><th>Reviewer</th></tr></thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id}>
                  <td><b>{d.no}</b><div className="m">{d.klien}</div></td>
                  <td><Badge status={d.status} /></td>
                  <td><Due deadline={d.deadline} status={d.status} /></td>
                  <td>{d.conflict ? <span className="badge s-Konflik">Konflik penugasan</span> : <span className="m">Aman</span>}</td>
                  <td>
                    {open(d) ? (
                      <select className="inline" value={d.reviewer} disabled={pending} aria-label={`Alihkan ${d.no}`}
                        onChange={(e) => start(async () => { const r = await reassignTask(d.id, e.target.value); toast(r.msg, !r.ok); })}>
                        {finance.map((f) => <option key={f.id} value={f.id} disabled={f.id === d.uploader}>{f.name}{f.id === d.uploader ? ' (pengunggah)' : ''}</option>)}
                      </select>
                    ) : <span className="m">Selesai</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
