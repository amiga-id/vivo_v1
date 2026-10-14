import uuid
from enum import StrEnum

from sqlalchemy import (
    UUID,
    Boolean,
    Column,
    DateTime,
    String,
    text,
)
from sqlalchemy.dialects.postgresql import ENUM
from sqlalchemy.orm import (
    Mapped,
    mapped_column,
)
from sqlalchemy.sql import func

from app.core.db import Base


class AccountRole(StrEnum):
    SYSTEM = "system"
    ADMIN = "admin"
    SUPPORT = "support"
    REVIEWER = "reviewer"
    LEAD = "lead"


class Account(Base):
    __tablename__ = "account"
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("uuidv7()")
    )
    name = Column(String(100), nullable=False)
    email = Column(String(255), nullable=False, unique=True)
    email_verified = Column(Boolean, nullable=False, default=False)
    phone_number = Column(String(15), nullable=True)
    phone_verified = Column(Boolean, nullable=False, default=False)
    password_hash = Column(String(255), nullable=False)
    role: Mapped[AccountRole] = mapped_column(
        ENUM(
            AccountRole,
            name="account_role_enum",
            values_callable=lambda x: [e.value for e in x],
        ),
        default=AccountRole.SUPPORT,
        nullable=False,
    )
    avatar_url = Column(String(255), nullable=True)
    avatar_provider = Column(String(10), nullable=True)
    about = Column(String(255), nullable=True)
    last_login = Column(DateTime(timezone=True), nullable=True)
    last_logout = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), nullable=True)

    @property
    def is_admin(self):
        return self.role == AccountRole.SYSTEM or self.role == AccountRole.ADMIN

    @property
    def is_support(self):
        return self.role == AccountRole.SUPPORT

    @property
    def is_reviewer(self):
        return self.role == AccountRole.REVIEWER

    @property
    def is_lead(self):
        return self.role == AccountRole.LEAD

    @property
    def updated_at_iso(self):
        if self.updated_at:
            return self.updated_at.isoformat()
        return None

    @property
    def created_at_iso(self):
        return self.created_at.isoformat()
