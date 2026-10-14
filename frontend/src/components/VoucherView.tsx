import { useNavigate } from 'react-router-dom';
import { rp } from '@/lib/format';
import type { DocSummary, User, VoucherData } from '@/lib/types';
import * as api from '@/lib/api';
import { useToast } from './Toast';
import { useBusy } from './useBusy';

export default function VoucherView({
  user, list, v, base,
}: {
  user: User;
  list: DocSummary[];
  v: VoucherData;
  base: string;
}) {
  const navigate      = useNavigate();
  const toast         = useToast();
  const [pending, start] = useBusy();
  const canDownload   = user.role === 'pic';
  const approved      = v.status === 'Disetujui';
  const money         = (n: number) => n < 0 ? `− ${rp(-n)}` : rp(n);

  const meta: [string, string][] = [
    ['nomor',           v.number ?? 'Belum diterbitkan'],
    ['nama',            v.nama],
    ['perusahaan',      v.perusahaan],
    ['tanggal/periode', v.periode],
    ['rincian pajak',   v.taxText],
    ['nominal akhir',   rp(v.nominal)],
  ];

  return (
    <>
      <div className="filters" style={{ marginBottom: 0 }}>
        <label className="m" htmlFor="vv">Dokumen</label>
        <select className="inline" id="vv" value={v.id}
          onChange={e => navigate(`${base}?id=${e.target.value}`)}>
          {list.map(x => (
            <option key={x.id} value={x.id}>
              {x.voucherNo ? `${x.voucherNo} – ` : ''}{x.no} – {x.klien}
            </option>
          ))}
        </select>
      </div>

      <div className="voucher vwide">
        <div className="paper vpaper">
          {!approved && <div className="mark"><span>DRAF</span></div>}

          {/* ── vs wrapper ── */}
          <div className="vs">
            <div className="vs-title">Voucher pengeluaran</div>

            {meta.map(([k, val]) => (
              <div className="vs-meta" key={k}>
                <div className="vs-l">{k}</div>
                <div className="vs-v">{val}</div>
              </div>
            ))}

            {/* Line items + tax rows */}
            <table className="vs-table">
              <colgroup>
                <col style={{ width: '6%' }} />
                <col style={{ width: '17%' }} />
                <col style={{ width: '33%' }} />
                <col style={{ width: '16%' }} />
                <col style={{ width: '28%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th>no</th><th>tanggal</th>
                  <th>keterangan</th><th>jumlah</th><th>harga</th>
                </tr>
              </thead>
              <tbody>
                {v.rows.map((r, i) => (
                  <tr key={i} className={r.tax ? 'vs-tax' : r.sub ? 'vs-sub' : ''}>
                    <td className="c">{r.no}</td>
                    <td className="c">{r.tgl}</td>
                    <td>{r.ket}</td>
                    <td className="c">{r.jumlah}</td>
                    <td className="r">{money(r.harga)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                {v.add > 0 && (
                  <tr className="vs-tax">
                    <td colSpan={4} className="c">total pajak ditambahkan</td>
                    <td className="r">+ {rp(v.add)}</td>
                  </tr>
                )}
                {v.withhold > 0 && (
                  <tr className="vs-tax">
                    <td colSpan={4} className="c">total pajak dipotong</td>
                    <td className="r">− {rp(v.withhold)}</td>
                  </tr>
                )}
                <tr className="vs-total">
                  <td colSpan={4} className="c">total yang dibayarkan</td>
                  <td className="r">{rp(v.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Signature area */}
          <div className="vs-sign">
            <div>
              <div className="vs-box"><span>diajukan oleh</span></div>
              <div className="vs-role">admin</div>
              <div className="vs-name">{v.submitter}</div>
            </div>
            <div className={`vs-approve a${v.approvers}`}>
              {Array.from({ length: v.approvers }).map((_, i) => (
                <div key={i}>
                  <div className="vs-box"><span>disetujui oleh</span></div>
                  <div className="vs-role">BOD</div>
                  {approved && <div className="vs-name">Diperiksa Finance: {v.reviewer}</div>}
                </div>
              ))}
            </div>
          </div>

          <p className="vs-note">
            Voucher ini adalah dokumen pendukung. Persetujuan pembayaran dilakukan oleh pihak yang
            bertanda tangan di luar aplikasi AMIGA.
          </p>
        </div>

        {canDownload
          ? (
            <div className="actions" style={{ justifyContent: 'center', marginTop: 16 }}>
              <button className="btn primary" disabled={pending || !approved}
                onClick={() => start(async () => {
                  const r = api.downloadVoucher(user, v.id);
                  toast(r.msg, !r.ok);
                  if (r.ok) setTimeout(() => window.print(), 250);
                })}>
                Unduh PDF
              </button>
            </div>
          )
          : (
            <p className="m" style={{ textAlign: 'center', margin: '12px 0 0' }}>
              Anda hanya bisa melihat voucher. Pengunduhan hanya untuk PIC Klien pemilik dokumen.
            </p>
          )}
      </div>
    </>
  );
}
