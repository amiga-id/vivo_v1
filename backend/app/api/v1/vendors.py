from typing import Annotated

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    status,
)
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.sid import to_uuid
from app.models.account import Account
from app.schemas.response import (
    ApiResponse,
    PageDetails,
    PagedRequest,
    PagedResponse,
)
from app.schemas.vendor import (
    VendorCreateRequest,
    VendorFilterRequest,
    VendorResponse,
    VendorUpdateRequest,
)
from app.services.auth import (
    current_account,
)
from app.services.vendor import (
    create_vendor,
    delete_vendor,
    filter_vendors,
    update_vendor,
)

router = APIRouter(tags=["Vendors"], prefix="/vendors")


@router.post(
    "",
    status_code=status.HTTP_200_OK,
    response_model=PagedResponse[VendorResponse],
    response_model_exclude_none=True,
)
async def list_vendors(
    session: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Account, Depends(current_account)],
    request: PagedRequest[VendorFilterRequest] | None = None,
):
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only an administrator can manage vendors.",
        )

    page = (request and request.page) or PageDetails(index=1, size=10)
    vendors, page.total = await filter_vendors(session, request)

    return PagedResponse[VendorResponse](success=True, page=page, data=vendors)


@router.post(
    "/create",
    status_code=status.HTTP_201_CREATED,
    response_model=ApiResponse[VendorResponse],
    response_model_exclude_none=True,
)
async def add_vendor(
    request: VendorCreateRequest,
    session: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Account, Depends(current_account)],
):
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only an administrator can manage vendors.",
        )

    vendor = await create_vendor(session, request, current_user)
    return ApiResponse(success=True, data=vendor)


@router.put(
    "/{vendor_id}",
    status_code=status.HTTP_200_OK,
    response_model=ApiResponse[VendorResponse],
    response_model_exclude_none=True,
)
async def edit_vendor(
    vendor_id: str,
    request: VendorUpdateRequest,
    session: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Account, Depends(current_account)],
):
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only an administrator can manage vendors.",
        )
    try:
        vendor_uuid = to_uuid(vendor_id)
    except (ValueError, TypeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="ID vendor tidak valid.",
        ) from exc

    vendor = await update_vendor(session, vendor_uuid, request, current_user)
    if vendor is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vendor tidak ditemukan.",
        )
    return ApiResponse(success=True, data=vendor)


@router.delete(
    "/{vendor_id}",
    status_code=status.HTTP_200_OK,
    response_model=ApiResponse[None],
)
async def remove_vendor(
    vendor_id: str,
    session: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Account, Depends(current_account)],
):
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only an administrator can manage vendors.",
        )
    try:
        vendor_uuid = to_uuid(vendor_id)
    except (ValueError, TypeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="ID vendor tidak valid.",
        ) from exc

    deleted = await delete_vendor(session, vendor_uuid, current_user)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vendor tidak ditemukan.",
        )
    return ApiResponse(success=True)
