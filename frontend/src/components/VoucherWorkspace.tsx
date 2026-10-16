import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  generateVoucher,
  getVoucherSigners,
  getVouchers,
  uploadVoucherSignature,
} from '@/lib/document-api';
import type {
  VoucherListItem,
  VoucherSigners,
} from '@/lib/document-api';

type WorkspaceRole = 'finance' | 'support';

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value);
}

export default function VoucherWorkspace({ role }: { role: WorkspaceRole }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [vouchers, setVouchers] = useState<VoucherListItem[]>([]);
  const [signers, setSigners] = useState<VoucherSigners | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [signatureFile, setSignatureFile] = useState<File | null>(null);
  const [savingSignature, setSavingSignature] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [signatureError, setSignatureError] = useState('');
  const [signatureNotice, setSignatureNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [items, availableSigners] = await Promise.all([
        getVouchers(),
        role === 'finance' ? getVoucherSigners() : Promise.resolve(null),
      ]);
      setVouchers(items);
      setSigners(availableSigners);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  }, [role]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = useMemo(() => {
    const requestedId = searchParams.get('id');
    return vouchers.find(item => item.submission_id === requestedId) ?? vouchers[0] ?? null;
  }, [searchParams, vouchers]);

  function chooseVoucher(id: string) {
    setSearchParams({ id });
  }

  async function saveSignature(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!signatureFile) {
      setSignatureError('Pilih file tanda tangan PNG atau JPEG.');
      return;
    }

    setSavingSignature(true);
    setSignatureError('');
    setSignatureNotice('');
    try {
      const signer = await uploadVoucherSignature(signatureFile);
      setSigners({ finance: [signer] });
      setSignatureFile(null);
      setSignatureNotice('Tanda tangan Finance berhasil disimpan dan siap digunakan pada voucher.');
      form.reset();
    } catch (reason) {
      setSignatureError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSavingSignature(false);
    }
  }

  async function createVoucher() {
    if (!selected) return;
    setGenerating(true);
    setError('');
    setNotice('');
    try {
      const result = await generateVoucher(selected.submission_id);
      setVouchers(current => current.map(item => item.submission_id === selected.submission_id
        ? {
          ...item,
          voucher_number: result.voucher_number,
          voucher_url: result.voucher_url,
          signature_ids: {
            finance: selected.signature_ids.finance ?? signers?.finance[0]?.id ?? null,
          },
        }
        : item));
      setNotice('Voucher berhasil dibuat dengan tanda tangan Finance.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setGenerating(false);
    }
  }

  if (loading) return <div className="loading">Memuat voucher...</div>;
  if (error && vouchers.length === 0) {
    return (
      <section className="card">
        <p className="auth-err" role="alert">{error}</p>
        <button className="btn sm" type="button" onClick={() => void load()}>Coba lagi</button>
      </section>
    );
  }

  return (
    <div className="voucher-workspace">
      {error && <p className="auth-err" role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {role === 'finance' && (
        <section className="card">
          <h2>Tanda tangan Finance</h2>
          <p className="sub">
            Tanda tangan disimpan di S3 dan otomatis digunakan pada voucher yang Anda setujui.
          </p>
          {signers?.finance.length
            ? <p role="status">Tanda tangan Finance sudah tersimpan.</p>
            : <p>Tanda tangan Finance belum didaftarkan.</p>}
          <form className="form" onSubmit={saveSignature}>
            <label>
              File tanda tangan <small className="m">(PNG/JPEG, maksimal 5 MiB)</small>
              <input
                type="file"
                accept="image/png,image/jpeg"
                onChange={event => {
                  setSignatureFile(event.target.files?.[0] ?? null);
                  setSignatureError('');
                }}
              />
            </label>
            <div className="actions" style={{ alignItems: 'end' }}>
              <button
                className="btn primary"
                type="submit"
                disabled={savingSignature || !signatureFile}
              >
                {savingSignature ? 'Menyimpan...' : 'Simpan tanda tangan'}
              </button>
            </div>
          </form>
          {signatureError && <p className="auth-err" role="alert">{signatureError}</p>}
          {signatureNotice && <p role="status">{signatureNotice}</p>}
        </section>
      )}
      {vouchers.length === 0 ? (
        <section className="card">
          <h2>Voucher terbit</h2>
          <p>Belum ada voucher yang disetujui.</p>
        </section>
      ) : (
        <div className="voucher-workspace-grid">
          <section className="card">
            <h2>Voucher terbit</h2>
            <div className="voucher-list">
              {vouchers.map(item => (
                <button
                  className={`voucher-list-item${selected?.submission_id === item.submission_id ? ' active' : ''}`}
                  key={item.submission_id}
                  type="button"
                  onClick={() => chooseVoucher(item.submission_id)}
                >
                  <strong>{item.voucher_number}</strong>
                  <span>{item.request_number} · {item.client_name}</span>
                  <span>{formatCurrency(item.grand_total)}</span>
                </button>
              ))}
            </div>
          </section>
          {selected && (
            <section className="card voucher-detail">
              <h2>{selected.voucher_number}</h2>
              <p>{selected.client_name} · {selected.kind} · {selected.receive_date}</p>
              <p>Total: <strong>{formatCurrency(selected.grand_total)}</strong></p>

              {role === 'finance' && signers && (
                <>
                  <h3>Tanda tangan</h3>
                  <p className="sub">
                    Tanda tangan Finance terisi otomatis dari tanda tangan yang
                    terdaftar. Ruang tanda tangan BOD disediakan untuk ditandatangani
                    langsung oleh BOD.
                  </p>
                  <button
                    className="btn primary"
                    type="button"
                    disabled={generating || signers.finance.length === 0}
                    onClick={() => void createVoucher()}
                  >
                    {generating ? 'Membuat voucher...' : 'Buat / perbarui voucher'}
                  </button>
                  {signers.finance.length === 0 && (
                    <p className="auth-err" role="alert">
                      Tanda tangan Finance belum tersedia di data sistem. Voucher belum dapat dibuat.
                    </p>
                  )}
                </>
              )}
              {selected.voucher_url ? (
                <div className="voucher-actions">
                  <a className="btn sm" href={selected.voucher_url} target="_blank" rel="noreferrer">
                    Buka / unduh PDF
                  </a>
                  <iframe
                    className="voucher-preview"
                    title={`Pratinjau ${selected.voucher_number}`}
                    src={selected.voucher_url}
                  />
                </div>
              ) : (
                <p>PDF voucher belum dibuat.</p>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
