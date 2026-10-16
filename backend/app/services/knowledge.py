from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.knowledge import KnowledgeDocument

REPOSITORY_KNOWLEDGE: list[dict[str, str]] = [
    {
        "slug": "amiga-overview",
        "title": "Gambaran umum AMIGA",
        "source": "frontend/docs/01-bpmn-rbac-user-stories.md",
        "content": (
            "AMIGA adalah sistem intake dokumen hybrid dengan ruang kerja terpisah "
            "untuk Intake Support, Robot Admin atau AI Engine, Finance Reviewer, "
            "Service Lead, dan System Admin. Alur utama adalah unggah dokumen, "
            "ekstraksi dan validasi, review Finance, persetujuan, lalu pembuatan "
            "voucher. Persetujuan pembayaran oleh Client Approver dilakukan di luar "
            "AMIGA."
        ),
    },
    {
        "slug": "document-intake",
        "title": "Unggah dan pemrosesan dokumen",
        "source": "frontend/docs/01-bpmn-rbac-user-stories.md",
        "content": (
            "Intake Support memilih klien, mengunggah dokumen invoice, dan mengisi "
            "metadata seperti jenis permintaan, jenis pajak, channel, tanggal, serta "
            "catatan. Robot Admin memvalidasi file, mengekstrak data, dan memeriksa "
            "aturan bisnis. Jika pemeriksaan gagal atau data perlu diperbaiki, "
            "dokumen kembali ke Intake Support untuk diperbaiki dan dikirim ulang."
        ),
    },
    {
        "slug": "finance-review-and-segregation",
        "title": "Review Finance dan pemisahan tugas",
        "source": "frontend/docs/01-bpmn-rbac-user-stories.md",
        "content": (
            "Finance Reviewer memeriksa dan dapat mengoreksi hasil ekstraksi. "
            "Finance dapat menyetujui, menolak kembali ke Intake Support, atau "
            "meminta informasi. Reviewer tidak boleh meninjau dokumen yang diunggah "
            "sendiri. Hanya persetujuan Finance yang memicu pembuatan voucher; "
            "pembayaran klien tetap berada di luar aplikasi."
        ),
    },
    {
        "slug": "role-permissions",
        "title": "Peran dan batas akses",
        "source": "frontend/docs/01-bpmn-rbac-user-stories.md",
        "content": (
            "Intake Support mengunggah, memperbaiki, mengirim ulang dokumen, dan "
            "melihat klien yang ditugaskan. Finance Reviewer hanya melihat tugas "
            "review yang ditugaskan dan tidak dapat menyetujui unggahan sendiri. "
            "Service Lead memantau beban kerja dan mengalihkan reviewer, tanpa "
            "mengakses isi atau nilai transaksi. System Admin mengelola akun, "
            "delegasi, dan data klien, tetapi tidak menyetujui transaksi. Akses "
            "ditentukan server berdasarkan role dan cakupan data."
        ),
    },
    {
        "slug": "lead-workload",
        "title": "Pemantauan dan penugasan oleh Service Lead",
        "source": "backend/README.md",
        "content": (
            "Service Lead memantau status, klien, reviewer, pengunggah, dan tanggal "
            "jatuh tempo. Lead dapat mengalihkan submission terbuka kepada Finance "
            "Reviewer dan mengelola penugasan klien kepada Intake Support. Lead "
            "tidak menerima isi dokumen atau jumlah transaksi. Perubahan penugasan "
            "dan pengalihan reviewer dicatat pada audit."
        ),
    },
    {
        "slug": "tax-types",
        "title": "Jenis pajak invoice",
        "source": "frontend/docs/03-prd-frontend-updates.md",
        "content": (
            "Jenis pajak yang dapat dicatat pada invoice adalah PPh 21, PPh 23, "
            "PPh 4 ayat 2, PPN, PPh Final, atau Tidak ada. Jenis pajak disimpan "
            "bersama dokumen untuk ditinjau Finance dan mendukung pelacakan audit. "
            "Tarif pajak harus dikonfirmasi terhadap ketentuan yang berlaku; "
            "aplikasi tidak boleh mengarang tarif."
        ),
    },
    {
        "slug": "voucher-generation",
        "title": "Pembuatan voucher dan tanda tangan",
        "source": "backend/README.md",
        "content": (
            "Voucher dibuat atau diperbarui setelah submission disetujui Finance. "
            "Tanda tangan Finance yang terdaftar diterapkan otomatis pada voucher. "
            "Area tanda tangan BOD dibiarkan kosong agar BOD menandatangani secara "
            "manual. Dokumen invoice sumber digabungkan setelah halaman voucher. "
            "Intake Support hanya dapat melihat voucher untuk submission miliknya."
        ),
    },
    {
        "slug": "client-and-vendor-management",
        "title": "Klien, vendor, dan penugasan",
        "source": "backend/README.md",
        "content": (
            "System Admin dapat menambah, mengubah, dan menghapus vendor. Data "
            "vendor mencakup nama perusahaan, PIC, dan email; telepon serta alamat "
            "opsional. Data klien yang terhubung dipakai untuk pilihan unggah. "
            "Service Lead menetapkan klien kepada Intake Support; riwayat "
            "penugasan disimpan dalam audit."
        ),
    },
]


async def retrieve_repository_knowledge(
    session: AsyncSession, query: str, limit: int = 4
) -> list[str]:
    search_vector = func.to_tsvector(
        "simple", KnowledgeDocument.title + " " + KnowledgeDocument.content
    )
    search_query = func.plainto_tsquery("simple", query)
    statement = (
        select(
            KnowledgeDocument.title,
            KnowledgeDocument.content,
            KnowledgeDocument.source,
        )
        .where(search_vector.op("@@")(search_query))
        .order_by(func.ts_rank_cd(search_vector, search_query).desc())
        .limit(limit)
    )
    result = await session.execute(statement)
    return [
        f"{row.title} (Sumber: {row.source})\n{row.content}" for row in result.all()
    ]


async def seed_repository_knowledge(session: AsyncSession) -> int:
    statement = (
        insert(KnowledgeDocument)
        .values(REPOSITORY_KNOWLEDGE)
        .on_conflict_do_nothing(index_elements=[KnowledgeDocument.slug])
    )
    result = await session.execute(statement)
    return result.rowcount or 0
