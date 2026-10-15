from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field


def to_camel(value: str) -> str:
    head, *tail = value.split("_")
    return head + "".join(part.capitalize() for part in tail)


class DemoModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


Role = Literal["support", "finance", "lead", "admin"]
DocumentStatus = Literal[
    "Diproses", "Dalam Review", "Dikembalikan", "Disetujui", "Ditolak"
]
UserStatus = Literal["Aktif", "Menunggu", "Ditolak"]
FieldName = Literal["no", "tgl", "vendor", "npwp", "dpp", "ppn", "total", "rek"]


class DemoUser(DemoModel):
    id: str
    name: str
    role: Role
    about: str = ""
    email: str
    status: UserStatus = "Aktif"


class DemoFields(DemoModel):
    no: str
    tgl: str
    vendor: str
    npwp: str
    dpp: int
    ppn: int
    total: int
    rek: str


class DemoTaxLine(DemoModel):
    code: str
    label: str
    rate: float = Field(gt=0, le=100)
    kind: Literal["add", "withhold"]


class DemoTaxDocument(DemoModel):
    id: str
    no: str
    klien: str
    vendor: str
    status: DocumentStatus
    dpp: int
    ppn_invoice: int
    tax: list[DemoTaxLine] | None = None
    approvers: Literal[1, 2]


class DemoItem(DemoModel):
    tgl: str
    ket: str
    jumlah: str
    harga: int


class DemoDocument(DemoModel):
    id: str
    no: str
    nomor_urut: int
    klien: str
    nama_pt: str
    nama_pic: str
    jenis: str
    tgl: str
    deadline: str
    status: DocumentStatus
    owner: str
    uploader: str
    reviewer: str
    issue: str = ""
    note: str = ""
    f: DemoFields
    conf: dict[FieldName, float]
    src: DemoFields
    has_file: bool = False
    items: list[DemoItem] = Field(default_factory=list)
    tax: list[DemoTaxLine] | None = None
    approvers: Literal[1, 2] = 1
    voucher_no: str | None = None


class DemoDocumentSummary(DemoModel):
    id: str
    no: str
    nomor_urut: int
    klien: str
    nama_pt: str
    nama_pic: str
    jenis: str
    deadline: str
    status: DocumentStatus
    issue: str
    uploader: str
    owner: str
    reviewer: str
    tax_set: bool
    voucher_no: str | None = None


class DemoWorkloadRow(DemoModel):
    id: str
    no: str
    klien: str
    jenis: str
    deadline: str
    status: DocumentStatus
    reviewer: str
    uploader: str
    conflict: bool


class DemoAssignment(DemoModel):
    id: str
    support_id: str
    klien: list[str]


class DemoClientSummary(DemoModel):
    name: str
    code: str
    docs: int
    assignees: list[str]


class DemoAccessRequest(DemoModel):
    id: str
    type: Literal["reset"]
    by: str
    text: str
    date: str


class DemoAuditEvent(DemoModel):
    k: Literal["doc", "workload", "admin", "security"]
    d: str
    t: str
    a: str
    w: str
    x: str
    bot: bool = False


class DemoVoucher(DemoModel):
    id: str
    no: str
    number: str | None
    nomor_urut: int
    klien: str
    nama_pt: str
    nama_pic: str
    status: DocumentStatus
    reviewer: str
    submitter: str
    nama: str
    perusahaan: str
    periode: str
    nominal: int
    dpp: int
    add: int
    withhold: int
    tax_text: str
    rows: list[dict[str, str | int | bool | None]]
    total: int
    approvers: Literal[1, 2]
    f: dict[str, str | int]


class LoginRequest(DemoModel):
    email: EmailStr
    password: str


class FieldCorrection(DemoModel):
    value: str


class DecisionRequest(DemoModel):
    kind: Literal["approve", "reject", "return"]
    reason: str = ""


class TaxUpdate(DemoModel):
    tax: list[DemoTaxLine] = Field(max_length=8)
    approvers: Literal[1, 2] = 1


class ResubmitRequest(DemoModel):
    note: str = Field(default="", max_length=300)


class DemoUploadRequest(DemoModel):
    klien: str
    jenis: str
    tgl: str
    cat: str = Field(default="", max_length=300)
    tax: list[DemoTaxLine] = Field(default_factory=list, max_length=8)
    approvers: Literal[1, 2] = 1
    file_name: str


class ReassignRequest(DemoModel):
    reviewer_id: str


class AssignmentUpdate(DemoModel):
    klien: list[str]


class ClientCreate(DemoModel):
    name: str = Field(min_length=1, max_length=100)


class UserCreate(DemoModel):
    name: str = Field(min_length=3, max_length=60)
    email: EmailStr
    role: Role
    password: str = Field(min_length=8)


class RoleUpdate(DemoModel):
    role: Role


class AccessDecision(DemoModel):
    approved: bool


class DemoActionResult(DemoModel):
    ok: bool = True
    msg: str
    doc_id: str | None = None


class DemoLoginResult(DemoModel):
    user: DemoUser
