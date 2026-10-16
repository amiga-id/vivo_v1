import logging
from typing import Annotated

from botocore.exceptions import BotoCoreError, ClientError
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.models.account import Account, AccountRole
from app.schemas.response import ApiResponse
from app.schemas.voucher import (
    VoucherGenerateResponse,
    VoucherListItem,
    VoucherSignatureResponse,
    VoucherSignersResponse,
)
from app.services.auth import current_account
from app.services.voucher_workflow import (
    generate_voucher,
    list_voucher_signers,
    list_vouchers,
    register_voucher_signature,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/documents", tags=["Vouchers"])


@router.get("/vouchers", response_model=ApiResponse[list[VoucherListItem]])
async def get_vouchers(
    session: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Account, Depends(current_account)],
):
    try:
        return ApiResponse(
            success=True,
            data=await list_vouchers(session, current_user),
        )
    except (BotoCoreError, ClientError) as exc:
        logger.exception("Could not create voucher download URLs")
        raise HTTPException(
            status_code=502,
            detail="Tidak dapat membuat tautan voucher dari S3.",
        ) from exc


@router.get(
    "/vouchers/signers",
    response_model=ApiResponse[VoucherSignersResponse],
)
async def get_voucher_signers(
    session: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Account, Depends(current_account)],
):
    return ApiResponse(
        success=True,
        data=await list_voucher_signers(session, current_user),
    )


@router.post(
    "/signatures/finance",
    response_model=ApiResponse[VoucherSignatureResponse],
    status_code=201,
)
async def upload_voucher_signature(
    session: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Account, Depends(current_account)],
    file: Annotated[UploadFile, File()],
):
    if current_user.role != AccountRole.REVIEWER:
        await file.close()
        raise HTTPException(
            status_code=403,
            detail="Endpoint ini hanya untuk memperbarui tanda tangan Finance.",
        )
    try:
        signer = await register_voucher_signature(
            session,
            current_user,
            file.file,
        )
        return ApiResponse(success=True, data=signer)
    finally:
        await file.close()


@router.post(
    "/submissions/{submission_id}/voucher",
    response_model=ApiResponse[VoucherGenerateResponse],
)
async def create_voucher(
    submission_id: str,
    session: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Account, Depends(current_account)],
):
    number, url = await generate_voucher(
        session,
        current_user,
        submission_id,
    )
    return ApiResponse(
        success=True,
        data=VoucherGenerateResponse(
            submission_id=submission_id,
            voucher_number=number,
            voucher_url=url,
        ),
    )
