# Dokumentasi

| File | Isi |
| --- | --- |
| `01-bpmn-rbac-user-stories.md` | **UPDATED**: Peran, BPMN, alur layar, matriks RBAC, user story dengan perubahan: role PIC Klien dihapus, Intake Support sebagai role utama, penambahan field jenis pajak, rejection flow, dan manajemen data klien |
| `02-update-halaman-login.md` | Catatan update halaman login: alur, keamanan, akun contoh, file yang berubah, cara uji |
| `prototype/amiga-intake-prototype.html` | Prototipe satu file, bisa dibuka langsung di browser tanpa instalasi (data contoh, berjalan di browser) |

Kode aplikasi yang sesungguhnya ada di folder `src/`. Prototipe hanya untuk pratinjau cepat dan tidak aman karena seluruh logikanya berjalan di browser.

## Perubahan Utama (Latest Update)

### 1. Penghapusan Role PIC Klien
- Role "PIC Klien" telah dihapus dari sistem
- Semua fungsi upload dan manajemen dokumen sekarang dilakukan oleh **Intake Support**
- Folder `/app/pic` telah dihapus, diganti dengan fungsionalitas yang lebih lengkap di `/app/support`

### 2. Penambahan Field Jenis Pajak
- Dropdown jenis pajak ditambahkan ke form upload invoice
- Opsi: PPh 21, PPh 23, PPh 4 ayat 2, PPN, PPh Final, Tidak ada
- Field disimpan di level dokumen untuk tracking dan reporting

### 3. Data Klien yang Lebih Lengkap
- Struktur data client baru dengan field: nama PT, nama PIC, email, telepon, alamat
- Nomor urut otomatis per klien (sequential numbering per PT)
- System Admin dan Intake Support dapat menambah data klien baru
- Interface manajemen klien tersedia di `/admin/clients` dan `/support/clients`

### 4. Flow Rejection yang Diperbaiki
- Finance Reviewer dapat menolak dokumen kembali ke Intake Support
- Status berubah menjadi "Perlu Tindakan" saat rejection
- Intake Support dapat memperbaiki dengan atau tanpa upload file baru
- UI perbaikan dokumen tersedia di `/support/fix/[id]`

### 5. Format Voucher Baru
- Header: "Voucher pengeluaran"
- Layout tabel dengan kolom: no, tanggal, keterangan, jumlah, harga
- Footer signature: "diajukan oleh admin" dan "disetujui oleh BOD"
- Catatan: "side approval bisa ada dua pihak"

## File Types yang Didukung
- Invoice dapat berupa: PDF, tangkapan layar dalam PDF, atau format lain yang di-convert ke PDF
