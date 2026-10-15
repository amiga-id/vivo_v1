import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  decideSubmission,
  getSubmission,
  updateSubmissionInvoices,
} from '@/lib/document-api';
import type { ExtractedInvoice, Submission } from '@/lib/document-api';
import { useSession } from '@/lib/session';
import { rp } from '@/lib/format';
import { useToast } from '@/components/Toast';
import { Badge } from '@/components/ui';

type Decision = 'approve' | 'return' | 'reject';
type EditableInvoice = Omit<ExtractedInvoice, 'dpp' | 'ppn' | 'total'> & {
  dpp: string;
  ppn: string;
  total: string;
};
type EditableInvoiceField =
  | 'no'
  | 'tgl'
  | 'vendor'
  | 'npwp'
  | 'dpp'
  | 'ppn'
  | 'total'
  | 'rek';

function toEditableInvoices(invoices: ExtractedInvoice[]): EditableInvoice[] {
  return invoices.map(invoice => ({
    ...invoice,
    dpp: String(invoice.dpp),
    ppn: String(invoice.ppn),
    total: String(invoice.total),
  }));
}

function toSavedInvoices(invoices: EditableInvoice[]): ExtractedInvoice[] {
  return invoices.map(invoice => ({
    ...invoice,
    dpp: Number(invoice.dpp) || 0,
    ppn: Number(invoice.ppn) || 0,
    total: Number(invoice.total) || 0,
  }));
}

export default function FinanceReview() {
  const { id } = useParams<{ id: string }>();
  const { user, loading: sessionLoading } = useSession();
  const toast = useToast();
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [savingInvoices, setSavingInvoices] = useState(false);
  const [error, setError] = useState('');
  const [reason, setReason] = useState('');
  const [invoiceDrafts, setInvoiceDrafts] = useState<EditableInvoice[]>([]);
  const [selectedFileIndex, setSelectedFileIndex] = useState(0);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const result = await getSubmission(id);
      setSubmission(result);
      setInvoiceDrafts(toEditableInvoices(result.invoices));
      setSelectedFileIndex(0);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : String(issue));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (user && id) void load();
  }, [user, id, load]);

  const decide = async (decision: Decision) => {
    if (!submission) return;
    if (decision !== 'approve' && !reason.trim()) {
      toast('Alasan wajib diisi untuk mengembalikan atau menolak pengajuan.', true);
      return;
    }
    setPending(true);
    try {
      const updated = await decideSubmission(submission.id, decision, reason.trim());
      setSubmission(updated);
      toast(
        decision === 'approve' ? 'Pengajuan disetujui.' :
          decision === 'return' ? 'Pengajuan dikembalikan ke Intake Support.' :
            'Pengajuan ditolak.',
        false,
      );
    } catch (issue) {
      toast(issue instanceof Error ? issue.message : String(issue), true);
    } finally {
      setPending(false);
    }
  };

  const saveInvoices = async () => {
    if (!submission) return;
    setSavingInvoices(true);
    try {
      const updated = await updateSubmissionInvoices(
        submission.id,
        toSavedInvoices(invoiceDrafts),
      );
      setSubmission(updated);
      setInvoiceDrafts(toEditableInvoices(updated.invoices));
      toast('Hasil ekstraksi berhasil disimpan.', false);
    } catch (issue) {
      toast(issue instanceof Error ? issue.message : String(issue), true);
    } finally {
      setSavingInvoices(false);
    }
  };

  const updateInvoice = (
    index: number,
    field: EditableInvoiceField,
    value: string,
  ) => {
    setInvoiceDrafts(current => current.map((invoice, invoiceIndex) =>
      invoiceIndex === index ? { ...invoice, [field]: value } : invoice,
    ));
  };

  if (sessionLoading || !user || loading) return <div className="loading">Loading...</div>;
  if (error || !submission) {
    return (
      <section className="card">
        <h2>Pengajuan tidak dapat dimuat</h2>
        <div className="auth-err" role="alert">{error || 'Pengajuan tidak ditemukan.'}</div>
        <button className="btn sm" onClick={() => void load()}>Coba lagi</button>
      </section>
    );
  }

  const canDecide = submission.status === 'Dalam Review';
  return (
    <>
      <section className="card">
        <div className="pane-h">
          <div>
            <h2>{submission.request_number}</h2>
            <p className="sub">
              {submission.client_name} · {submission.kind}
              {submission.channel ? ` · ${submission.channel}` : ''}
            </p>
          </div>
          <Badge status={submission.status} />
        </div>
        <div className="form">
          <div><span className="m">Tanggal diterima</span><div>{submission.receive_date}</div></div>
          <div><span className="m">Tenggat review</span><div>{submission.due_date}</div></div>
          <div><span className="m">Penyetuju</span><div>{submission.approvers} pihak</div></div>
          <div><span className="m">Jumlah PDF</span><div>{submission.files.length}</div></div>
          <div><span className="m">Jumlah invoice</span><div>{submission.invoice_count}</div></div>
          <div><span className="m">Total invoice</span><div>{rp(submission.grand_total)}</div></div>
          {submission.note && (
            <div className="full"><span className="m">Catatan Support</span><div>{submission.note}</div></div>
          )}
          {submission.decision_reason && (
            <div className="full">
              <span className="m">Alasan keputusan sebelumnya</span>
              <div>{submission.decision_reason}</div>
            </div>
          )}
        </div>
      </section>

      <section className="card">
        <h2>Preview dokumen dan hasil ekstraksi</h2>
        <div className="finance-review-split">
          <div className="finance-review-preview">
            <div className="filters" aria-label="Pilih dokumen PDF">
              {submission.files.map((file, index) => (
                <button
                  className="chip"
                  key={`${file.s3_key}-${index}`}
                  type="button"
                  aria-pressed={selectedFileIndex === index}
                  onClick={() => setSelectedFileIndex(index)}
                >
                  {file.file_name}
                </button>
              ))}
            </div>
            {submission.files[selectedFileIndex] && (
              <>
                <p className="sub">
                  {submission.files[selectedFileIndex].file_name} ·{' '}
                  {submission.files[selectedFileIndex].page_count} halaman
                </p>
                <iframe
                  className="pdfframe finance-review-pdf"
                  src={submission.files[selectedFileIndex].document_url}
                  title={`Preview ${submission.files[selectedFileIndex].file_name}`}
                />
                <a
                  href={submission.files[selectedFileIndex].document_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Buka PDF di tab baru
                </a>
              </>
            )}
          </div>
          <div className="finance-review-extraction">
            <h3>Hasil ekstraksi invoice</h3>
            <p className="sub">Periksa hasil AI, edit bila diperlukan, lalu simpan.</p>
            {invoiceDrafts.length === 0 ? (
              <div className="empty">Tidak ada hasil invoice untuk diedit.</div>
            ) : invoiceDrafts.map((invoice, index) => (
              <fieldset className="review-invoice" key={`${invoice.no}-${index}`}>
                <legend>Invoice {index + 1}</legend>
                <div className="review-invoice-fields">
                  <label>
                    No. invoice
                    <input
                      value={invoice.no}
                      disabled={!canDecide || savingInvoices || pending}
                      onChange={event => updateInvoice(index, 'no', event.target.value)}
                    />
                  </label>
                  <label>
                    Tanggal
                    <input
                      value={invoice.tgl}
                      disabled={!canDecide || savingInvoices || pending}
                      onChange={event => updateInvoice(index, 'tgl', event.target.value)}
                    />
                  </label>
                  <label>
                    Vendor
                    <input
                      value={invoice.vendor}
                      disabled={!canDecide || savingInvoices || pending}
                      onChange={event => updateInvoice(index, 'vendor', event.target.value)}
                    />
                  </label>
                  <label>
                    NPWP
                    <input
                      value={invoice.npwp}
                      disabled={!canDecide || savingInvoices || pending}
                      onChange={event => updateInvoice(index, 'npwp', event.target.value)}
                    />
                  </label>
                  <label>
                    DPP
                    <input
                      type="number"
                      step="0.01"
                      value={invoice.dpp}
                      disabled={!canDecide || savingInvoices || pending}
                      onChange={event => updateInvoice(index, 'dpp', event.target.value)}
                    />
                  </label>
                  <label>
                    PPN
                    <input
                      type="number"
                      step="0.01"
                      value={invoice.ppn}
                      disabled={!canDecide || savingInvoices || pending}
                      onChange={event => updateInvoice(index, 'ppn', event.target.value)}
                    />
                  </label>
                  <label>
                    Total
                    <input
                      type="number"
                      step="0.01"
                      value={invoice.total}
                      disabled={!canDecide || savingInvoices || pending}
                      onChange={event => updateInvoice(index, 'total', event.target.value)}
                    />
                  </label>
                  <label>
                    Rekening
                    <input
                      value={invoice.rek}
                      disabled={!canDecide || savingInvoices || pending}
                      onChange={event => updateInvoice(index, 'rek', event.target.value)}
                    />
                  </label>
                </div>
              </fieldset>
            ))}
            {canDecide && (
              <button
                className="btn primary"
                type="button"
                disabled={savingInvoices || pending || invoiceDrafts.length === 0}
                onClick={() => void saveInvoices()}
              >
                {savingInvoices ? 'Menyimpan...' : 'Simpan hasil ekstraksi'}
              </button>
            )}
          </div>
        </div>
      </section>

      {canDecide && (
        <section className="card">
          <h2>Keputusan reviewer</h2>
          <label>
            Alasan atau catatan
            <textarea
              rows={3}
              maxLength={2000}
              value={reason}
              onChange={event => setReason(event.target.value)}
              placeholder="Wajib untuk pengembalian atau penolakan"
            />
          </label>
          <div className="actions" style={{ marginTop: 16 }}>
            <button className="btn primary" disabled={pending || savingInvoices} onClick={() => void decide('approve')}>
              {pending ? 'Menyimpan...' : 'Setujui'}
            </button>
            <button className="btn" disabled={pending || savingInvoices} onClick={() => void decide('return')}>
              Kembalikan ke Support
            </button>
            <button className="btn pink" disabled={pending || savingInvoices} onClick={() => void decide('reject')}>
              Tolak
            </button>
            <Link className="btn" to="/finance">Kembali ke antrean</Link>
          </div>
        </section>
      )}
      {!canDecide && (
        <section className="card">
          <p>Pengajuan ini telah diputuskan.</p>
          {submission.decision_reason && (
            <p className="sub">Alasan keputusan: {submission.decision_reason}</p>
          )}
          <Link className="btn" to="/finance">Kembali ke antrean</Link>
        </section>
      )}
    </>
  );
}
