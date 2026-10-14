from uuid import UUID

from sqlalchemy import insert

from app.core.db import SessionLocal
from app.core.sid import to_uuid
from app.models.metric import Metric
from app.schemas.metric import MetricRequest


async def save_metric(request: MetricRequest) -> bool:
    correlated_id = (
        request.correlated_id
        if isinstance(request.correlated_id, UUID)
        else to_uuid(request.correlated_id)
    )

    metric = [
        {
            "created_by": request.account_id,
            "correlated_id": correlated_id,
            "name": request.name,
            "service_name": request.service_name,
            "model_id": request.model_id,
            "input_tokens": request.input_tokens,
            "output_tokens": request.output_tokens,
            "total_tokens": request.total_tokens,
            "exec_start": request.exec_start,
            "exec_time": request.exec_time,
            "system": request.system,
            "prompt": request.prompt,
            "response": request.response,
            "success": request.success,
            "error": request.error,
        }
    ]

    try:
        async with SessionLocal() as session:
            await session.execute(insert(Metric), metric)
            await session.commit()

            return True
    except Exception:
        return False
