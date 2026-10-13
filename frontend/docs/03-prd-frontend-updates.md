# Product Requirements Document (PRD)
## AMIGA Frontend - Major Updates

**Document Version:** 1.0  
**Date:** October 13, 2026  
**Status:** Implemented  
**Author:** Development Team

---

## 1. Executive Summary

### 1.1 Purpose
Dokumen ini menjelaskan secara detail perubahan-perubahan besar yang dilakukan pada frontend AMIGA untuk meningkatkan efisiensi operasional, memperjelas pembagian peran, dan meningkatkan kualitas data.

### 1.2 Scope
Update ini mencakup 5 area utama:
1. Restrukturisasi role dan otorisasi
2. Penambahan field pajak untuk kebutuhan compliance
3. Implementasi sistem penomoran dokumen per klien
4. Workflow rejection dan perbaikan dokumen
5. Redesign format voucher sesuai standar perusahaan

---

## 2. Problem Statement

### 2.1 Masalah yang Diidentifikasi

#### Problem #1: Role Overlap
**Deskripsi:** Role "PIC Client" dan "Intake Support" memiliki scope kerja yang sama, menyebabkan kebingungan dalam assignment tugas.

**Impact:**
- Duplikasi effort dalam mengelola dokumen
- Unclear accountability
- Kompleksitas berlebih dalam RBAC matrix

#### Problem #2: Missing Tax Information
**Deskripsi:** Sistem tidak mencatat jenis pajak yang dikenakan pada invoice, padahal informasi ini critical untuk pelaporan dan compliance.

**Impact:**
- Manual tracking di luar sistem
- Risk kesalahan dalam pelaporan pajak
- Tidak ada audit trail untuk jenis pajak

#### Problem #3: Document Numbering Chaos
**Deskripsi:** Nomor dokumen global tanpa mempertimbangkan klien, menyulitkan tracking dokumen per perusahaan.

**Impact:**
- Sulit melakukan reconciliation per klien
- Tidak bisa quick lookup dokumen klien tertentu
- Nomor tidak meaningful untuk business context

#### Problem #4: No Rejection Workflow
**Deskripsi:** Jika Finance Reviewer menemukan dokumen tidak valid, tidak ada mekanisme untuk mengembalikan ke Intake Support untuk perbaikan.

**Impact:**
- Dead-end workflow (dokumen stuck)
- Komunikasi manual via chat/email
- Tidak ada tracking untuk dokumen yang perlu diperbaiki

#### Problem #5: Voucher Format Mismatch
**Deskripsi:** Format voucher di sistem tidak match dengan template standar perusahaan yang digunakan untuk approval manual.

**Impact:**
- Perlu manual reformatting untuk print
- Inconsistency dalam approval process
- Signature section tidak sesuai kebutuhan (BOD vs Finance)

---

## 3. Solution Overview

### 3.1 Feature #1: Role Consolidation

**Objective:** Menghilangkan role "PIC Client" dan mengkonsolidasikan fungsinya ke "Intake Support"

**Rationale:**
- Scope kerja kedua role identik: upload dokumen, manage queue, generate voucher
- Simplifikasi permission matrix
- Clearer responsibility assignment

**User Stories:**
```
AS a System Admin
I WANT to manage users dengan role structure yang simple
SO THAT assignment dan training lebih mudah dilakukan

AS an Intake Support staff
I WANT to have clear responsibility untuk semua intake tasks
SO THAT tidak ada confusion dengan role lain
```

**Acceptance Criteria:**
- ✅ Role 'pic' dihapus dari type definitions
- ✅ All UI routes `/pic/*` dihapus
- ✅ Fitur voucher accessible dari `/support/voucher`
- ✅ Existing users dengan role 'pic' migrated ke 'support'
- ✅ RBAC matrix updated tanpa 'pic' permissions
- ✅ Documentation updated untuk reflect role baru

---

### 3.2 Feature #2: Tax Type Field

**Objective:** Menambahkan field "Jenis Pajak" pada setiap dokumen invoice

**Rationale:**
- Compliance requirement untuk pelaporan pajak
- Memudahkan filtering dan reporting berdasarkan jenis pajak
- Audit trail yang lebih lengkap

**User Stories:**
```
AS an Intake Support staff
I WANT to specify jenis pajak saat upload invoice
SO THAT informasi pajak tercatat dengan benar

AS a Finance Reviewer
I WANT to see jenis pajak pada setiap dokumen
SO THAT saya bisa verify compliance dengan regulasi

AS a System Admin
I WANT to generate report berdasarkan jenis pajak
SO THAT pelaporan pajak bulanan lebih mudah
```

**Acceptance Criteria:**
- ✅ Dropdown "Jenis Pajak" di form upload
- ✅ 6 opsi tersedia: PPh 21, PPh 23, PPh 4 ayat 2, PPN, PPh Final, Tidak ada
- ✅ Field mandatory (tidak boleh kosong)
- ✅ Tersimpan di database level dokumen
- ✅ Tampil di detail dokumen dan voucher view
- ✅ Bisa digunakan untuk filtering di audit trail

**Technical Specification:**

```typescript
// Data Model
interface Doc {
  // ... existing fields
  jenisPajak: 'PPh 21' | 'PPh 23' | 'PPh 4 ayat 2' | 'PPN' | 'PPh Final' | 'Tidak ada';
}

// Constants
const JENIS_PAJAK = [
  'PPh 21',
  'PPh 23', 
  'PPh 4 ayat 2',
  'PPN',
  'PPh Final',
  'Tidak ada'
] as const;
```

**UI Placement:**
- Form upload: berdampingan dengan field "Kategori" dan "Penerima"
- Queue table: column tersendiri (sortable)
- Detail view: dalam section "Informasi Dokumen"

---

### 3.3 Feature #3: Client-Specific Sequential Numbering

**Objective:** Implementasi nomor urut dokumen per klien (PT) dengan tracking nama PT dan PIC

**Rationale:**
- Business need untuk tracking dokumen per perusahaan klien
- Nomor urut yang meaningful (reset per klien)
- Memudahkan reconciliation dan audit per klien

**User Stories:**
```
AS an Intake Support staff
I WANT to input nama PT dan nama PIC saat upload
SO THAT dokumen ter-associate dengan klien yang benar

AS a Finance Reviewer
I WANT to see nomor urut dokumen per PT
SO THAT saya bisa track berapa banyak dokumen dari klien tertentu

AS a System Admin
I WANT to manage master data klien (PT list)
SO THAT data klien konsisten dan tidak ada duplikasi
```

**Acceptance Criteria:**
- ✅ Entity "Client" dengan fields: namaPT, namaPIC, email, phone, address, nextSequence
- ✅ Setiap dokumen memiliki: nomorUrut, namaPT, namaPIC
- ✅ Nomor urut auto-increment per klien (bukan global)
- ✅ UI untuk manage client data (add, view list)
- ✅ Accessible oleh: System Admin dan Intake Support
- ✅ Invoice number format: `[nomorUrut] - PT [namaPT] - PIC [namaPIC]`

**Technical Specification:**

```typescript
// Client Entity
interface Client {
  id: string;
  namaPT: string;        // Nama perusahaan
  namaPIC: string;       // Nama person in charge
  email: string;
  phone: string;
  address: string;
  nextSequence: number;  // Counter untuk nomor urut
}

// Document Enhancement
interface Doc {
  // ... existing fields
  nomorUrut: number;     // Sequence number dari client
  namaPT: string;        // Copied dari Client
  namaPIC: string;       // Copied dari Client
  klien: string;         // Client ID reference
}

// Business Logic
function createDocFromUpload(user, input) {
  const client = findClientById(input.klien);
  const nomorUrut = client.nextSequence;
  
  // Increment untuk dokumen berikutnya
  client.nextSequence++;
  
  return {
    ...input,
    nomorUrut,
    namaPT: client.namaPT,
    namaPIC: client.namaPIC
  };
}
```

**UI Components:**

1. **Client Management Screen** (`/admin/clients`, `/support/clients`)
   - Table: ID | Nama PT | Nama PIC | Email | Telepon | Alamat | Nomor Urut Berikutnya
   - Button: "Tambah Klien Baru"

2. **Add Client Form**
   - Fields: Nama PT (required), Nama PIC (required), Email (required), Telepon, Alamat
   - Validation: Email format, required fields
   - Action: Save → nextSequence dimulai dari 1

3. **Upload Form Enhancement**
   - Dropdown "Klien" populated dari client list
   - Auto-show: "Nomor urut berikutnya: [X]" setelah pilih klien

**Data Migration:**
- Existing documents: assign nomorUrut berdasarkan created timestamp per klien
- Client list: extract unique klien names dari existing documents
- Set nextSequence = max(nomorUrut) + 1 per client

---

### 3.4 Feature #4: Finance Rejection Workflow

**Objective:** Enable Finance Reviewer untuk reject voucher dan return ke Intake Support untuk perbaikan

**Rationale:**
- Voucher yang tidak valid perlu mekanisme perbaikan
- Menghindari dead-end workflow
- Maintain audit trail untuk rejection dan fixes

**User Stories:**
```
AS a Finance Reviewer
I WANT to reject voucher dengan memberikan alasan
SO THAT Intake Support tahu apa yang perlu diperbaiki

AS an Intake Support staff
I WANT to see list dokumen yang perlu diperbaiki
SO THAT saya bisa prioritize perbaikan

AS an Intake Support staff
I WANT to fix rejected document dengan upload ulang atau edit catatan
SO THAT dokumen bisa kembali ke review cycle
```

**Acceptance Criteria:**
- ✅ Button "Tolak" di Finance Review screen
- ✅ Modal/form untuk input "Alasan Penolakan"
- ✅ Status dokumen berubah menjadi "Perlu Tindakan"
- ✅ Dokumen kembali ke queue Intake Support
- ✅ UI untuk fix document: option upload ulang ATAU edit catatan saja
- ✅ Setelah fix, status kembali ke "Menunggu Review Finance"
- ✅ Audit trail mencatat: rejection reason, who fixed, what changed

**Workflow Diagram:**

```
[Finance Review] 
    ↓
[Reject] → Status: "Perlu Tindakan" 
    ↓
[Intake Support Queue - Filter: "Perlu Tindakan"]
    ↓
[Fix Document Screen]
    ↓
    ├─→ [Re-upload File] → Replace file, update metadata
    │
    └─→ [Edit Notes Only] → Update catatan, keep original file
    ↓
Status: "Menunggu Review Finance"
    ↓
[Back to Finance Queue]
```

**Technical Specification:**

```typescript
// Rejection Action
function rejectDocument(reviewer: User, docId: string, reason: string) {
  const doc = getDocById(docId);
  
  doc.status = 'Perlu Tindakan';
  doc.catatan = `${doc.catatan}\n\n[DITOLAK] ${reason}`;
  
  addAuditEvent({
    type: 'reject',
    docId,
    userId: reviewer.id,
    reason,
    timestamp: new Date()
  });
}

// Fix Action
function fixRejectedDoc(
  user: User, 
  { docId, file, catatan }: FixInput
) {
  const doc = getDocById(docId);
  
  if (file) {
    // Re-upload scenario
    doc.file = file;
    doc.uploadDate = new Date();
  }
  
  doc.catatan = catatan;
  doc.status = 'Menunggu Review Finance';
  
  addAuditEvent({
    type: 'fix',
    docId,
    userId: user.id,
    hasNewFile: !!file,
    timestamp: new Date()
  });
}
```

**UI Components:**

1. **Reject Modal** (Finance Review Screen)
   - Textarea: "Alasan Penolakan" (required)
   - Buttons: "Batal" | "Tolak Dokumen"

2. **Fix Document Screen** (`/support/fix/[id]`)
   - Display: Document info, rejection reason
   - Option 1: "Upload File Baru" dengan file picker
   - Option 2: "Perbaiki Catatan Saja"
   - Textarea: "Catatan" (editable)
   - Button: "Kirim Perbaikan"

3. **Queue Enhancement**
   - Filter: "Status = Perlu Tindakan"
   - Column: "Alasan Ditolak" (truncated dengan tooltip)
   - Action button: "Perbaiki" → Link ke `/support/fix/[id]`

---

### 3.5 Feature #5: Voucher Format Redesign

**Objective:** Mengubah format voucher agar match dengan template standar perusahaan

**Rationale:**
- Consistency dengan template approval manual
- Signature section yang sesuai (admin dan BOD, bukan finance)
- Format lebih professional untuk print

**User Stories:**
```
AS a Finance Reviewer
I WANT voucher format yang professional
SO THAT bisa langsung di-print untuk approval BOD

AS a BOD
I WANT melihat voucher dengan format familiar
SO THAT review dan approval lebih cepat

AS an Admin
I WANT voucher mencantumkan "diajukan oleh admin"
SO THAT clear siapa yang submit request
```

**Acceptance Criteria:**
- ✅ Header: "Voucher pengeluaran" (bukan "Voucher pembayaran")
- ✅ Nomor format: `[nomorUrut] - [bulan][tahun]`
- ✅ Info header: Nama PT, Tanggal/Periode, Nominal
- ✅ Table layout dengan 5 kolom: no, tanggal, keterangan, jumlah, harga
- ✅ Total row dengan border tegas
- ✅ Signature section: "diajukan oleh admin" dan "disetujui oleh BOD"
- ✅ Note: "side approval bisa ada dua pihak"

**Before vs After:**

| Aspect | Before | After |
|--------|--------|-------|
| Header | "Voucher pembayaran" | "Voucher pengeluaran" |
| Nomor | Simple counter | `[urut] - [MMM][YY]` |
| Layout | List items | Table (5 columns) |
| Signature 1 | "Diperiksa Finance" | "diajukan oleh admin" |
| Signature 2 | "Client Approver" | "disetujui oleh BOD" |
| Note | None | "side approval bisa ada dua pihak" |

**Technical Specification:**

```typescript
interface VoucherData {
  nomorUrut: number;           // NEW: dari Doc
  namaPT: string;              // NEW: dari Doc
  namaPIC: string;             // NEW: dari Doc
  bulanTahun: string;          // Format: "Jan26"
  tanggalPeriode: string;
  nominal: number;
  items: Array<{
    no: number;
    tanggal: string;
    keterangan: string;
    jumlah: number;
    harga: number;
  }>;
  total: number;
}
```

**UI Layout:**

```
┌─────────────────────────────────────────────────────┐
│          VOUCHER PENGELUARAN                        │
│                                                     │
│  Nomor: 5 - Jan26                  PT: Maju Jaya   │
│  Tanggal: 10 Jan 2026              Nominal: 5.5 jt │
├─────────────────────────────────────────────────────┤
│ No │ Tanggal   │ Keterangan      │ Jumlah │ Harga  │
├────┼───────────┼─────────────────┼────────┼────────┤
│ 1  │ 5 Jan 26  │ Invoice #001    │   1    │ 2.5jt  │
│ 2  │ 8 Jan 26  │ Invoice #002    │   1    │ 3.0jt  │
├────┴───────────┴─────────────────┼────────┼────────┤
│                          TOTAL   │        │ 5.5jt  │
└──────────────────────────────────┴────────┴────────┘

  diajukan oleh admin         disetujui oleh BOD
                              (side approval bisa ada dua pihak)
  [_________________]         [_________________]
```

---

## 4. Technical Implementation

### 4.1 File Structure Changes

**Modified Core Files:**
```
src/lib/
  ├── types.ts          # Interface updates (Client, Doc enhancement)
  ├── constants.ts      # JENIS_PAJAK, role config updates
  ├── store.ts          # Client seed data, mock updates
  ├── services.ts       # Business logic (fixRejectedDoc, addClient, etc)
  ├── actions.ts        # Server actions (fixDocument, addNewClient)
  └── rbac.ts           # Permission matrix updates
```

**New Components:**
```
src/components/
  ├── FixDocForm.tsx       # Form untuk perbaikan dokumen rejected
  └── AddClientForm.tsx    # Form untuk tambah klien baru
```

**Modified Components:**
```
src/components/
  ├── UploadForm.tsx       # Added jenisPajak dropdown
  ├── VoucherView.tsx      # Complete redesign
  ├── QueueClient.tsx      # Added "Perbaiki" button
  ├── screens.tsx          # Added FixDocScreen, ClientManagementScreen
  └── AdminPanels.tsx      # Role updates
```

**New Pages:**
```
src/app/
  ├── support/
  │   ├── voucher/page.tsx        # Moved from /pic
  │   ├── fix/[id]/page.tsx       # Fix rejected docs
  │   └── clients/page.tsx        # Client management
  └── admin/
      └── clients/page.tsx        # Client management (admin view)
```

**Deleted:**
```
src/app/pic/                      # Entire folder removed
```

### 4.2 Data Model Changes

```typescript
// NEW ENTITY
interface Client {
  id: string;
  namaPT: string;
  namaPIC: string;
  email: string;
  phone: string;
  address: string;
  nextSequence: number;         // Auto-increment counter
}

// ENHANCED ENTITY
interface Doc {
  // Existing fields...
  
  // NEW FIELDS
  jenisPajak: JenisPajakType;   // Tax type
  nomorUrut: number;             // Client-specific sequence
  namaPT: string;                // From Client
  namaPIC: string;               // From Client
}

// STORE UPDATE
interface Store {
  // Existing...
  clients: Client[];             // NEW: Client master data
}
```

### 4.3 Key Functions

**1. createDocFromUpload** (services.ts)
```typescript
// Generates nomorUrut and increments client.nextSequence
function createDocFromUpload(user: User, input: UploadInput): Doc {
  const client = store.clients.find(c => c.id === input.klien);
  if (!client) throw new Error('Client not found');
  
  const nomorUrut = client.nextSequence;
  client.nextSequence++; // Auto-increment
  
  return {
    id: randomId(),
    ...input,
    nomorUrut,
    namaPT: client.namaPT,
    namaPIC: client.namaPIC,
    uploadedBy: user.id,
    uploadDate: new Date(),
    status: 'Menunggu Review Lead'
  };
}
```

**2. fixRejectedDoc** (services.ts)
```typescript
// Handles document fix after rejection
function fixRejectedDoc(
  user: User, 
  { docId, file, catatan }: FixInput
): Doc {
  const doc = store.docs.find(d => d.id === docId);
  if (!doc) throw new Error('Doc not found');
  if (doc.status !== 'Perlu Tindakan') {
    throw new Error('Only rejected docs can be fixed');
  }
  
  if (file) {
    doc.file = file;
    doc.uploadDate = new Date();
  }
  
  doc.catatan = catatan;
  doc.status = 'Menunggu Review Finance';
  
  store.audit.push({
    type: 'fix',
    timestamp: new Date(),
    userId: user.id,
    docId,
    hasNewFile: !!file
  });
  
  return doc;
}
```

**3. addClient** (services.ts)
```typescript
// Adds new client to master data
function addClient(
  user: User, 
  input: ClientInput
): Client {
  const client: Client = {
    id: randomId(),
    ...input,
    nextSequence: 1  // Start from 1
  };
  
  store.clients.push(client);
  
  // Backward compatibility: update KLIEN_OWNER
  store.KLIEN_OWNER.push(input.namaPT);
  
  return client;
}
```

### 4.4 RBAC Changes

**Permission Matrix:**

| Permission | Admin | Lead | Support | Finance |
|------------|-------|------|---------|---------|
| doc:upload | ❌ | ❌ | ✅ | ❌ |
| doc:view | ✅ | ✅ | ✅ | ✅ |
| doc:review-lead | ❌ | ✅ | ❌ | ❌ |
| doc:review-finance | ❌ | ❌ | ❌ | ✅ |
| doc:fix | ❌ | ❌ | ✅ | ❌ |
| client:manage | ✅ | ❌ | ✅ | ❌ |
| audit:view | ✅ | ✅ | ❌ | ✅ |
| user:manage | ✅ | ❌ | ❌ | ❌ |

**Key Changes:**
- ❌ Removed: `pic` role entirely
- ✅ Added: `doc:fix` permission for Support
- ✅ Added: `client:manage` permission for Admin & Support

---

## 5. User Impact Analysis

### 5.1 Role: System Admin

**Changes:**
- ✅ New feature: Client management UI
- ✅ New tab: "Data Klien" in navigation
- ⚠️ Migration task: Assign existing 'pic' users to 'support' role

**Training Needed:**
- How to add new clients
- Understanding new voucher format

**Effort Estimate:** 30 minutes

---

### 5.2 Role: Intake Support (formerly PIC + Support)

**Changes:**
- ✅ Consolidated responsibilities (no more confusion with PIC)
- ✅ New field: Jenis Pajak (mandatory in upload form)
- ✅ New workflow: Fix rejected documents
- ✅ New feature: Client management
- ✅ New route: `/support/voucher` (moved from `/pic/voucher`)

**Training Needed:**
- Tax type selection guidelines
- How to fix rejected documents (re-upload vs notes-only)
- How to add new clients
- New voucher format review

**Effort Estimate:** 1 hour

---

### 5.3 Role: Lead Reviewer

**Changes:**
- ℹ️ No direct changes (workflow unchanged)
- ℹ️ Will see new fields in document details (tax type, PT/PIC names)

**Training Needed:**
- Awareness of new fields (informational only)

**Effort Estimate:** 15 minutes

---

### 5.4 Role: Finance Reviewer

**Changes:**
- ✅ New action: Reject voucher with reason
- ✅ New field visible: Jenis Pajak
- ✅ New voucher format (print-ready)
- ℹ️ Rejected docs return to Support queue automatically

**Training Needed:**
- When and how to reject documents
- How to write effective rejection reasons
- New voucher format familiarization

**Effort Estimate:** 45 minutes

---

## 6. Testing Strategy

### 6.1 Unit Testing Checklist

**Business Logic:**
- [ ] `createDocFromUpload` increments client.nextSequence correctly
- [ ] `addClient` initializes nextSequence to 1
- [ ] `fixRejectedDoc` handles both file re-upload and notes-only scenarios
- [ ] `decide` with action='tolak' sets status to 'Perlu Tindakan'
- [ ] Tax type validation (cannot be empty)

**Data Integrity:**
- [ ] Client.nextSequence never decrements
- [ ] nomorUrut is unique per client
- [ ] Rejected docs have audit trail with rejection reason

---

### 6.2 Integration Testing Checklist

**Upload Flow:**
- [ ] User selects client → system shows "Nomor urut berikutnya: X"
- [ ] User uploads doc → nomorUrut assigned correctly
- [ ] User uploads 2nd doc for same client → nomorUrut increments
- [ ] Tax type is required (form validation)

**Rejection Flow:**
- [ ] Finance rejects → doc status = 'Perlu Tindakan'
- [ ] Doc appears in Support queue with "Perlu Tindakan" filter
- [ ] Support fixes (re-upload) → file replaced, status = 'Menunggu Review Finance'
- [ ] Support fixes (notes only) → file unchanged, status = 'Menunggu Review Finance'
- [ ] Fixed doc returns to Finance queue

**Client Management:**
- [ ] Admin adds client → appears in client list
- [ ] Support adds client → appears in client list
- [ ] Lead/Finance cannot access client management page (403)
- [ ] New client has nextSequence = 1

**Voucher Format:**
- [ ] Voucher displays correct header "Voucher pengeluaran"
- [ ] Nomor format: `[nomorUrut] - [bulan][tahun]`
- [ ] Table has 5 columns with correct data
- [ ] Signatures: "diajukan oleh admin" dan "disetujui oleh BOD"
- [ ] Note displayed: "side approval bisa ada dua pihak"

---

### 6.3 User Acceptance Testing (UAT)

**Scenario 1: Intake Support Daily Workflow**
1. Login as Intake Support
2. Navigate to "Data Klien" → Add new client "PT Berkah"
3. Navigate to "Upload" → Select client "PT Berkah"
4. Verify "Nomor urut berikutnya: 1" displayed
5. Upload invoice, select "PPh 23" for tax type
6. Submit → verify doc created with nomorUrut=1
7. Upload another invoice for "PT Berkah"
8. Verify nomorUrut=2
9. Navigate to queue → find rejected doc
10. Click "Perbaiki" → edit notes → submit
11. Verify doc returns to Finance queue

**Scenario 2: Finance Review & Rejection**
1. Login as Finance Reviewer
2. Navigate to queue → open voucher
3. Verify voucher format matches template (header, table, signatures)
4. Click "Tolak" → enter reason "Invoice tidak lengkap"
5. Verify doc removed from Finance queue
6. Verify audit trail shows rejection

**Scenario 3: Admin Client Management**
1. Login as System Admin
2. Navigate to "Data Klien"
3. Verify list shows all clients with nextSequence values
4. Add new client "PT Maju Jaya"
5. Verify client appears in list with nextSequence=1

---

## 7. Migration Plan

### 7.1 Data Migration

**Step 1: Create Client Master Data**
```typescript
// Extract unique clients from existing docs
const uniqueClients = [...new Set(docs.map(d => d.klien))];

// Create Client entities
const clients = uniqueClients.map(klien => ({
  id: randomId(),
  namaPT: klien,
  namaPIC: 'Legacy PIC', // Placeholder, update manually
  email: `${klien}@example.com`, // Placeholder
  phone: '-',
  address: '-',
  nextSequence: 1 // Will be updated next
}));
```

**Step 2: Assign nomorUrut to Existing Docs**
```typescript
// Group docs by client, sort by date
const docsByClient = groupBy(docs, 'klien');

docsByClient.forEach((clientDocs, klien) => {
  clientDocs.sort((a, b) => a.uploadDate - b.uploadDate);
  
  clientDocs.forEach((doc, index) => {
    doc.nomorUrut = index + 1;
    doc.namaPT = klien;
    doc.namaPIC = 'Legacy PIC'; // Placeholder
  });
  
  // Update client.nextSequence
  const client = clients.find(c => c.namaPT === klien);
  client.nextSequence = clientDocs.length + 1;
});
```

**Step 3: Add Default Tax Type**
```typescript
// For existing docs without jenisPajak
docs.forEach(doc => {
  if (!doc.jenisPajak) {
    doc.jenisPajak = 'Tidak ada'; // Default value
  }
});
```

**Step 4: User Role Migration**
```typescript
// Change all 'pic' users to 'support'
users.forEach(user => {
  if (user.role === 'pic') {
    user.role = 'support';
  }
});
```

### 7.2 Rollout Plan

**Phase 1: Soft Launch (Week 1)**
- Deploy to staging environment
- UAT with 2 users per role
- Fix critical bugs
- Update training materials based on feedback

**Phase 2: Production Deploy (Week 2)**
- Run data migration scripts (with backup)
- Deploy to production (off-hours)
- Monitor error logs for 24 hours
- Have rollback plan ready

**Phase 3: Training (Week 2-3)**
- Conduct training sessions per role
- Distribute quick reference guides
- Set up support channel for questions

**Phase 4: Post-Launch Monitoring (Week 3-4)**
- Daily check: error rates, user feedback
- Weekly review: feature adoption metrics
- Collect feedback for iterations

---

## 8. Success Metrics

### 8.1 Quantitative Metrics

| Metric | Baseline | Target | Measurement |
|--------|----------|--------|-------------|
| Document processing time | - | Track avg time | System analytics |
| Rejection rate | - | < 10% | Count rejected/total |
| Client data completeness | 0% | 95% | % clients with full info |
| Tax type compliance | 0% | 100% | % docs with tax type |
| User error rate (upload) | - | < 5% | Support tickets |

### 8.2 Qualitative Metrics

**User Satisfaction Survey (post 1 month):**
- Role clarity improved? (Likert 1-5)
- Rejection workflow helpful? (Likert 1-5)
- Voucher format better? (Likert 1-5)
- Overall satisfaction (Likert 1-5)

**Target:** Average score ≥ 4.0/5.0

---

## 9. Risk & Mitigation

### 9.1 Technical Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Data migration errors | Medium | High | Thorough testing in staging, backup before migration, rollback plan |
| Performance degradation (client.nextSequence locking) | Low | Medium | Use optimistic locking, monitor query performance |
| File loss during re-upload | Low | High | Backup old file before replacing, keep version history |

### 9.2 User Adoption Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Users forget to select tax type | High | Medium | Make field mandatory, add validation, show error message |
| Confusion with new rejection workflow | Medium | Medium | Clear training, in-app tooltips, support hotline |
| Resistance to role consolidation | Low | Low | Communicate benefits early, involve users in UAT |

---

## 10. Future Enhancements

### 10.1 Short-term (Next 3 months)

1. **Bulk Client Import**
   - CSV upload untuk mass import client data
   - Validation rules untuk data consistency

2. **Tax Report Generator**
   - Monthly report grouped by jenisPajak
   - Export to Excel for tax filing

3. **Email Notifications**
   - Auto-notify Support when doc rejected
   - Include rejection reason in email

### 10.2 Long-term (6-12 months)

1. **Advanced Analytics**
   - Dashboard: docs per client, rejection trends
   - Predictive alerts for high-risk documents

2. **Document Version Control**
   - Keep history of all uploaded versions
   - Compare versions side-by-side

3. **Multi-level Approval for BOD**
   - Digital signature integration
   - Two-person approval workflow (as noted in voucher)

---

## 11. Appendix

### 11.1 Related Documents

- [BPMN & RBAC Specification](./01-bpmn-rbac-user-stories.md)
- [Update Halaman Login](./02-update-halaman-login.md)
- [README - Project Overview](./README.md)

### 11.2 Key Stakeholders

| Role | Name | Responsibility |
|------|------|----------------|
| Product Owner | TBD | Feature prioritization, UAT sign-off |
| Tech Lead | TBD | Architecture review, code review |
| QA Lead | TBD | Test strategy, UAT coordination |
| Training Lead | TBD | Training materials, user onboarding |

### 11.3 Glossary

- **PIC**: Person In Charge (klien contact person)
- **PT**: Perseroan Terbatas (Indonesian company legal form)
- **PPh**: Pajak Penghasilan (Income Tax)
- **PPN**: Pajak Pertambahan Nilai (Value Added Tax)
- **BOD**: Board of Directors
- **UAT**: User Acceptance Testing
- **RBAC**: Role-Based Access Control

### 11.4 Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | Oct 13, 2026 | Dev Team | Initial PRD after implementation |

---

**Document Status:** ✅ Approved for Implementation (Already Implemented)  
**Next Review Date:** December 2026
