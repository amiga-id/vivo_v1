from typing import Annotated

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    status,
)
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.models.account import Account
from app.schemas.response import (
    ApiResponse,
    PageDetails,
    PagedRequest,
    PagedResponse,
)
from app.schemas.vendor import VendorCreateRequest, VendorFilterRequest, VendorResponse
from app.services.auth import (
    current_account,
)
from app.services.vendor import create_vendor, filter_vendors

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
