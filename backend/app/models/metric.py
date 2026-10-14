import uuid

from sqlalchemy import (
    UUID,
    Boolean,
    Column,
    DateTime,
    Float,
    Integer,
    String,
    Text,
    text,
)
from sqlalchemy.orm import (
    Mapped,
    mapped_column,
)
from sqlalchemy.sql import func

from app.core.db import Base


class Metric(Base):
    __tablename__ = "metric"
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("uuidv7()")
    )
    name = Column(String(255), nullable=False)
    service_name = Column(String(255), nullable=False)
    correlated_id = Column(UUID, nullable=True)
    model_id = Column(String(255), nullable=True)
    input_tokens = Column(Integer, nullable=True)
    output_tokens = Column(Integer, nullable=True)
    total_tokens = Column(Integer, nullable=True)
    exec_start = Column(Float, nullable=True)
    exec_time = Column(Float, nullable=True)
    system = Column(Text, nullable=True)
    prompt = Column(Text, nullable=True)
    response = Column(Text, nullable=True)
    success = Column(Boolean, nullable=False, default=False)
    error = Column(Text, nullable=True)
    created_by = Column(UUID, nullable=False)
    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    @property
    def created_at_iso(self):
        return self.created_at.isoformat()
