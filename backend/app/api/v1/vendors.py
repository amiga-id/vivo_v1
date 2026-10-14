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
    PageDetails,
    PagedRequest,
    PagedResponse,
)
from app.schemas.vendor import VendorFilterRequest, VendorResponse
from app.services.auth import (
    AuthenticationError,
    current_account,
)
from app.services.vendor import filter_vendors

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
    try:
        if not current_user.is_admin:
            raise AuthenticationError("Unauthorized")

        page = (request and request.page) or PageDetails(index=1, size=10)
        [accounts, page.total] = await filter_vendors(session, request)

        if accounts is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Account does not exist: {id}",
            )

        return PagedResponse[VendorResponse](success=True, page=page, data=accounts)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc
