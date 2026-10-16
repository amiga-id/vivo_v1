import uuid

from sqlalchemy import UUID, Column, DateTime, ForeignKey, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.core.db import Base


class LeadAuditEvent(Base):
    __tablename__ = "lead_audit_event"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("uuidv7()")
    )
    actor_id = Column(
        UUID, ForeignKey("account.id", ondelete="SET NULL"), nullable=True
    )
    actor_name = Column(String(100), nullable=False)
    entity_type = Column(String(32), nullable=False)
    entity_id = Column(UUID, nullable=True)
    entity_label = Column(String(255), nullable=True)
    action = Column(String(255), nullable=False)
    detail = Column(Text, nullable=True)
    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
