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
from app.models.account import Account, AccountRole
from app.schemas.auth import (
    AccountCreateRequest,
    AccountFilterRequest,
    AccountResponse,
    AccountUpdateRequest,
    LoginRequest,
    LoginResponse,
)
from app.schemas.response import (
    ApiResponse,
    PageDetails,
    PagedRequest,
    PagedResponse,
)
from app.services.audit import record_audit_event
from app.services.auth import (
    AuthenticationError,
    create_account,
    current_account,
    filter_accounts,
    find_account,
    from_account,
    login_account,
    logout_account,
    remove_account,
    update_account,
)

router = APIRouter(tags=["Auth"], prefix="/auth")


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
    "/accounts/create",
    status_code=status.HTTP_201_CREATED,
    response_model=ApiResponse[AccountResponse],
    response_model_exclude_none=True,
)
async def create_account_by_admin(
    request: AccountCreateRequest,
    session: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Account, Depends(current_account)],
):
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only an administrator can create accounts.",
        )
    try:
        account = await create_account(
            session=session,
            name=request.name,
            email=request.email,
            password=request.password,
            role=AccountRole(request.role),
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=str(exc)
        ) from exc

    record_audit_event(
        session,
        current_user,
        entity_type="account",
        entity_id=account.id,
        entity_label=account.name,
        action="Akun pegawai dibuat",
        detail=f"{account.email} · {account.role.value}.",
    )
    await session.commit()
    return ApiResponse(success=True, data=from_account(account))


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
        record_audit_event(
            session,
            current_user,
            entity_type="session",
            action="Logout",
        )
        await session.commit()

        return ApiResponse[None](success=True)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)
        ) from exc


@router.post(
    "/accounts",
    status_code=status.HTTP_200_OK,
    response_model=PagedResponse[AccountResponse],
    response_model_exclude_none=True,
)
async def list_accounts(
    session: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Account, Depends(current_account)],
    request: PagedRequest[AccountFilterRequest] | None = None,
):
    try:
        if not current_user.is_admin:
            raise AuthenticationError("Unauthorized")

        page = (request and request.page) or PageDetails(index=1, size=10)
        [accounts, page.total] = await filter_accounts(session, request)

        if accounts is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Account does not exist: {id}",
            )

        return PagedResponse[AccountResponse](success=True, page=page, data=accounts)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
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
        if request.role is not None and to_uuid(id) == current_user.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You cannot change your own role.",
            )

        previous_account = await find_account(session, id)
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

        requested_changes = request.model_dump(exclude_unset=True)
        changed_fields = [
            field
            for field, value in requested_changes.items()
            if not (field == "role" and value is None)
            and previous_account is not None
            and getattr(previous_account, field) != value
        ]
        if changed_fields and previous_account is not None and account is not None:
            role_changed = "role" in changed_fields
            record_audit_event(
                session,
                current_user,
                entity_type="account",
                entity_id=to_uuid(id),
                entity_label=account.name,
                action=(
                    "Peran akun diperbarui"
                    if role_changed
                    else "Data akun diperbarui"
                ),
                detail=(
                    f"Bidang diperbarui: {', '.join(changed_fields)}."
                    + (
                        f" Peran: {previous_account.role} → {account.role}."
                        if role_changed
                        else ""
                    )
                ),
            )
        await session.commit()
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

        account = await find_account(session, id)
        [success, _] = await remove_account(session, id)

        if not success:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot delete account: {id}",
            )

        if account is not None:
            record_audit_event(
                session,
                current_user,
                entity_type="account",
                entity_id=to_uuid(id),
                entity_label=account.name,
                action="Akun pegawai dihapus",
                detail=f"{account.email} · {account.role}.",
            )
            await session.commit()
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
