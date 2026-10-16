import { useEffect, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { JENIS, TAX_PRESETS } from '@/lib/constants';
import {
  createSubmission,
  getClients,
  getRevisionHistory,
  getSubmission,
  retryExtraction,
  uploadDocument,
} from '@/lib/document-api';
import type {
  ClientOption,
  RevisionHistoryEntry,
  Submission,
  UploadedFileData,
} from '@/lib/document-api';
import type { TaxLine } from '@/lib/types';
import { rp } from '@/lib/format';
import { useToast } from './Toast';

const MAX_UPLOAD_BYTES = 4_500_000;

type FileStatus = 'waiting' | 'uploading' | 'extracting' | 'done' | 'failed' | 'rejected';
interface UploadRow {
  key: string;
  file: File;
  status: FileStatus;
  progress: number;
  data?: UploadedFileData;
  error?: string;
}

const statusLabel: Record<FileStatus, string> = {
  waiting: 'Menunggu',
  uploading: 'Mengunggah',
  extracting: 'Mengekstrak data dengan AI…',
  done: 'Selesai',
  failed: 'Gagal',
  rejected: 'Ditolak',
};

function fileProblem(file: File): string | null {
  if (!/\.pdf$/i.test(file.name) || file.type !== 'application/pdf') {
    return 'File harus berekstensi .pdf dan bertipe application/pdf.';
  }
  if (file.size > MAX_UPLOAD_BYTES) return 'Ukuran file melebihi batas 4.500.000 byte.';
  return null;
}

function mapUploadStatus(data: UploadedFileData): FileStatus {
  return data.extraction_status === 'done' && data.is_invoice && data.invoice_count > 0
    ? 'done'
    : 'failed';
}

function RevisionHistoryTable({
  entries,
  loading,
  error,
}: {
  entries: RevisionHistoryEntry[];
  loading: boolean;
  error: string;
}) {
  return (
    <section className="revision-history" aria-labelledby="revision-history-title">
      <h3 id="revision-history-title">Riwayat Review</h3>
      {loading ? (
        <div className="loading">Memuat riwayat revisi...</div>
      ) : error ? (
        <div className="auth-err" role="alert">{error}</div>
      ) : entries.length === 0 ? (
        <div className="empty">Belum ada aktivitas review atau revisi yang tercatat.</div>
      ) : (
        <div className="tblw">
          <table className="tbl revision-history-table">
            <thead>
              <tr>
                <th scope="col">Pengajuan</th>
                <th scope="col">Tim</th>
                <th scope="col">Nama pengguna</th>
                <th scope="col">Aksi</th>
                <th scope="col">Catatan review</th>
                <th scope="col">Waktu</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(event => (
                <tr key={event.id}>
                  <td>{event.request_number}</td>
                  <td>{event.team}</td>
                  <td>{event.actor_name}</td>
                  <td>{event.action}</td>
                  <td>{event.detail || '—'}</td>
                  <td>{new Intl.DateTimeFormat('id-ID', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }).format(new Date(event.created_at))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function UploadForm({ home }: { home: string }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const revisionId = searchParams.get('revision');
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [clientsLoading, setClientsLoading] = useState(true);
  const [clientError, setClientError] = useState('');
  const [clientId, setClientId] = useState('');
  const [kind, setKind] = useState('');
  const [receiveDate, setReceiveDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const [approvers, setApprovers] = useState<1 | 2>(1);
  const [tax, setTax] = useState<TaxLine[]>([
    ...TAX_PRESETS.filter(item => item.code === 'PPN').map(
      ({ code, label, rate, kind: taxKind }) => ({ code, label, rate, kind: taxKind }),
    ),
  ]);
  const [rows, setRows] = useState<UploadRow[]>([]);
  const [dragging, setDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [revisionSource, setRevisionSource] = useState<Submission | null>(null);
  const [revisionHistory, setRevisionHistory] = useState<RevisionHistoryEntry[]>([]);
  const [revisionHistoryLoading, setRevisionHistoryLoading] = useState(false);
  const [revisionHistoryError, setRevisionHistoryError] = useState('');

  const loadClients = async () => {
    setClientsLoading(true);
    setClientError('');
    try {
      const items = await getClients();
      setClients(items);
      setClientId(current => items.some(item => item.id === current) ? current : '');
    } catch (error) {
      setClientError(error instanceof Error ? error.message : String(error));
    } finally {
      setClientsLoading(false);
    }
  };

  useEffect(() => {
    void loadClients();
  }, []);

  useEffect(() => {
    if (!revisionId) {
      setRevisionSource(null);
      setRevisionHistory([]);
      setRevisionHistoryError('');
      return;
    }

    let active = true;
    setRevisionHistoryLoading(true);
    setRevisionHistoryError('');
    void (async () => {
      try {
        const source = await getSubmission(revisionId);
        if (source.status !== 'Dikembalikan') {
          throw new Error('Hanya pengajuan berstatus Dikembalikan yang dapat direvisi.');
        }
        const history = await getRevisionHistory(revisionId);
        if (!active) return;
        setRevisionSource(source);
        setRevisionHistory(history);
        setClientId(source.client_id);
        setKind(source.kind);
        setReceiveDate(source.receive_date);
        setNote(source.note ?? '');
        setApprovers(source.approvers === 2 ? 2 : 1);
        const revisedTax = source.tax.flatMap((line): TaxLine[] => {
          const code = typeof line.code === 'string' ? line.code : '';
          const preset = TAX_PRESETS.find(item => item.code === code);
          if (!preset) return [];
          return [{
            code: preset.code,
            label: typeof line.label === 'string' ? line.label : preset.label,
            rate: typeof line.rate === 'number' ? line.rate : preset.rate,
            kind: line.kind === 'withhold' ? 'withhold' : 'add',
          }];
        }).slice(0, 1);
        setTax(revisedTax);
      } catch (error) {
        if (active) {
          setRevisionSource(null);
          setRevisionHistoryError(error instanceof Error ? error.message : String(error));
        }
      } finally {
        if (active) setRevisionHistoryLoading(false);
      }
    })();
    return () => { active = false; };
  }, [revisionId]);

  const addFiles = (files: FileList | File[]) => {
    const added = Array.from(files).map((file, index): UploadRow => {
      const error = fileProblem(file);
      return {
        key: `${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`,
        file,
        status: error ? 'rejected' : 'waiting',
        progress: 0,
        error: error ?? undefined,
      };
    });
    setRows(current => [...current, ...added]);
    setSubmission(null);
    void Promise.all(added
      .filter(row => row.status === 'waiting')
      .map(uploadRow));
  };

  const handleFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) addFiles(event.target.files);
    event.target.value = '';
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);
    addFiles(event.dataTransfer.files);
  };

  const uploadRow = async (row: UploadRow) => {
    setRows(current => current.map(item => item.key === row.key
      ? { ...item, status: 'uploading', progress: 0, error: undefined }
      : item));
    try {
      const data = await uploadDocument(row.file, progress => {
        setRows(current => current.map(item => item.key === row.key
          ? {
            ...item,
            progress,
            status: progress >= 100 ? 'extracting' : 'uploading',
          }
          : item));
      });
      const status = mapUploadStatus(data);
      setRows(current => current.map(item => item.key === row.key
        ? {
          ...item,
          data,
          progress: 100,
          status,
          error: status === 'failed'
            ? data.extraction_error ?? 'PDF tidak berisi invoice yang dapat diproses.'
            : undefined,
        }
        : item));
    } catch (error) {
      setRows(current => current.map(item => item.key === row.key
        ? {
          ...item,
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
        }
        : item));
    }
  };

  const retryRow = async (row: UploadRow) => {
    if (!row.data?.upload_id) {
      await uploadRow(row);
      return;
    }
    setRows(current => current.map(item => item.key === row.key
      ? { ...item, status: 'extracting', error: undefined }
      : item));
    try {
      const data = await retryExtraction(row.data.upload_id);
      const status = mapUploadStatus(data);
      setRows(current => current.map(item => item.key === row.key
        ? {
          ...item,
          data,
          progress: 100,
          status,
          error: status === 'failed'
            ? data.extraction_error ?? 'PDF tidak berisi invoice yang dapat diproses.'
            : undefined,
        }
        : item));
    } catch (error) {
      setRows(current => current.map(item => item.key === row.key
        ? { ...item, status: 'failed', error: error instanceof Error ? error.message : String(error) }
        : item));
    }
  };

  const submit = async () => {
    const ready = rows.filter(row => row.status === 'done' && row.data);
    if (revisionId && !revisionSource) {
      toast('Pengajuan asal revisi belum dapat diverifikasi. Muat ulang halaman sebelum mengirim.', true);
      return;
    }
    if (!clientId || !kind || ready.length === 0) {
      toast('Pilih klien dan jenis permintaan, lalu selesaikan ekstraksi file.', true);
      return;
    }
    setSubmitting(true);
    try {
      const result = await createSubmission({
        upload_ids: ready.map(row => row.data!.upload_id),
        client_id: clientId,
        ...(revisionSource ? { revision_of_submission_id: revisionSource.id } : {}),
        kind,
        receive_date: receiveDate,
        note,
        approvers,
        tax: tax.map(({ code, label, rate, kind: taxKind }) => ({
          code, label, rate, kind: taxKind,
        })),
      });
      setSubmission(result);
      toast(`Pengajuan ${result.request_number} berhasil dikirim.`, false);
      if (revisionSource) {
        try {
          setRevisionHistory(await getRevisionHistory(result.id));
        } catch (error) {
          toast(
            `Pengajuan berhasil dikirim, tetapi riwayat revisi gagal dimuat: ${
              error instanceof Error ? error.message : String(error)
            }`,
            true,
          );
        }
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), true);
    } finally {
      setSubmitting(false);
    }
  };

  const selectTax = (code: string) => {
    if (!code) {
      setTax([]);
      return;
    }
    const preset = TAX_PRESETS.find(item => item.code === code);
    if (!preset) return;
    setTax([{ code: preset.code, label: preset.label, rate: preset.rate, kind: preset.kind }]);
  };

  const clearForm = () => {
    if (hasActive || submitting) return;
    setClientId('');
    setKind('');
    setReceiveDate(new Date().toISOString().slice(0, 10));
    setNote('');
    setApprovers(1);
    setTax(TAX_PRESETS.filter(item => item.code === 'PPN').map(
      ({ code, label, rate, kind: taxKind }) => ({ code, label, rate, kind: taxKind }),
    ));
    setRows([]);
    setSubmission(null);
  };

  const readyCount = rows.filter(row => row.status === 'done').length;
  const hasActive = rows.some(row => row.status === 'uploading' || row.status === 'extracting');

  return (
    <>
      {submission && (
        <>
          <section className="card" role="status">
            <div className="banner info">
              <span>Pengajuan <b>{submission.request_number}</b> berhasil dikirim untuk diperiksa.</span>
            </div>
            <p className="sub">
              Reviewer telah ditugaskan. Tenggat review: <b>{submission.due_date}</b>.
            </p>
            <Link className="btn" to={home}>Kembali ke antrean</Link>
            <button
              className="btn"
              style={{ marginLeft: 8 }}
              onClick={() => {
                clearForm();
                setRevisionSource(null);
                setRevisionHistory([]);
                setRevisionHistoryError('');
                navigate('/support/upload', { replace: true });
              }}
            >
              Buat pengajuan lain
            </button>
          </section>
          {revisionId && (
            <section className="card">
              <RevisionHistoryTable
                entries={revisionHistory}
                loading={revisionHistoryLoading}
                error={revisionHistoryError}
              />
            </section>
          )}
        </>
      )}

      {!submission && (
        <>
          <section className="card">
            <h2>Informasi pengajuan</h2>
            <p className="sub">Pilih klien dan isi metadata sebelum mengirim invoice.</p>
            {clientError && (
              <div className="auth-err" role="alert">
                Gagal memuat klien: {clientError}{' '}
                <button className="btn sm" type="button" onClick={() => void loadClients()}>
                  Coba lagi
                </button>
              </div>
            )}
            <div className="form">
              <label>
                Klien
                <select
                  value={clientId}
                  disabled={clientsLoading || Boolean(clientError)}
                  onChange={event => setClientId(event.target.value)}
                  required
                >
                  <option value="">{clientsLoading ? 'Memuat klien...' : 'Pilih klien'}</option>
                  {clients.map(client => (
                    <option value={client.id} key={client.id}>{client.name}</option>
                  ))}
                </select>
                {!clientsLoading && !clientError && clients.length === 0 && (
                  <small className="err-t">
                    Belum ada klien yang ditugaskan kepada Anda. Hubungi System Admin.
                  </small>
                )}
              </label>
              <label>
                Jenis permintaan
                <select value={kind} onChange={event => setKind(event.target.value)} required>
                  <option value="">Pilih jenis permintaan</option>
                  {JENIS.map(item => <option key={item}>{item}</option>)}
                </select>
              </label>
              <label>
                Tanggal diterima
                <input
                  type="date"
                  value={receiveDate}
                  onChange={event => setReceiveDate(event.target.value)}
                  required
                />
              </label>
              <label>
                Penyetuju voucher (BOD)
                <select
                  value={approvers}
                  onChange={event => setApprovers(Number(event.target.value) as 1 | 2)}
                >
                  <option value={1}>1 pihak</option>
                  <option value={2}>2 pihak</option>
                </select>
              </label>
            </div>
          </section>

          <section className="card">
            <h2>Upload PDF</h2>
            <p className="sub">
              Format PDF, maksimal 4.500.000 byte per file. File akan langsung diunggah dan diekstrak oleh AI setelah dipilih.
            </p>
            <label
              className={`drop${rows.length ? ' has' : ''}${dragging ? ' over' : ''}`}
              onDragOver={event => { event.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
            >
              <input
                type="file"
                accept="application/pdf,.pdf"
                multiple
                hidden
                onChange={handleFileInput}
              />
              <span aria-hidden="true" style={{ fontSize: 30 }}>⇧</span>
              <b>Tarik beberapa PDF ke sini</b>
              <span>atau klik untuk memilih file</span>
            </label>

            {rows.length > 0 && (
              <div className="queue" style={{ marginTop: 16 }}>
                {rows.map(row => (
                  <div className="q" key={row.key} style={{ gridTemplateColumns: '1.5fr 1fr 1.5fr auto' }}>
                    <div>
                      <div className="t">{row.file.name}</div>
                      <div className="m">{(row.file.size / 1024).toFixed(0)} KB</div>
                    </div>
                    <div>
                      <span className={`badge s-${row.status}`}>
                        {statusLabel[row.status]}
                      </span>
                      {(row.status === 'uploading' || row.status === 'extracting') && (
                        <progress
                          value={row.progress}
                          max="100"
                          aria-label={`Progres ${row.file.name}`}
                          style={{ display: 'block', width: '100%', marginTop: 6 }}
                        />
                      )}
                    </div>
                    <div>
                      {row.error && <span className="err-t" role="alert">{row.error}</span>}
                      {row.data?.document_url && (
                        <>
                          <a href={row.data.document_url} target="_blank" rel="noreferrer">
                            Lihat PDF
                          </a>
                          {row.data.invoices.map((invoice, index) => (
                            <details key={`${invoice.no}-${index}`} style={{ marginTop: 6 }}>
                              <summary>
                                Invoice {invoice.no || index + 1} · {rp(invoice.total)}
                              </summary>
                              <div className="m">
                                {invoice.vendor || 'Vendor tidak terdeteksi'} · {invoice.tgl || 'Tanggal tidak terdeteksi'}
                                <br />DPP {rp(invoice.dpp)} · PPN {rp(invoice.ppn)}
                              </div>
                            </details>
                          ))}
                        </>
                      )}
                    </div>
                    <div>
                      {row.status === 'failed' && (
                        <button className="btn sm" disabled={hasActive} onClick={() => void retryRow(row)}>
                          Coba lagi
                        </button>
                      )}
                      {(row.status === 'waiting' || row.status === 'rejected') && (
                        <button
                          className="btn sm"
                          aria-label={`Hapus ${row.file.name}`}
                          onClick={() => setRows(current => current.filter(item => item.key !== row.key))}
                        >
                          Hapus
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="sub" role="status" style={{ marginTop: 16 }}>
              {hasActive
                ? 'PDF sedang diunggah dan diekstrak...'
                : `${readyCount} file siap dikirim.`}
            </div>
          </section>

          <section className="card">
            <h2>Pajak yang berlaku</h2>
            <p className="sub">Pilih satu pajak untuk disertakan bersama pengajuan.</p>
            <select
              aria-label="Pajak yang berlaku"
              value={tax[0]?.code ?? ''}
              onChange={event => selectTax(event.target.value)}
            >
              <option value="">Tanpa pajak</option>
              {TAX_PRESETS.map(preset => (
                <option key={preset.code} value={preset.code}>
                  {preset.label} ({preset.rate}%) — {preset.kind === 'add' ? 'ditambahkan' : 'dipotong'}
                </option>
              ))}
            </select>
            {readyCount > 0 && (
              <p className="sub" style={{ marginTop: 16 }}>
                Nilai invoice terdeteksi: <b>{rp(rows.reduce((sum, row) => sum + (row.data?.grand_total ?? 0), 0))}</b>
              </p>
            )}
          </section>

          <section className="card">
            <h2>Catatan untuk reviewer <small className="m">(opsional)</small></h2>
            <textarea
              rows={3}
              maxLength={2000}
              value={note}
              onChange={event => setNote(event.target.value)}
              placeholder="Catatan tambahan untuk reviewer"
            />
            {revisionId && (
              <RevisionHistoryTable
                entries={revisionHistory}
                loading={revisionHistoryLoading}
                error={revisionHistoryError}
              />
            )}
            <div className="actions" style={{ marginTop: 16 }}>
              <button
                className="btn primary"
                disabled={
                  submitting || hasActive || !clientId || !kind ||
                  readyCount === 0 || rows.some(row => row.status === 'waiting') ||
                  Boolean(revisionId && (!revisionSource || revisionHistoryLoading || revisionHistoryError))
                }
                onClick={() => void submit()}
              >
                {submitting ? 'Mengirim...' : `Kirim ${readyCount || ''} file untuk diperiksa`}
              </button>
              <button
                className="btn"
                type="button"
                disabled={submitting || hasActive}
                onClick={clearForm}
              >
                Kosongkan formulir
              </button>
            </div>
            {rows.some(row => row.status === 'failed' || row.status === 'rejected') && (
              <p className="sub" role="status">
                File gagal atau ditolak tidak ikut dikirim.
              </p>
            )}
          </section>
        </>
      )}
    </>
  );
}
