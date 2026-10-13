from typing import Annotated

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    status,
)
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.sid import from_uuid
from app.models.account import Account
from app.schemas.auth import (
    AccountResponse,
    AccountUpdateRequest,
    LoginRequest,
    LoginResponse,
    RegisterRequest,
    RegisterResponse,
)
from app.schemas.response import ApiResponse
from app.services.auth import (
    AuthenticationError,
    create_account,
    current_account,
    find_account,
    from_account,
    login_account,
    logout_account,
    remove_account,
    update_account,
)

router = APIRouter(tags=["Auth"], prefix="/auth")


@router.post(
    "/register",
    status_code=status.HTTP_201_CREATED,
    response_model=ApiResponse[RegisterResponse],
    response_model_exclude_none=True,
)
async def register(
    request: RegisterRequest, session: Annotated[AsyncSession, Depends(get_db)]
):
    try:
        account = await create_account(
            session=session,
            name=request.name,
            email=request.email,
            password=request.password,
        )

        return ApiResponse[RegisterResponse](
            success=True,
            data=RegisterResponse(
                id=from_uuid(account.id),
                name=account.name,
                email=account.email,
                created_at=account.created_at_iso,
            ),
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=str(exc)
        ) from exc


@router.post(
    "/login",
    status_code=status.HTTP_200_OK,
    response_model=ApiResponse[LoginResponse],
    response_model_exclude_none=True,
)
async def login(
    request: LoginRequest, session: Annotated[AsyncSession, Depends(get_db)]
):
    try:
        token = await login_account(
            session=session,
            email=request.email,
            password=request.password,
        )

        data = LoginResponse(
            email=request.email,
            access_token=token.access_token,
            token_type=token.token_type,
            expires=token.expires,
        )

        return ApiResponse[LoginResponse](
            success=True,
            data=data,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc


@router.post(
    "/logout",
    status_code=status.HTTP_200_OK,
    response_model=ApiResponse[None],
    response_model_exclude_none=True,
)
async def logout(
    session: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Account, Depends(current_account)],
):
    try:
        await logout_account(session, current_user.id)

        return ApiResponse[None](success=True)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)
        ) from exc


@router.get(
    "/accounts/{id}",
    status_code=status.HTTP_200_OK,
    response_model=ApiResponse[AccountResponse],
    response_model_exclude_none=True,
)
async def get_account(
    id: str,
    session: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Account, Depends(current_account)],
):
    try:
        if not current_user.is_admin:
            raise AuthenticationError("Unauthorized")

        account = await find_account(session, id)

        if account is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Account does not exist: {id}",
            )

        return ApiResponse[AccountResponse](success=True, data=account)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc


@router.patch(
    "/accounts/{id}",
    status_code=status.HTTP_200_OK,
    response_model=ApiResponse[AccountResponse],
    response_model_exclude_none=True,
)
async def patch_account(
    id: str,
    request: AccountUpdateRequest,
    session: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Account, Depends(current_account)],
):
    try:
        if not current_user.is_admin:
            raise AuthenticationError("Unauthorized")

        [success, account] = await update_account(session, id, request)

        if success and account is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Account does not exist: {id}",
            )

        if not success and account is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot update account: {id}",
            )

        return ApiResponse[AccountResponse](success=True, data=account)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc


@router.delete(
    "/accounts/{id}",
    status_code=status.HTTP_200_OK,
    response_model=ApiResponse[None],
    response_model_exclude_none=True,
)
async def delete_account(
    id: str,
    session: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Account, Depends(current_account)],
):
    try:
        if not current_user.is_admin:
            raise AuthenticationError("Unauthorized")

        [success, _] = await remove_account(session, id)

        if not success:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot delete account: {id}",
            )

        return ApiResponse[None](success=True)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc


@router.post(
    "/me",
    status_code=status.HTTP_200_OK,
    response_model=ApiResponse[AccountResponse],
    response_model_exclude_none=True,
)
def me(current_user: Annotated[Account, Depends(current_account)]):
    try:
        return ApiResponse(
            success=current_user is not None, data=from_account(current_user)
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)
        ) from exc
