import uuid

from sqlalchemy import (
    UUID,
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.core.db import Base


class VoucherSigner(Base):
    __tablename__ = "voucher_signer"
    __table_args__ = (
        UniqueConstraint(
            "account_id",
            "role",
            name="uq_voucher_signer_account_role",
        ),
        UniqueConstraint(
            "external_name",
            "role",
            name="uq_voucher_signer_external_name_role",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("uuidv7()")
    )
    role = Column(String(16), nullable=False)
    account_id = Column(
        UUID, ForeignKey("account.id", ondelete="RESTRICT"), nullable=True
    )
    external_name = Column(String(100), nullable=True)
    s3_key = Column(String(1024), nullable=False)
    content_type = Column(String(64), nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)
    created_by = Column(
        UUID, ForeignKey("account.id", ondelete="RESTRICT"), nullable=False
    )
    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), nullable=True)

    @property
    def signer_name(self) -> str:
        return self.external_name or ""


class VoucherSignature(Base):
    __tablename__ = "voucher_signature"
    __table_args__ = (
        UniqueConstraint(
            "submission_id",
            "role",
            name="uq_voucher_signature_submission_role",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("uuidv7()")
    )
    submission_id = Column(
        UUID, ForeignKey("submission.id", ondelete="CASCADE"), nullable=False
    )
    role = Column(String(16), nullable=False)
    signer_id = Column(
        UUID, ForeignKey("voucher_signer.id", ondelete="RESTRICT"), nullable=False
    )
    applied_by = Column(
        UUID, ForeignKey("account.id", ondelete="RESTRICT"), nullable=False
    )
    applied_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
