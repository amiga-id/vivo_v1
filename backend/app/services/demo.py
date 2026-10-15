from copy import deepcopy
from datetime import UTC, date, datetime, timedelta
from typing import Any

from app.schemas.demo import (
    AccessDecision,
    DemoAccessRequest,
    DemoAssignment,
    DemoAuditEvent,
    DemoClientSummary,
    DemoDocument,
    DemoDocumentSummary,
    DemoFields,
    DemoItem,
    DemoTaxLine,
    DemoUploadRequest,
    DemoUser,
    DemoVoucher,
    DemoWorkloadRow,
    Role,
)

DEMO_PASSWORD = "amiga2026"  # noqa: S105


class DemoError(Exception):
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.status_code = status_code


class DemoState:
    def __init__(self) -> None:
        self.users = [
            DemoUser(
                id="dewi",
                name="Dewi Lestari",
                role="support",
                about=(
                    "Intake Support untuk PT Maju Jaya, CV Sinar Abadi, "
                    "Koperasi Sejahtera."
                ),
                email="dewi@amiga.demo",
            ),
            DemoUser(
                id="eko",
                name="Eko Prasetyo",
                role="support",
                about="Intake Support untuk PT Karya Nusa, UD Berkah Tani.",
                email="eko@amiga.demo",
            ),
            DemoUser(
                id="andi",
                name="Andi Saputra",
                role="support",
                about="Mengunggah dan menindaklanjuti dokumen.",
                email="andi@amiga.demo",
            ),
            DemoUser(
                id="rina",
                name="Rina Wijaya",
                role="finance",
                about="Memeriksa dan menyetujui dokumen.",
                email="rina@amiga.demo",
            ),
            DemoUser(
                id="hana",
                name="Hana Putri",
                role="finance",
                about="Memeriksa dan menyetujui dokumen.",
                email="hana@amiga.demo",
            ),
            DemoUser(
                id="bayu",
                name="Bayu Kurniawan",
                role="lead",
                about="Memantau beban kerja tim.",
                email="bayu@amiga.demo",
            ),
            DemoUser(
                id="sari",
                name="Sari Anggraini",
                role="admin",
                about="Mengelola akun, hak akses, dan klien.",
                email="sari@amiga.demo",
            ),
        ]
        self.credentials = {user.email: (user.id, DEMO_PASSWORD) for user in self.users}
        self.clients: dict[str, dict[str, Any]] = {
            "PT Maju Jaya": {
                "code": "MJ",
                "nama_pic": "Budi Santoso",
                "next_sequence": 8,
                "counter": 7,
            },
            "CV Sinar Abadi": {
                "code": "SA",
                "nama_pic": "Siti Aminah",
                "next_sequence": 4,
                "counter": 3,
            },
            "Koperasi Sejahtera": {
                "code": "KS",
                "nama_pic": "Ahmad Yani",
                "next_sequence": 13,
                "counter": 12,
            },
            "UD Berkah Tani": {
                "code": "UB",
                "nama_pic": "Dewi Kusuma",
                "next_sequence": 1,
                "counter": 0,
            },
            "PT Karya Nusa": {
                "code": "KN",
                "nama_pic": "Rudi Hartono",
                "next_sequence": 5,
                "counter": 4,
            },
        }
        self.assignments = [
            DemoAssignment(
                id="A-1",
                support_id="dewi",
                klien=["PT Maju Jaya", "CV Sinar Abadi", "Koperasi Sejahtera"],
            ),
            DemoAssignment(
                id="A-2",
                support_id="eko",
                klien=["PT Karya Nusa", "UD Berkah Tani"],
            ),
        ]
        self.documents = [
            self._document(
                "D-1041",
                "INV-2026-0141",
                "PT Maju Jaya",
                "PT Maju Jaya Logistik",
                "dewi",
                "rina",
                "Dalam Review",
                12_500_000,
                [
                    self._tax("PPN", "PPN", 11, "add"),
                    self._tax("PPH23", "PPh 23", 2, "withhold"),
                ],
            ),
            self._document(
                "D-1042",
                "INV-0098",
                "CV Sinar Abadi",
                "CV Sinar Abadi",
                "andi",
                "rina",
                "Dikembalikan",
                4_200_000,
                None,
                issue="Total tidak sama dengan DPP + PPN",
                total=4_862_000,
                source_total=4_662_000,
            ),
            self._document(
                "D-1043",
                "INV-77/XI",
                "PT Karya Nusa",
                "PT Karya Nusa Prima",
                "rina",
                "rina",
                "Dalam Review",
                9_000_000,
                [
                    self._tax("PPN", "PPN", 11, "add"),
                    self._tax("PPH23", "PPh 23", 2, "withhold"),
                ],
            ),
            self._document(
                "D-1039",
                "INV-5520",
                "Koperasi Sejahtera",
                "Koperasi Sejahtera",
                "dewi",
                "rina",
                "Disetujui",
                6_000_000,
                [self._tax("PPN", "PPN", 11, "add")],
                voucher_no="VCH-KS-0012",
            ),
            self._document(
                "D-1044",
                "INV-0311",
                "UD Berkah Tani",
                "UD Berkah Tani",
                "andi",
                "hana",
                "Diproses",
                3_000_000,
                None,
            ),
            self._document(
                "D-1045",
                "INV-2210",
                "PT Maju Jaya",
                "PT Maju Jaya Logistik",
                "eko",
                "hana",
                "Dalam Review",
                2_000_000,
                None,
            ),
        ]
        self.requests = [
            DemoAccessRequest(
                id="R-3",
                type="reset",
                by="hana",
                text="Hana meminta atur ulang akses masuk akun.",
                date=date.today().isoformat(),
            ),
        ]
        self.events = [
            DemoAuditEvent(
                k="doc",
                d="D-1041",
                t=self._stamp(1, "09:12"),
                a="Dewi Lestari (Intake Support)",
                w="Dokumen diunggah",
                x="Metadata: Pembayaran vendor.",
            ),
            DemoAuditEvent(
                k="doc",
                d="D-1041",
                t=self._stamp(1, "09:13"),
                a="Robot Admin",
                w="Ekstraksi selesai",
                x="8 field terbaca. Satu field berkeyakinan rendah (rekening tujuan).",
                bot=True,
            ),
            DemoAuditEvent(
                k="doc",
                d="D-1042",
                t=self._stamp(2, "15:40"),
                a="Andi Saputra (Intake Support)",
                w="Dokumen diunggah untuk CV Sinar Abadi",
                x="",
            ),
            DemoAuditEvent(
                k="doc",
                d="D-1042",
                t=self._stamp(2, "15:41"),
                a="Robot Admin",
                w="Aturan bisnis ditandai",
                x="Total tidak sama dengan DPP + PPN.",
                bot=True,
            ),
            DemoAuditEvent(
                k="admin",
                d="",
                t=self._stamp(12, "10:00"),
                a="Sari Anggraini (System Admin)",
                w="Klien didaftarkan",
                x="PT Karya Nusa ditambahkan.",
            ),
            DemoAuditEvent(
                k="admin",
                d="",
                t=self._stamp(10, "09:00"),
                a="Bayu Kurniawan (Service Lead)",
                w="Penugasan klien diperbarui",
                x="Dewi: PT Maju Jaya, CV Sinar Abadi, Koperasi Sejahtera.",
            ),
        ]
        self.document_sequence = 1046
        self.request_sequence = 4

    @staticmethod
    def _stamp(days_ago: int, clock: str) -> str:
        day = date.today() - timedelta(days=days_ago)
        return f"{day.isoformat()}T{clock}:00"

    @staticmethod
    def _tax(code: str, label: str, rate: float, kind: str) -> DemoTaxLine:
        return DemoTaxLine(code=code, label=label, rate=rate, kind=kind)

    def _document(
        self,
        doc_id: str,
        number: str,
        client: str,
        vendor: str,
        uploader: str,
        reviewer: str,
        status: str,
        dpp: int,
        taxes: list[DemoTaxLine] | None,
        issue: str = "",
        total: int | None = None,
        source_total: int | None = None,
        voucher_no: str | None = None,
    ) -> DemoDocument:
        today = date.today()
        invoice_date = (today - timedelta(days=1)).isoformat()
        client_info = self.clients[client]
        fields = DemoFields(
            no=number,
            tgl=invoice_date,
            vendor=vendor,
            npwp="01.234.567.8-091.000",
            dpp=dpp,
            ppn=round(dpp * 0.11),
            total=total if total is not None else dpp + round(dpp * 0.11),
            rek="BCA 0123456789",
        )
        source = fields.model_copy(deep=True)
        if source_total is not None:
            source.total = source_total
        confidence = {
            "no": 0.98,
            "tgl": 0.97,
            "vendor": 0.95,
            "npwp": 0.93,
            "dpp": 0.96,
            "ppn": 0.94,
            "total": 0.71 if source_total is not None else 0.97,
            "rek": 0.9,
        }
        return DemoDocument(
            id=doc_id,
            no=number,
            nomor_urut=client_info["next_sequence"] - 1,
            klien=client,
            nama_pt=client,
            nama_pic=client_info["nama_pic"],
            jenis="Pembayaran vendor",
            tgl=invoice_date,
            deadline=(today + timedelta(days=2)).isoformat(),
            status=status,  # type: ignore[arg-type]
            owner=uploader,
            uploader=uploader,
            reviewer=reviewer,
            issue=issue,
            f=fields,
            conf=confidence,
            src=source,
            has_file=False,
            items=[
                DemoItem(
                    tgl=invoice_date,
                    ket="Jasa layanan periode berjalan",
                    jumlah="1 paket",
                    harga=round(dpp * 0.7),
                ),
                DemoItem(
                    tgl=invoice_date,
                    ket="Biaya tambahan",
                    jumlah="1 paket",
                    harga=dpp - round(dpp * 0.7),
                ),
            ],
            tax=deepcopy(taxes),
            approvers=2 if doc_id == "D-1043" else 1,
            voucher_no=voucher_no,
        )

    def user(self, user_id: str) -> DemoUser:
        user = next((item for item in self.users if item.id == user_id), None)
        if user is None:
            raise DemoError("Pengguna demo tidak ditemukan.", 401)
        if user.status != "Aktif":
            raise DemoError("Akun demo belum aktif.", 403)
        return user

    def require_role(self, user: DemoUser, *roles: Role) -> None:
        if user.role not in roles:
            raise DemoError("Peran tidak memiliki izin untuk tindakan ini.", 403)

    def document(self, doc_id: str) -> DemoDocument:
        document = next((item for item in self.documents if item.id == doc_id), None)
        if document is None:
            raise DemoError("Dokumen tidak ditemukan.", 404)
        return document

    @staticmethod
    def assigned_clients(user_id: str, assignments: list[DemoAssignment]) -> list[str]:
        assignment = next(
            (item for item in assignments if item.support_id == user_id), None
        )
        return assignment.klien if assignment else []

    @staticmethod
    def summary(document: DemoDocument) -> DemoDocumentSummary:
        return DemoDocumentSummary(
            id=document.id,
            no=document.no,
            nomor_urut=document.nomor_urut,
            klien=document.klien,
            nama_pt=document.nama_pt,
            nama_pic=document.nama_pic,
            jenis=document.jenis,
            deadline=document.deadline,
            status=document.status,
            issue=document.issue,
            uploader=document.uploader,
            owner=document.owner,
            reviewer=document.reviewer,
            tax_set=document.tax is not None,
            voucher_no=document.voucher_no,
        )

    def queue(self, user: DemoUser) -> list[DemoDocumentSummary]:
        if user.role == "support":
            docs = [
                doc
                for doc in self.documents
                if doc.uploader == user.id
                or (doc.status == "Dikembalikan" and doc.owner == user.id)
            ]
        elif user.role == "finance":
            docs = [
                doc
                for doc in self.documents
                if doc.reviewer == user.id and doc.uploader != user.id
            ]
        elif user.role == "lead":
            raise DemoError("Gunakan endpoint workload untuk Service Lead.", 403)
        else:
            raise DemoError("Admin mengelola antrean melalui access-requests.", 403)
        return [self.summary(doc) for doc in docs]

    def workload(self, user: DemoUser) -> list[DemoWorkloadRow]:
        self.require_role(user, "lead", "admin")
        return [
            DemoWorkloadRow(
                id=doc.id,
                no=doc.no,
                klien=doc.klien,
                jenis=doc.jenis,
                deadline=doc.deadline,
                status=doc.status,
                reviewer=doc.reviewer,
                uploader=doc.uploader,
                conflict=doc.reviewer == doc.uploader,
            )
            for doc in self.documents
        ]

    def accessible_document(self, user: DemoUser, doc: DemoDocument) -> None:
        if user.role == "support":
            if doc.uploader != user.id and not (
                doc.status == "Dikembalikan" and doc.owner == user.id
            ):
                raise DemoError("Dokumen berada di luar cakupan akses Anda.", 403)
        elif user.role == "finance":
            if doc.reviewer != user.id or doc.uploader == user.id:
                raise DemoError("Dokumen berada di luar cakupan akses Anda.", 403)
        else:
            raise DemoError("Peran tidak dapat membaca isi dokumen.", 403)

    def audit(self, user: DemoUser) -> list[DemoAuditEvent]:
        if user.role == "support":
            allowed = {
                doc.id
                for doc in self.documents
                if doc.uploader == user.id
                or (doc.status == "Dikembalikan" and doc.owner == user.id)
            }
            events = [
                event
                for event in self.events
                if event.k == "doc" and event.d in allowed
            ]
        elif user.role == "finance":
            allowed = {
                doc.id
                for doc in self.documents
                if doc.reviewer == user.id and doc.uploader != user.id
            }
            events = [
                event
                for event in self.events
                if event.k == "doc" and event.d in allowed
            ]
        elif user.role == "lead":
            events = [
                event
                for event in self.events
                if event.k == "workload"
                or (event.k == "admin" and "Penugasan" in event.w)
            ]
        else:
            events = [
                event for event in self.events if event.k in ("admin", "security")
            ]
        return list(reversed(events))

    def add_event(
        self, kind: str, doc_id: str, actor: DemoUser, title: str, detail: str
    ) -> None:
        self.events.append(
            DemoAuditEvent(
                k=kind,  # type: ignore[arg-type]
                d=doc_id,
                t=datetime.now(UTC).isoformat(),
                a=f"{actor.name} ({actor.role})",
                w=title,
                x=detail,
            )
        )

    def client_summaries(self, user: DemoUser) -> list[DemoClientSummary]:
        self.require_role(user, "admin")
        results = []
        for name, info in self.clients.items():
            assignees = [
                next(
                    (u.name for u in self.users if u.id == assignment.support_id),
                    assignment.support_id,
                )
                for assignment in self.assignments
                if name in assignment.klien
            ]
            results.append(
                DemoClientSummary(
                    name=name,
                    code=info["code"],
                    docs=sum(doc.klien == name for doc in self.documents),
                    assignees=assignees,
                )
            )
        return results

    def vouchers(self, user: DemoUser) -> list[DemoDocumentSummary]:
        self.require_role(user, "support", "finance")
        return [
            self.summary(doc)
            for doc in self.documents
            if doc.status == "Disetujui"
            and (
                (user.role == "support" and doc.uploader == user.id)
                or (
                    user.role == "finance"
                    and doc.reviewer == user.id
                    and doc.uploader != user.id
                )
            )
        ]

    def voucher(self, user: DemoUser, doc_id: str) -> DemoVoucher:
        doc = self.document(doc_id)
        self.accessible_document(user, doc)
        if doc.status != "Disetujui":
            raise DemoError("Voucher baru terbit setelah dokumen disetujui.", 409)
        taxes = doc.tax or []
        additions = sum(
            round(doc.f.dpp * tax.rate / 100) for tax in taxes if tax.kind == "add"
        )
        withholdings = sum(
            round(doc.f.dpp * tax.rate / 100) for tax in taxes if tax.kind == "withhold"
        )
        rows: list[dict[str, str | int | bool | None]] = [
            {
                "no": index,
                "tgl": item.tgl,
                "ket": item.ket,
                "jumlah": item.jumlah,
                "harga": item.harga,
            }
            for index, item in enumerate(doc.items, start=1)
        ]
        rows.append(
            {
                "no": "",
                "tgl": "",
                "ket": "Subtotal (DPP)",
                "jumlah": "",
                "harga": doc.f.dpp,
                "sub": True,
            }
        )
        for tax in taxes:
            amount = round(doc.f.dpp * tax.rate / 100)
            tax_action = "ditambahkan" if tax.kind == "add" else "dipotong"
            rows.append(
                {
                    "no": "",
                    "tgl": "",
                    "ket": f"{tax.label} ({tax_action})",
                    "jumlah": f"{tax.rate:g}%",
                    "harga": amount if tax.kind == "add" else -amount,
                    "tax": True,
                }
            )
        return DemoVoucher(
            id=doc.id,
            no=doc.no,
            number=doc.voucher_no,
            nomor_urut=doc.nomor_urut,
            klien=doc.klien,
            nama_pt=doc.nama_pt,
            nama_pic=doc.nama_pic,
            status=doc.status,
            reviewer=next(
                (u.name for u in self.users if u.id == doc.reviewer), doc.reviewer
            ),
            submitter=next(
                (u.name for u in self.users if u.id == doc.owner), doc.owner
            ),
            nama=doc.f.vendor,
            perusahaan=doc.klien,
            periode=doc.f.tgl,
            nominal=doc.f.dpp + additions - withholdings,
            dpp=doc.f.dpp,
            add=additions,
            withhold=withholdings,
            tax_text="; ".join(f"{tax.label} {tax.rate:g}%" for tax in taxes)
            or "Tanpa pajak",
            rows=rows,
            total=doc.f.dpp + additions - withholdings,
            approvers=doc.approvers,
            f={
                "vendor": doc.f.vendor,
                "no": doc.f.no,
                "rek": doc.f.rek,
                "dpp": doc.f.dpp,
                "ppn": doc.f.ppn,
                "total": doc.f.total,
            },
        )


state = DemoState()


def reset_demo_state() -> None:
    global state
    state = DemoState()


def decide_access_request(
    user: DemoUser, request_id: str, decision: AccessDecision, demo_state: DemoState
) -> str:
    demo_state.require_role(user, "admin")
    request = next(
        (item for item in demo_state.requests if item.id == request_id), None
    )
    if request is None:
        raise DemoError("Permintaan tidak ditemukan.", 404)
    demo_state.requests.remove(request)
    demo_state.add_event(
        "admin",
        "",
        user,
        (
            "Permintaan akses disetujui"
            if decision.approved
            else "Permintaan akses ditolak"
        ),
        request.text,
    )
    return "Permintaan disetujui." if decision.approved else "Permintaan ditolak."


def public_user(user: DemoUser) -> DemoUser:
    return user.model_copy(deep=True)


def upload_document(
    user: DemoUser, request: DemoUploadRequest, demo_state: DemoState
) -> DemoDocument:
    demo_state.require_role(user, "support")
    if request.klien not in demo_state.clients:
        raise DemoError("Klien tidak dikenal.")
    if request.klien not in demo_state.assigned_clients(
        user.id, demo_state.assignments
    ):
        raise DemoError(f"Klien {request.klien} belum ditugaskan kepada Anda.", 403)
    reviewers = [
        item
        for item in demo_state.users
        if item.role == "finance" and item.status == "Aktif"
    ]
    if not reviewers:
        raise DemoError("Belum ada Finance Reviewer aktif.", 409)
    demo_state.document_sequence += 1
    client = demo_state.clients[request.klien]
    doc_id = f"D-{demo_state.document_sequence}"
    fields = DemoFields(
        no=f"INV-{demo_state.document_sequence}",
        tgl=request.tgl,
        vendor=f"{request.klien} (vendor)",
        npwp="06.789.012.3-456.000",
        dpp=8_000_000,
        ppn=880_000,
        total=8_880_000,
        rek="BCA 1122334455",
    )
    document = DemoDocument(
        id=doc_id,
        no=fields.no,
        nomor_urut=client["next_sequence"],
        klien=request.klien,
        nama_pt=request.klien,
        nama_pic=client["nama_pic"],
        jenis=request.jenis,
        tgl=request.tgl,
        deadline=(date.today() + timedelta(days=7)).isoformat(),
        status="Diproses",
        owner=user.id,
        uploader=user.id,
        reviewer=reviewers[0].id,
        note=request.cat,
        f=fields,
        conf={
            "no": 0.98,
            "tgl": 0.97,
            "vendor": 0.95,
            "npwp": 0.93,
            "dpp": 0.96,
            "ppn": 0.94,
            "total": 0.97,
            "rek": 0.9,
        },
        src=fields.model_copy(deep=True),
        items=[
            DemoItem(
                tgl=request.tgl,
                ket="Jasa layanan periode berjalan",
                jumlah="1 paket",
                harga=5_600_000,
            ),
            DemoItem(
                tgl=request.tgl,
                ket="Biaya tambahan",
                jumlah="1 paket",
                harga=2_400_000,
            ),
        ],
        tax=request.tax or None,
        approvers=request.approvers,
    )
    client["next_sequence"] += 1
    demo_state.documents.append(document)
    demo_state.add_event(
        "doc",
        doc_id,
        user,
        "Dokumen diunggah",
        f"File {request.file_name}. Klien {request.klien}, {request.jenis}.",
    )
    return document
