from typing import Annotated

from fastapi import Depends
from sqlalchemy import (
    func,
    or_,
    select,
)
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.paging import resolve_paging
from app.core.sid import from_uuid
from app.models.vendor import Vendor
from app.schemas.response import PagedRequest
from app.schemas.vendor import VendorFilterRequest, VendorResponse


def from_vendor(entry: Vendor) -> VendorResponse:
    return VendorResponse(
        id=from_uuid(entry.id),
        name=entry.name,
        pic=entry.pic,
        email=entry.email,
        phone_number=entry.phone_number,
        address=entry.address,
        created_at=entry.created_at_iso,
        updated_at=entry.updated_at_iso,
    )


async def filter_vendors(
    session: Annotated[AsyncSession, Depends(get_db)],
    filter: PagedRequest[VendorFilterRequest] | None = None,
) -> tuple[list[VendorResponse], int]:
    query = select(Vendor).order_by(Vendor.name)
    if filter and filter.query:
        query = query.where(
            or_(
                Vendor.name.ilike(f"%{filter.query}%"),
                Vendor.email.ilike(f"%{filter.query}%"),
            )
        )

    total = await session.scalar(
        query.with_only_columns(func.count(Vendor.id)).order_by(None)
    )

    size, offset = resolve_paging(filter and filter.page)
    result = await session.scalars(query.limit(size).offset(offset))
    data = [from_vendor(entry) for entry in result.all()]

    return [data, total]
