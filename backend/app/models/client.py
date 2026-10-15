import uuid

from sqlalchemy import (
    JSON,
    UUID,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.core.db import Base


class Client(Base):
    __tablename__ = "client"
    __table_args__ = (UniqueConstraint("vendor_id", name="uq_client_vendor"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("uuidv7()")
    )
    name = Column(String(255), nullable=False)
    vendor_id = Column(UUID, ForeignKey("vendor.id"), nullable=True)
    created_by = Column(UUID, ForeignKey("account.id"), nullable=False)
    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class ClientAssignment(Base):
    __tablename__ = "client_assignment"
    __table_args__ = (
        UniqueConstraint("support_id", "client_id", name="uq_client_assignment"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("uuidv7()")
    )
    support_id = Column(
        UUID, ForeignKey("account.id", ondelete="CASCADE"), nullable=False
    )
    client_id = Column(
        UUID, ForeignKey("client.id", ondelete="CASCADE"), nullable=False
    )


class Submission(Base):
    __tablename__ = "submission"
    __table_args__ = (
        UniqueConstraint("revision_of_id", name="uq_submission_revision_of"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("uuidv7()")
    )
    request_number = Column(String(32), nullable=False, unique=True)
    client_id = Column(UUID, ForeignKey("client.id"), nullable=False)
    kind = Column(String(100), nullable=False)
    channel = Column(String(100), nullable=True)
    receive_date = Column(Date, nullable=False)
    note = Column(String(2000), nullable=True)
    approvers = Column(Integer, nullable=False, default=1)
    uploader_id = Column(
        UUID, ForeignKey("account.id", ondelete="CASCADE"), nullable=False
    )
    reviewer_id = Column(
        UUID, ForeignKey("account.id", ondelete="RESTRICT"), nullable=False
    )
    due_date = Column(Date, nullable=False)
    status = Column(String(32), nullable=False, default="Dalam Review")
    decision_reason = Column(String(2000), nullable=True)
    revision_of_id = Column(
        UUID, ForeignKey("submission.id", ondelete="RESTRICT"), nullable=True
    )
    files = Column(JSON, nullable=False)
    invoices = Column(JSON, nullable=False)
    invoice_count = Column(Integer, nullable=False, default=0)
    page_count = Column(Integer, nullable=False, default=0)
    grand_total = Column(Numeric(18, 2), nullable=False, default=0)
    tax = Column(JSON, nullable=False, default=list)
    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class RevisionHistory(Base):
    __tablename__ = "revision_history"
    __table_args__ = (
        UniqueConstraint(
            "submission_id", "event_type", name="uq_revision_history_submission_event"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("uuidv7()")
    )
    submission_id = Column(
        UUID, ForeignKey("submission.id", ondelete="RESTRICT"), nullable=False
    )
    actor_id = Column(
        UUID, ForeignKey("account.id", ondelete="RESTRICT"), nullable=False
    )
    actor_name = Column(String(100), nullable=False)
    actor_role = Column(String(16), nullable=False)
    event_type = Column(String(32), nullable=False)
    action = Column(String(255), nullable=False)
    detail = Column(String(2000), nullable=True)
    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class UploadedFile(Base):
    __tablename__ = "uploaded_file"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("uuidv7()")
    )
    uploader_id = Column(
        UUID, ForeignKey("account.id", ondelete="CASCADE"), nullable=False
    )
    submission_id = Column(
        UUID, ForeignKey("submission.id", ondelete="SET NULL"), nullable=True
    )
    file_name = Column(String(255), nullable=False)
    file_size = Column(Integer, nullable=False)
    s3_key = Column(String(1024), nullable=False, unique=True)
    page_count = Column(Integer, nullable=True)
    invoices = Column(JSON, nullable=True)
    invoice_count = Column(Integer, nullable=False, default=0)
    grand_total = Column(Numeric(18, 2), nullable=True)
    extraction_status = Column(String(16), nullable=False, default="pending")
    extraction_error = Column(String, nullable=True)
    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
