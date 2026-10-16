import enum
from sqlalchemy import (
    Column, BigInteger, Integer, String, Text, Boolean, Date, DateTime,
    Numeric, JSON, Enum, ForeignKey, CheckConstraint, UniqueConstraint, Index,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

try:
    from ..database import Base
except ImportError:
    from database import Base  # sesuaikan dengan lokasi Base di project Anda

# JSONB di PostgreSQL, JSON biasa di database lain
JsonType = JSON().with_variant(JSONB(), "postgresql")


# ──────────────────────────── Enum ────────────────────────────

class InvoiceStatus(str, enum.Enum):
    UPLOADED       = "UPLOADED"        # diunggah PIC Klien / Intake Support
    PROCESSING     = "PROCESSING"      # Robot Admin sedang ekstraksi (Bedrock)
    NEEDS_ACTION   = "NEEDS_ACTION"    # ada kendala, menunggu PIC Klien/Intake
    PENDING_REVIEW = "PENDING_REVIEW"  # menunggu Finance Reviewer
    APPROVED       = "APPROVED"        # Status lama; dipertahankan untuk kompatibilitas data.
    REJECTED       = "REJECTED"        # Status lama; dipertahankan untuk kompatibilitas data.


class ExtractionStatus(str, enum.Enum):
    SUCCESS = "SUCCESS"
    FAILED  = "FAILED"


class ValidationSeverity(str, enum.Enum):
    ERROR   = "ERROR"     # memblokir lanjut ke review
    WARNING = "WARNING"   # perlu perhatian reviewer


class IssueStatus(str, enum.Enum):
    OPEN     = "OPEN"
    RESOLVED = "RESOLVED"


# ──────────────────────────── Invoice ────────────────────────────

class Invoice(Base):
    """Invoice utama. Kolom nilai (invoice_number, total_amount, dst.) adalah
    nilai FINAL yang sudah dikoreksi/dikonfirmasi; nilai mentah hasil Bedrock
    disimpan di InvoiceExtraction dan InvoiceExtractedField."""
    __tablename__ = "invoices"
    __table_args__ = (
        UniqueConstraint("client_id", "file_sha256", name="uq_invoice_client_filehash"),
        # Pemisahan tugas sesuai BRD: tidak boleh meninjau dokumen yang diunggah sendiri
        CheckConstraint(
            "reviewed_by_id IS NULL OR reviewed_by_id <> uploaded_by_id",
            name="ck_invoice_no_self_review",
        ),
        CheckConstraint(
            "assigned_reviewer_id IS NULL OR assigned_reviewer_id <> uploaded_by_id",
            name="ck_invoice_reviewer_not_uploader",
        ),
        # Data status akhir lama wajib memiliki jejak reviewer.
        CheckConstraint(
            "status NOT IN ('APPROVED', 'REJECTED') "
            "OR (reviewed_by_id IS NOT NULL AND reviewed_at IS NOT NULL)",
            name="ck_invoice_final_status_has_reviewer",
        ),
        CheckConstraint("total_amount IS NULL OR total_amount >= 0", name="ck_invoice_total_nonneg"),
        Index("ix_invoice_client_status", "client_id", "status"),
    )

    id        = Column(BigInteger, primary_key=True, autoincrement=True)
    client_id = Column(BigInteger, ForeignKey("clients.id"), nullable=False, index=True)

    # Pelaku
    uploaded_by_id       = Column(BigInteger, ForeignKey("users.id"), nullable=False, index=True)  # PIC Klien / Intake Support
    assigned_reviewer_id = Column(BigInteger, ForeignKey("users.id"), nullable=True, index=True)   # dialokasikan Service Lead
    reviewed_by_id       = Column(BigInteger, ForeignKey("users.id"), nullable=True)               # Finance Reviewer

    status = Column(
        Enum(InvoiceStatus, native_enum=False, length=20),
        nullable=False, default=InvoiceStatus.UPLOADED, index=True,
    )

    # File di S3 (input ke Bedrock)
    file_name    = Column(String(255), nullable=False)
    content_type = Column(String(100), nullable=False)
    file_size    = Column(BigInteger, nullable=False)
    file_sha256  = Column(String(64), nullable=False)   # deteksi duplikat
    s3_bucket    = Column(String(255), nullable=False)
    s3_key       = Column(String(1024), nullable=False)
    page_count   = Column(Integer, nullable=True)

    # Nilai final (diisi dari ekstraksi, bisa dikoreksi reviewer)
    invoice_number = Column(String(100), nullable=True, index=True)
    vendor_name    = Column(String(255), nullable=True)
    vendor_tax_id  = Column(String(50),  nullable=True)
    invoice_date   = Column(Date, nullable=True)
    due_date       = Column(Date, nullable=True)
    currency       = Column(String(3), nullable=True)
    subtotal       = Column(Numeric(18, 2), nullable=True)
    tax_amount     = Column(Numeric(18, 2), nullable=True)
    total_amount   = Column(Numeric(18, 2), nullable=True)

    # Metadata tambahan yang diisi PIC Klien (fleksibel)
    client_metadata = Column(JsonType, nullable=True)
    review_note     = Column(Text, nullable=True)

    submitted_at = Column(DateTime(timezone=True), nullable=True)
    reviewed_at  = Column(DateTime(timezone=True), nullable=True)
    created_at   = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at   = Column(DateTime(timezone=True), server_default=func.now(),
                          onupdate=func.now(), nullable=False)

    client            = relationship("Client")
    uploaded_by       = relationship("User", foreign_keys=[uploaded_by_id])
    assigned_reviewer = relationship("User", foreign_keys=[assigned_reviewer_id])
    reviewed_by       = relationship("User", foreign_keys=[reviewed_by_id])

    extractions  = relationship("InvoiceExtraction", back_populates="invoice",
                                cascade="all, delete-orphan", order_by="InvoiceExtraction.attempt")
    line_items   = relationship("InvoiceLineItem", back_populates="invoice",
                                cascade="all, delete-orphan", order_by="InvoiceLineItem.line_no")
    validations  = relationship("InvoiceValidation", back_populates="invoice",
                                cascade="all, delete-orphan")
    issues       = relationship("InvoiceIssue", back_populates="invoice",
                                cascade="all, delete-orphan")
    history      = relationship("InvoiceStatusHistory", back_populates="invoice",
                                cascade="all, delete-orphan", order_by="InvoiceStatusHistory.created_at")


# ──────────────────────── Hasil scan Bedrock ────────────────────────

class InvoiceExtraction(Base):
    """Satu kali pemanggilan Bedrock (satu attempt). Menyimpan respons mentah
    untuk audit dan hasil parsing terstruktur."""
    __tablename__ = "invoice_extractions"
    __table_args__ = (
        UniqueConstraint("invoice_id", "attempt", name="uq_extraction_invoice_attempt"),
    )

    id         = Column(BigInteger, primary_key=True, autoincrement=True)
    invoice_id = Column(BigInteger, ForeignKey("invoices.id", ondelete="CASCADE"),
                        nullable=False, index=True)
    attempt    = Column(Integer, nullable=False, default=1)

    triggered_by_id = Column(BigInteger, ForeignKey("users.id"), nullable=True)  # akun ROBOT_ADMIN

    status        = Column(Enum(ExtractionStatus, native_enum=False, length=10), nullable=False)
    error_message = Column(Text, nullable=True)

    # Info Bedrock
    model_id      = Column(String(200), nullable=False)   # mis. anthropic.claude-...
    prompt_version = Column(String(50), nullable=True)
    request_id    = Column(String(100), nullable=True)     # x-amzn-requestid
    input_tokens  = Column(Integer, nullable=True)
    output_tokens = Column(Integer, nullable=True)
    latency_ms    = Column(Integer, nullable=True)

    raw_response      = Column(JsonType, nullable=True)    # respons mentah Bedrock
    parsed_result     = Column(JsonType, nullable=True)    # JSON terstruktur hasil parsing
    overall_confidence = Column(Numeric(5, 4), nullable=True)  # 0.0000 - 1.0000

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    invoice      = relationship("Invoice", back_populates="extractions")
    triggered_by = relationship("User")
    fields       = relationship("InvoiceExtractedField", back_populates="extraction",
                                cascade="all, delete-orphan")


class InvoiceExtractedField(Base):
    """Nilai per field hasil Bedrock + koreksi Finance Reviewer
    (nilai asli tetap tersimpan untuk jejak audit)."""
    __tablename__ = "invoice_extracted_fields"
    __table_args__ = (
        UniqueConstraint("extraction_id", "field_name", name="uq_extracted_field"),
    )

    id            = Column(BigInteger, primary_key=True, autoincrement=True)
    extraction_id = Column(BigInteger, ForeignKey("invoice_extractions.id", ondelete="CASCADE"),
                           nullable=False, index=True)

    field_name      = Column(String(50), nullable=False)   # mis. invoice_number, total_amount
    extracted_value = Column(Text, nullable=True)
    confidence      = Column(Numeric(5, 4), nullable=True)

    corrected_value = Column(Text, nullable=True)
    corrected_by_id = Column(BigInteger, ForeignKey("users.id"), nullable=True)  # Finance Reviewer
    corrected_at    = Column(DateTime(timezone=True), nullable=True)

    extraction   = relationship("InvoiceExtraction", back_populates="fields")
    corrected_by = relationship("User")


class InvoiceLineItem(Base):
    __tablename__ = "invoice_line_items"
    __table_args__ = (
        UniqueConstraint("invoice_id", "line_no", name="uq_line_item_invoice_lineno"),
    )

    id         = Column(BigInteger, primary_key=True, autoincrement=True)
    invoice_id = Column(BigInteger, ForeignKey("invoices.id", ondelete="CASCADE"),
                        nullable=False, index=True)
    line_no    = Column(Integer, nullable=False)

    description = Column(Text, nullable=True)
    quantity    = Column(Numeric(18, 4), nullable=True)
    unit_price  = Column(Numeric(18, 2), nullable=True)
    amount      = Column(Numeric(18, 2), nullable=True)
    confidence  = Column(Numeric(5, 4), nullable=True)

    invoice = relationship("Invoice", back_populates="line_items")


# ───────────────── Verifikasi aturan bisnis & kendala ─────────────────

class InvoiceValidation(Base):
    """Hasil verifikasi aturan bisnis oleh Robot Admin
    (mis. total = subtotal + pajak, duplikat invoice, tanggal valid)."""
    __tablename__ = "invoice_validations"

    id            = Column(BigInteger, primary_key=True, autoincrement=True)
    invoice_id    = Column(BigInteger, ForeignKey("invoices.id", ondelete="CASCADE"),
                           nullable=False, index=True)
    extraction_id = Column(BigInteger, ForeignKey("invoice_extractions.id"), nullable=True)

    rule_code = Column(String(50), nullable=False)    # mis. TOTAL_MISMATCH, DUPLICATE_INVOICE
    severity  = Column(Enum(ValidationSeverity, native_enum=False, length=10), nullable=False)
    passed    = Column(Boolean, nullable=False)
    message   = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    invoice = relationship("Invoice", back_populates="validations")


class InvoiceIssue(Base):
    """Kendala yang harus diselesaikan PIC Klien / Intake Support."""
    __tablename__ = "invoice_issues"

    id         = Column(BigInteger, primary_key=True, autoincrement=True)
    invoice_id = Column(BigInteger, ForeignKey("invoices.id", ondelete="CASCADE"),
                        nullable=False, index=True)

    issue_type  = Column(String(50), nullable=False)
    description = Column(Text, nullable=False)
    status      = Column(Enum(IssueStatus, native_enum=False, length=10),
                         nullable=False, default=IssueStatus.OPEN, index=True)

    raised_by_id    = Column(BigInteger, ForeignKey("users.id"), nullable=True)  # Robot Admin / Finance Reviewer
    resolved_by_id  = Column(BigInteger, ForeignKey("users.id"), nullable=True)  # PIC Klien / Intake Support
    resolution_note = Column(Text, nullable=True)
    resolved_at     = Column(DateTime(timezone=True), nullable=True)
    created_at      = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    invoice     = relationship("Invoice", back_populates="issues")
    raised_by   = relationship("User", foreign_keys=[raised_by_id])
    resolved_by = relationship("User", foreign_keys=[resolved_by_id])


class InvoiceStatusHistory(Base):
    """Jejak audit perubahan status."""
    __tablename__ = "invoice_status_history"

    id         = Column(BigInteger, primary_key=True, autoincrement=True)
    invoice_id = Column(BigInteger, ForeignKey("invoices.id", ondelete="CASCADE"),
                        nullable=False, index=True)

    from_status = Column(Enum(InvoiceStatus, native_enum=False, length=20), nullable=True)
    to_status   = Column(Enum(InvoiceStatus, native_enum=False, length=20), nullable=False)
    actor_id    = Column(BigInteger, ForeignKey("users.id"), nullable=True)
    note        = Column(Text, nullable=True)
    created_at  = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    invoice = relationship("Invoice", back_populates="history")
    actor   = relationship("User")