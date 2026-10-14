from uuid import UUID

from pydantic import BaseModel


class MetricRequest(BaseModel):
    account_id: str | UUID
    correlated_id: str | UUID
    name: str | None = ""
    service_name: str | None = ""
    model_id: str | None = ""
    input_tokens: int | None = 0
    output_tokens: int | None = 0
    total_tokens: int | None = 0
    exec_start: float | None = 0
    exec_time: float | None = 0
    system: str | None = None
    prompt: str | None = None
    response: str | None = None
    success: bool | None = False
    error: str | None = None
