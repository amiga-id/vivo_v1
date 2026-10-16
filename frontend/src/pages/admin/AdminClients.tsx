import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useSession } from '@/lib/session';
import { getDatabaseAccounts } from '@/lib/auth-api';
import { createVendor, deleteVendor, getVendors, updateVendor } from '@/lib/vendor-api';
import {
  getClientAssignments,
  getClients,
  updateClientAssignments,
} from '@/lib/document-api';
import type { ClientOption } from '@/lib/document-api';
import type { User, Vendor } from '@/lib/types';
import { useToast } from '@/components/Toast';
import Pagination from '@/components/Pagination';
import { usePagination } from '@/lib/pagination';

export default function AdminClients() {
  const { user } = useSession();
  const toast = useToast();
  const vendorFormRef = useRef<HTMLFormElement>(null);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [intakeSupport, setIntakeSupport] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [supportLoading, setSupportLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [deletingVendorId, setDeletingVendorId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [supportError, setSupportError] = useState('');
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [clientLoading, setClientLoading] = useState(true);
  const [clientError, setClientError] = useState('');
  const [assignmentBySupport, setAssignmentBySupport] = useState<Record<string, string[]>>({});
  const [savingSupports, setSavingSupports] = useState<Record<string, boolean>>({});
  const [form, setForm] = useState({
    name: '',
    pic: '',
    email: '',
    phone_number: '',
    address: '',
  });
  const clientsPagination = usePagination(clients);
  const supportPagination = usePagination(intakeSupport);
  const vendorsPagination = usePagination(vendors);

  const loadVendors = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setVendors(await getVendors());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadIntakeSupport = useCallback(async () => {
    setSupportLoading(true);
    setSupportError('');
    try {
      const accounts = await getDatabaseAccounts();
      setIntakeSupport(
        accounts
          .filter(account => account.role === 'support')
          .sort((first, second) => first.name.localeCompare(second.name)),
      );
    } catch (reason) {
      setSupportError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSupportLoading(false);
    }
  }, []);

  const loadManagedClients = useCallback(async () => {
    setClientLoading(true);
    setClientError('');
    try {
      const [clientRows, assignmentRows] = await Promise.all([
        getClients(),
        getClientAssignments(),
      ]);
      setClients(clientRows);
      setAssignmentBySupport(Object.fromEntries(
        assignmentRows.map(row => [row.support_id, row.client_ids]),
      ));
    } catch (reason) {
      setClientError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setClientLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
      void loadVendors();
      void loadIntakeSupport();
      void loadManagedClients();
    }
  }, [user, loadVendors, loadIntakeSupport, loadManagedClients]);

  if (!user) return <div className="loading">Loading...</div>;

  const updateForm = (field: keyof typeof form, value: string) =>
    setForm(current => ({ ...current, [field]: value }));

  const addVendor = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    try {
      if (editingVendor) {
        await updateVendor(editingVendor.id, form);
      } else {
        await createVendor(form);
      }
      const wasEditing = Boolean(editingVendor);
      setEditingVendor(null);
      setForm({ name: '', pic: '', email: '', phone_number: '', address: '' });
      toast(
        wasEditing ? 'Perubahan vendor berhasil disimpan.' : 'Vendor berhasil ditambahkan ke database.',
        false,
      );
      await Promise.all([loadVendors(), loadManagedClients()]);
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : String(reason), true);
    } finally {
      setPending(false);
    }
  };

  const editVendor = (vendor: Vendor) => {
    setEditingVendor(vendor);
    setForm({
      name: vendor.name,
      pic: vendor.pic,
      email: vendor.email,
      phone_number: vendor.phone_number ?? '',
      address: vendor.address ?? '',
    });
    vendorFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const cancelVendorEdit = () => {
    setEditingVendor(null);
    setForm({ name: '', pic: '', email: '', phone_number: '', address: '' });
  };

  const removeVendor = async (vendor: Vendor) => {
    const confirmed = window.confirm(
      `Hapus vendor "${vendor.name}"? Riwayat pengajuan lama tetap disimpan, tetapi klien ini tidak lagi tersedia untuk pengajuan baru.`,
    );
    if (!confirmed) return;

    setDeletingVendorId(vendor.id);
    try {
      await deleteVendor(vendor.id);
      toast('Vendor berhasil dihapus.', false);
      if (editingVendor?.id === vendor.id) cancelVendorEdit();
      await Promise.all([loadVendors(), loadManagedClients()]);
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : String(reason), true);
    } finally {
      setDeletingVendorId(null);
    }
  };

  const saveAssignment = async (supportId: string, clientIds: string[]) => {
    const previousIds = assignmentBySupport[supportId] ?? [];
    setSavingSupports(current => ({ ...current, [supportId]: true }));
    setAssignmentBySupport(current => ({ ...current, [supportId]: clientIds }));
    try {
      const saved = await updateClientAssignments(supportId, clientIds);
      setAssignmentBySupport(current => {
        const next = Object.fromEntries(
          Object.entries(current).map(([assignedSupportId, assignedClientIds]) => [
            assignedSupportId,
            assignedSupportId === supportId
              ? saved.client_ids
              : assignedClientIds.filter(id => !saved.client_ids.includes(id)),
          ]),
        );
        return { ...next, [supportId]: saved.client_ids };
      });
      await loadVendors();
    } catch (reason) {
      setAssignmentBySupport(current => ({ ...current, [supportId]: previousIds }));
      toast(reason instanceof Error ? reason.message : String(reason), true);
    } finally {
      setSavingSupports(current => ({ ...current, [supportId]: false }));
    }
  };

  return (
    <>
      <section className="card">
        <h2>Klien dan penugasan Intake Support</h2>
        <p className="sub">
          Nama klien diambil dari data vendor. Tambahkan vendor pada formulir di bawah,
          lalu tugaskan vendor tersebut kepada Intake Support.
        </p>
        {clientError && (
          <div className="auth-err" role="alert">
            Gagal memuat klien atau penugasan: {clientError}{' '}
            <button className="btn sm" type="button" onClick={() => void loadManagedClients()}>
              Coba lagi
            </button>
          </div>
        )}
        {clientLoading ? (
          <div className="loading">Memuat klien dan penugasan...</div>
        ) : !clientError && (
          <>
            <div className="tblw" style={{ marginTop: 18 }}>
              <table className="tbl">
                <thead><tr><th>Nama vendor untuk pilihan Klien</th></tr></thead>
                <tbody>
                  {clients.length === 0 ? (
                    <tr><td style={{ color: '#999' }}>Belum ada vendor di database.</td></tr>
                  ) : clientsPagination.pageItems.map(client => (
                    <tr key={client.id}><td>{client.name}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={clientsPagination.page}
              pageCount={clientsPagination.pageCount}
              firstItem={clientsPagination.firstItem}
              lastItem={clientsPagination.lastItem}
              totalItems={clients.length}
              onPageChange={clientsPagination.setPage}
            />
            <h3 style={{ marginTop: 22 }}>Penugasan per Intake Support</h3>
            {supportError && (
              <div className="auth-err" role="alert">
                Gagal memuat akun Intake Support: {supportError}{' '}
                <button className="btn sm" type="button" onClick={() => void loadIntakeSupport()}>
                  Coba lagi
                </button>
              </div>
            )}
            <div className="queue">
              {intakeSupport.length === 0 ? (
                <div className="sub">
                  {supportLoading
                    ? 'Memuat akun Intake Support...'
                    : 'Belum ada akun Intake Support.'}
                </div>
              ) : supportPagination.pageItems.map(account => {
                const selected = assignmentBySupport[account.id] ?? [];
                return (
                  <div
                    className="q"
                    key={account.id}
                    style={{ gridTemplateColumns: '1fr 2fr auto' }}
                  >
                    <div>
                      <div className="t">{account.name}</div>
                      <div className="m">{account.email}</div>
                    </div>
                    <div className="form">
                      {clients.length === 0 ? (
                        <span className="m">Tambahkan vendor terlebih dahulu.</span>
                      ) : clients.map(client => (
                        <label
                          key={client.id}
                          style={{ display: 'flex', gap: 8, alignItems: 'center' }}
                        >
                          <input
                            type="checkbox"
                            checked={selected.includes(client.id)}
                            disabled={savingSupports[account.id] || Boolean(clientError)}
                            onChange={event => {
                              const checked = event.target.checked;
                              const nextIds = checked
                                ? [...selected, client.id]
                                : selected.filter(id => id !== client.id);
                              void saveAssignment(account.id, nextIds);
                            }}
                          />
                          {client.name}
                        </label>
                      ))}
                    </div>
                    <span className="m" role="status" aria-live="polite">
                      {savingSupports[account.id]
                        ? 'Menyimpan perubahan...'
                        : 'Checkbox tersimpan otomatis'}
                    </span>
                  </div>
                );
              })}
            </div>
            <Pagination
              page={supportPagination.page}
              pageCount={supportPagination.pageCount}
              firstItem={supportPagination.firstItem}
              lastItem={supportPagination.lastItem}
              totalItems={intakeSupport.length}
              onPageChange={supportPagination.setPage}
            />
          </>
        )}
      </section>

      <section className="card">
        <h2>{editingVendor ? 'Edit vendor' : 'Tambah vendor'}</h2>
        <p className="sub">
          {editingVendor
            ? 'Perubahan akan langsung disimpan ke database vendor.'
            : 'Data disimpan pada database vendor dan digunakan sebagai referensi perusahaan.'}
        </p>
        <form className="vendor-form" ref={vendorFormRef} onSubmit={addVendor}>
          <div className="form">
            <label>
              Nama perusahaan
              <input type="text" value={form.name}
                onChange={event => updateForm('name', event.target.value)}
                placeholder="Contoh: PT Sumber Makmur" maxLength={255} required />
            </label>
            <label>
              Nama PIC
              <select value={form.pic}
                onChange={event => updateForm('pic', event.target.value)}
                disabled={supportLoading || Boolean(supportError) || intakeSupport.length === 0}
                required>
                <option value="">
                  {supportLoading ? 'Memuat Intake Support...' : 'Pilih Intake Support'}
                </option>
                {intakeSupport.map(account => (
                  <option key={account.id} value={account.name}>{account.name}</option>
                ))}
              </select>
            </label>
            {supportError && (
              <div className="full">
                <div className="auth-err" role="alert">
                  Gagal memuat data Intake Support: {supportError}
                </div>
                <button className="btn sm" type="button" onClick={() => void loadIntakeSupport()}>
                  Coba muat ulang Intake Support
                </button>
              </div>
            )}
            {!supportLoading && !supportError && intakeSupport.length === 0 && (
              <div className="full auth-err" role="alert">
                Belum ada akun Intake Support. Tambahkan akun support terlebih dahulu.
              </div>
            )}
            <label>
              Email
              <input type="email" value={form.email}
                onChange={event => updateForm('email', event.target.value)}
                placeholder="pic@perusahaan.com" maxLength={255} required />
            </label>
            <label>
              Nomor telepon
              <input type="tel" value={form.phone_number}
                onChange={event => updateForm('phone_number', event.target.value)}
                placeholder="Opsional" maxLength={255} />
            </label>
            <label className="full">
              Alamat
              <input type="text" value={form.address}
                onChange={event => updateForm('address', event.target.value)}
                placeholder="Opsional" maxLength={255} />
            </label>
          </div>
          <div className="actions" style={{ marginTop: 16 }}>
            <button className="btn primary" type="submit" disabled={pending}>
              {pending
                ? 'Menyimpan...'
                : editingVendor ? 'Simpan perubahan' : 'Tambah vendor'}
            </button>
            {editingVendor && (
              <button className="btn" type="button" disabled={pending} onClick={cancelVendorEdit}>
                Batal
              </button>
            )}
          </div>
        </form>
      </section>

      <section className="card">
        <h2>Daftar klien / vendor</h2>
        <p className="sub">
          Daftar ini diambil langsung dari database vendor.
        </p>
        {error && <div className="auth-err" role="alert">{error}</div>}
        {loading ? (
          <div className="loading">Memuat data vendor...</div>
        ) : (
          <>
            {error ? (
              <button className="btn sm" onClick={() => void loadVendors()}>
                Coba muat ulang
              </button>
            ) : (
              <div className="tblw">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Perusahaan</th><th>PIC</th><th>Email</th>
                      <th>Telepon</th><th>Alamat</th><th>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vendors.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', color: '#999' }}>
                          Belum ada data klien / vendor.
                        </td>
                      </tr>
                    ) : vendorsPagination.pageItems.map(vendor => (
                      <tr key={vendor.id}>
                        <td><strong>{vendor.name}</strong></td>
                        <td>{vendor.pic}</td>
                        <td className="m">{vendor.email}</td>
                        <td>{vendor.phone_number || <span className="m">-</span>}</td>
                        <td>{vendor.address || <span className="m">-</span>}</td>
                        <td>
                          <div className="actions vendor-actions" style={{ margin: 0 }}>
                            <button
                              className="btn sm"
                              type="button"
                              disabled={pending || deletingVendorId !== null}
                              onClick={() => editVendor(vendor)}
                            >
                              Edit
                            </button>
                            <button
                              className="btn sm danger"
                              type="button"
                              disabled={pending || deletingVendorId !== null}
                              onClick={() => void removeVendor(vendor)}
                            >
                              {deletingVendorId === vendor.id ? 'Menghapus...' : 'Hapus'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <Pagination
              page={vendorsPagination.page}
              pageCount={vendorsPagination.pageCount}
              firstItem={vendorsPagination.firstItem}
              lastItem={vendorsPagination.lastItem}
              totalItems={vendors.length}
              onPageChange={vendorsPagination.setPage}
            />
          </>
        )}
        {!loading && !error && (
          <p className="sub" style={{ marginBottom: 0 }}>
            {vendors.length} klien / vendor
          </p>
        )}
      </section>
    </>
  );
}
