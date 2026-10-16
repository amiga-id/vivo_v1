import enum
from sqlalchemy import (
    Column, BigInteger, String, DateTime, Boolean, Enum, ForeignKey,
    CheckConstraint, UniqueConstraint,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

try:
    from ..database import Base
except ImportError:
    from database import Base


class UserRole(str, enum.Enum):
    PIC_CLIENT       = "PIC_CLIENT"        # Owner
    INTAKE_SUPPORT   = "INTAKE_SUPPORT"    # Backup
    ROBOT_ADMIN      = "ROBOT_ADMIN"       # AI Engine (akun sistem)
    FINANCE_REVIEWER = "FINANCE_REVIEWER"
    SERVICE_LEAD     = "SERVICE_LEAD"
    SYSTEM_ADMIN     = "SYSTEM_ADMIN"


class Permission(str, enum.Enum):
    UPLOAD_INVOICE      = "upload_invoice"
    EDIT_METADATA       = "edit_metadata"
    RESOLVE_ISSUE       = "resolve_issue"
    DOWNLOAD_VOUCHER    = "download_voucher"
    EXTRACT_VERIFY      = "extract_verify"       # ekstraksi & verifikasi aturan bisnis
    REVIEW_EXTRACTION   = "review_extraction"    # periksa & koreksi
    MONITOR_WORKLOAD    = "monitor_workload"
    REASSIGN_TASK       = "reassign_task"
    MANAGE_ACCOUNT      = "manage_account"
    MANAGE_ACCESS       = "manage_access"
    MANAGE_CLIENT_DATA  = "manage_client_data"


# Matriks wewenang sesuai BRD
ROLE_PERMISSIONS = {
    UserRole.PIC_CLIENT: {
        Permission.UPLOAD_INVOICE, Permission.EDIT_METADATA,
        Permission.RESOLVE_ISSUE, Permission.DOWNLOAD_VOUCHER,
    },
    UserRole.INTAKE_SUPPORT: {  # hanya untuk klien yang didelegasikan
        Permission.UPLOAD_INVOICE, Permission.EDIT_METADATA,
        Permission.RESOLVE_ISSUE,
    },
    UserRole.ROBOT_ADMIN: {
        Permission.EXTRACT_VERIFY,
    },
    UserRole.FINANCE_REVIEWER: {
        Permission.REVIEW_EXTRACTION,
    },
    UserRole.SERVICE_LEAD: {   # TIDAK boleh otorisasi pembayaran klien
        Permission.MONITOR_WORKLOAD, Permission.REASSIGN_TASK,
    },
    UserRole.SYSTEM_ADMIN: {
        Permission.MANAGE_ACCOUNT, Permission.MANAGE_ACCESS,
        Permission.MANAGE_CLIENT_DATA,
    },
}


def has_permission(role: UserRole, perm: Permission) -> bool:
    return perm in ROLE_PERMISSIONS.get(role, set())


class Client(Base):
    """Organisasi klien (bukan akun login). Dikelola System Admin."""
    __tablename__ = "clients"

    id         = Column(BigInteger, primary_key=True, autoincrement=True)
    name       = Column(String(150), unique=True, nullable=False)
    is_active  = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    users       = relationship("User", back_populates="client")
    delegations = relationship("Delegation", back_populates="client")


class User(Base):
    """Satu tabel untuk semua peran internal; peran dibedakan lewat kolom role."""
    __tablename__ = "users"
    __table_args__ = (
        # PIC Klien wajib terikat ke satu klien
        CheckConstraint(
            "role <> 'PIC_CLIENT' OR client_id IS NOT NULL",
            name="ck_pic_client_requires_client",
        ),
        # Robot Admin adalah akun sistem (tanpa login); peran lain wajib punya password
        CheckConstraint(
            "role = 'ROBOT_ADMIN' OR password_hash IS NOT NULL",
            name="ck_password_required_except_robot",
        ),
    )

    id            = Column(BigInteger, primary_key=True, autoincrement=True)
    name          = Column(String(100), nullable=False)
    email         = Column(String(255), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=True)
    role          = Column(Enum(UserRole, native_enum=False, length=30), nullable=False, index=True)
    client_id     = Column(BigInteger, ForeignKey("clients.id"), nullable=True)  # khusus PIC_CLIENT
    is_active     = Column(Boolean, nullable=False, default=True)
    created_at    = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    client      = relationship("Client", back_populates="users")
    delegations = relationship("Delegation", back_populates="intake_user",
                               foreign_keys="Delegation.intake_user_id")


class Delegation(Base):
    """Delegasi resmi: Intake Support hanya boleh akses klien yang ditugaskan."""
    __tablename__ = "delegations"
    __table_args__ = (
        UniqueConstraint("intake_user_id", "client_id", name="uq_delegation_user_client"),
    )

    id             = Column(BigInteger, primary_key=True, autoincrement=True)
    intake_user_id = Column(BigInteger, ForeignKey("users.id"), nullable=False, index=True)
    client_id      = Column(BigInteger, ForeignKey("clients.id"), nullable=False, index=True)
    assigned_by_id = Column(BigInteger, ForeignKey("users.id"), nullable=False)  # PIC Klien / Service Lead
    is_active      = Column(Boolean, nullable=False, default=True)
    created_at     = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    intake_user = relationship("User", back_populates="delegations", foreign_keys=[intake_user_id])
    client      = relationship("Client", back_populates="delegations")
    assigned_by = relationship("User", foreign_keys=[assigned_by_id])