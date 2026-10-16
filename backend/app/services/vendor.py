from typing import Annotated
from uuid import UUID

from fastapi import Depends
from sqlalchemy import (
    delete,
    func,
    or_,
    select,
)
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.paging import resolve_paging
from app.core.sid import from_uuid
from app.models.account import Account
from app.models.client import Client, ClientAssignment
from app.models.vendor import Vendor
from app.schemas.response import PagedRequest
from app.schemas.vendor import (
    VendorCreateRequest,
    VendorFilterRequest,
    VendorResponse,
    VendorUpdateRequest,
)
from app.services.audit import record_audit_event


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
        if isinstance(filter.query, str):
            search = f"%{filter.query.strip()}%"
            query = query.where(
                or_(
                    Vendor.name.ilike(search),
                    Vendor.pic.ilike(search),
                    Vendor.email.ilike(search),
                )
            )
        else:
            if filter.query.name:
                query = query.where(Vendor.name.ilike(f"%{filter.query.name}%"))
            if filter.query.email:
                query = query.where(Vendor.email.ilike(f"%{filter.query.email}%"))

    total = (
        await session.scalar(
            query.with_only_columns(func.count(Vendor.id)).order_by(None)
        )
        or 0
    )

    size, offset = resolve_paging(filter and filter.page)
    result = await session.scalars(query.limit(size).offset(offset))
    data = [from_vendor(entry) for entry in result.all()]

    return data, total


async def create_vendor(
    session: AsyncSession,
    request: VendorCreateRequest,
    creator: Account,
) -> VendorResponse:
    vendor = Vendor(
        name=request.name,
        pic=request.pic,
        email=request.email,
        phone_number=request.phone_number,
        address=request.address,
        created_by=creator.id,
    )
    session.add(vendor)
    await session.flush()
    session.add(
        Client(
            name=vendor.name,
            vendor_id=vendor.id,
            created_by=creator.id,
        )
    )
    await session.flush()
    record_audit_event(
        session,
        creator,
        entity_type="vendor",
        entity_id=vendor.id,
        entity_label=vendor.name,
        action="Vendor ditambahkan",
    )
    await session.commit()
    await session.refresh(vendor)
    return from_vendor(vendor)


async def update_vendor(
    session: AsyncSession,
    vendor_id: UUID,
    request: VendorUpdateRequest,
    editor: Account,
) -> VendorResponse | None:
    vendor = await session.get(Vendor, vendor_id)
    if vendor is None:
        return None

    previous_name = vendor.name
    vendor.name = request.name
    vendor.pic = request.pic
    vendor.email = request.email
    vendor.phone_number = request.phone_number
    vendor.address = request.address
    vendor.updated_by = editor.id

    client = await session.scalar(select(Client).where(Client.vendor_id == vendor.id))
    if client is not None:
        client.name = vendor.name
    record_audit_event(
        session,
        editor,
        entity_type="vendor",
        entity_id=vendor.id,
        entity_label=vendor.name,
        action="Data vendor diperbarui",
        detail=f"Nama sebelumnya: {previous_name}.",
    )
    await session.commit()
    await session.refresh(vendor)
    return from_vendor(vendor)


async def delete_vendor(
    session: AsyncSession, vendor_id: UUID, deleter: Account
) -> bool:
    vendor = await session.get(Vendor, vendor_id)
    if vendor is None:
        return False

    client = await session.scalar(select(Client).where(Client.vendor_id == vendor.id))
    if client is not None:
        await session.execute(
            delete(ClientAssignment).where(ClientAssignment.client_id == client.id)
        )
        client.vendor_id = None
        await session.flush()

    record_audit_event(
        session,
        deleter,
        entity_type="vendor",
        entity_id=vendor.id,
        entity_label=vendor.name,
        action="Vendor dihapus",
    )
    await session.delete(vendor)
    await session.commit()
    return True
