from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel

SignerRole = Literal["finance"]

class VoucherSignatureSelection(BaseModel):
    finance: str | None = None


class VoucherListItem(BaseModel):
    submission_id: str
    request_number: str
    voucher_number: str
    client_name: str
    kind: str
    status: str
    receive_date: date
    grand_total: float
    voucher_url: str | None = None
    signature_ids: VoucherSignatureSelection
    created_at: datetime


class VoucherSignerOption(BaseModel):
    id: str
    role: SignerRole
    name: str
    account_id: str | None = None


class VoucherSignersResponse(BaseModel):
    finance: list[VoucherSignerOption]


class VoucherGenerateResponse(BaseModel):
    submission_id: str
    voucher_number: str
    voucher_url: str


class VoucherSignatureResponse(BaseModel):
    id: str
    role: SignerRole
    name: str
    account_id: str | None = None
    content_type: str
    created_at: datetime
