import uuid
from typing import TYPE_CHECKING

from sqlalchemy import (
    UUID,
    Column,
    DateTime,
    ForeignKey,
    String,
    text,
)
from sqlalchemy.orm import (
    Mapped,
    mapped_column,
    relationship,
)
from sqlalchemy.sql import func

from app.core.db import Base

if TYPE_CHECKING:
    # Make sure this path points exactly to your vendor module
    from .account import Account


class Vendor(Base):
    __tablename__ = "vendor"
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("uuidv7()")
    )

    account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("account.id", ondelete="SET NULL"), nullable=True
    )

    name = Column(String(255), nullable=False)
    pic = Column(String(255), nullable=False)
    email = Column(String(255), nullable=False)
    phone_number = Column(String(255), nullable=True)
    address = Column(String(255), nullable=True)
    created_by = Column(UUID, nullable=False)
    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_by = Column(UUID, nullable=True)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), nullable=True)

    account: Mapped["Account"] = relationship("Account", back_populates="vendors")  # noqa: F821, UP037

    @property
    def updated_at_iso(self):
        if self.updated_at:
            return self.updated_at.isoformat()
        return None

    @property
    def created_at_iso(self):
        return self.created_at.isoformat()
