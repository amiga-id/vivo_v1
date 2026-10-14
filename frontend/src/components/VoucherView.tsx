'use client';

import { useNavigate, useLocation } from 'react-router-dom';
import { downloadVoucher } from '@/lib/api';
import { rp } from '@/lib/format';
import type { DocSummary, VoucherData } from '@/lib/types';
import { useToast } from './Toast';
import { useBusy } from './useBusy';

export default function VoucherView({ list, v, base, canDownload }: { list: DocSummary[]; v: VoucherData; base: string; canDownload: boolean }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [pending, start] = useBusy();
  const ok = v.status === 'Disetujui';
  const download = () =>
    start(async () => {
      const r = await downloadVoucher(v.id);
      toast(r.msg, !r.ok);
      if (r.ok) setTimeout(() => window.print(), 250); // simpan sebagai PDF lewat dialog cetak
    });
  return (
    <>
      <div className="filters" style={{ marginBottom: 0 }}>
        <label className="m" htmlFor="vv">Dokumen</label>
        <select className="inline" id="vv" value={v.id} onChange={(e) => navigate(`${base}?id=${e.target.value}`)}>
          {list.map((x) => <option key={x.id} value={x.id}>{x.no} - {x.klien}</option>)}
        </select>
      </div>
      <div className="voucher">
        <div className="paper">
          {!ok && <div className="mark"><span>DRAF</span></div>}
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 'bold' }}>Voucher pengeluaran</h2>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '4px 12px', marginBottom: 20 }}>
            <div><strong>nomor</strong></div>
            <div>{v.nomorUrut} - [{new Date().toLocaleString('id-ID', { month: 'long' })}][{new Date().getFullYear()}]</div>
            
            <div><strong>nama perusahaan</strong></div>
            <div>{v.namaPT}</div>
            
            <div><strong>tanggal/periode</strong></div>
            <div>{new Date().toLocaleDateString('id-ID')}</div>
            
            <div><strong>nominal</strong></div>
            <div></div>
          </div>
          
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 24 }}>
            <thead>
              <tr style={{ borderTop: '2px solid #333', borderBottom: '1px solid #333' }}>
                <th style={{ padding: '8px 4px', textAlign: 'center', width: '40px' }}>no</th>
                <th style={{ padding: '8px 4px', textAlign: 'left', width: '100px' }}>tanggal</th>
                <th style={{ padding: '8px 4px', textAlign: 'left' }}>keterangan</th>
                <th style={{ padding: '8px 4px', textAlign: 'center', width: '60px' }}>jumlah</th>
                <th style={{ padding: '8px 4px', textAlign: 'right', width: '140px' }}>harga</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ padding: '8px 4px', textAlign: 'center' }}>1</td>
                <td style={{ padding: '8px 4px' }}>{new Date().toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' })}</td>
                <td style={{ padding: '8px 4px' }}>Pembayaran invoice {v.f.no} - {v.f.vendor}</td>
                <td style={{ padding: '8px 4px', textAlign: 'center' }}>1</td>
                <td style={{ padding: '8px 4px', textAlign: 'right' }}>{rp(v.f.total)}</td>
              </tr>
              <tr>
                <td style={{ padding: '8px 4px', textAlign: 'center' }}>2</td>
                <td style={{ padding: '8px 4px' }}></td>
                <td style={{ padding: '8px 4px' }}></td>
                <td style={{ padding: '8px 4px' }}></td>
                <td style={{ padding: '8px 4px' }}></td>
              </tr>
              <tr>
                <td style={{ padding: '8px 4px', textAlign: 'center' }}>...</td>
                <td style={{ padding: '8px 4px' }}></td>
                <td style={{ padding: '8px 4px' }}></td>
                <td style={{ padding: '8px 4px' }}></td>
                <td style={{ padding: '8px 4px' }}></td>
              </tr>
              <tr style={{ borderTop: '2px solid #333' }}>
                <td colSpan={3} style={{ padding: '8px 4px' }}></td>
                <td style={{ padding: '8px 4px', textAlign: 'center' }}><strong>total</strong></td>
                <td style={{ padding: '8px 4px', textAlign: 'right' }}><strong>{rp(v.f.total)}</strong></td>
              </tr>
            </tbody>
          </table>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 48 }}>
            <div style={{ textAlign: 'center', width: '48%' }}>
              <div style={{ marginBottom: 70, fontSize: 14 }}>diajukan oleh</div>
              <div style={{ borderBottom: '1px solid #333', paddingBottom: 4, marginBottom: 4 }}>
                {ok && <div style={{ minHeight: 40 }}></div>}
              </div>
              <div><strong>admin</strong></div>
            </div>
            
            <div style={{ textAlign: 'center', width: '48%' }}>
              <div style={{ marginBottom: 70, fontSize: 14 }}>disetujui oleh</div>
              <div style={{ borderBottom: '1px solid #333', paddingBottom: 4, marginBottom: 4 }}>
                {ok && <div style={{ minHeight: 40 }}></div>}
              </div>
              <div><strong>BOD</strong></div>
              <div style={{ fontSize: 11, color: '#666', marginTop: 6, fontStyle: 'italic' }}>
                side approval bisa ada dua pihak
              </div>
            </div>
          </div>
        </div>
        {canDownload
          ? <div className="actions" style={{ justifyContent: 'center', marginTop: 16 }}>
              <button className="btn primary" disabled={pending || !ok} onClick={download}>Unduh PDF</button>
            </div>
          : <p className="m" style={{ textAlign: 'center', margin: '12px 0 0' }}>Anda hanya bisa melihat pratinjau. Pengunduhan hanya untuk Intake Support pemilik dokumen.</p>}
      </div>
    </>
  );
}
