from typing import Annotated

from fastapi import APIRouter, Header, HTTPException, status

from app.core.config import settings
from app.schemas.demo import (
    AccessDecision,
    AssignmentUpdate,
    ClientCreate,
    DecisionRequest,
    DemoAccessRequest,
    DemoActionResult,
    DemoAssignment,
    DemoAuditEvent,
    DemoClientSummary,
    DemoDocument,
    DemoDocumentSummary,
    DemoFields,
    DemoLoginResult,
    DemoTaxDocument,
    DemoUploadRequest,
    DemoUser,
    DemoVoucher,
    DemoWorkloadRow,
    FieldCorrection,
    FieldName,
    LoginRequest,
    ReassignRequest,
    ResubmitRequest,
    RoleUpdate,
    TaxUpdate,
    UserCreate,
)
from app.schemas.response import ApiResponse
from app.services import demo as demo_service
from app.services.demo import DemoError, DemoState

router = APIRouter(prefix="/demo", tags=["Demo feature API"])


def _demo_state() -> DemoState:
    if not settings.is_development:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Demo API is disabled outside development mode.",
        )
    return demo_service.state


def _execute(operation):
    try:
        return operation()
    except DemoError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc


def _actor(demo_state: DemoState, demo_user: str) -> DemoUser:
    return _execute(lambda: demo_state.user(demo_user))


def _authorized_user(demo_state: DemoState, demo_user: str, *roles: str) -> DemoUser:
    user = _actor(demo_state, demo_user)
    _execute(lambda: demo_state.require_role(user, *roles))
    return user


@router.post(
    "/auth/login",
    response_model=ApiResponse[DemoLoginResult],
    response_model_exclude_none=True,
)
def demo_login(request: LoginRequest):
    demo_state = _demo_state()
    credentials = demo_state.credentials.get(request.email.strip().lower())
    if credentials is None or request.password != credentials[1]:
        raise HTTPException(status_code=401, detail="Email atau kata sandi salah.")
    user = next(
        (entry for entry in demo_state.users if entry.id == credentials[0]), None
    )
    if user is None:
        raise HTTPException(status_code=401, detail="Email atau kata sandi salah.")
    if user.status != "Aktif":
        raise HTTPException(status_code=403, detail="Akun demo belum aktif.")
    return ApiResponse(
        success=True, data=DemoLoginResult(user=demo_service.public_user(user))
    )


@router.get(
    "/queue",
    response_model=ApiResponse[list[DemoDocumentSummary]],
    response_model_exclude_none=True,
)
def get_queue(x_demo_user: Annotated[str, Header()] = "sari"):
    demo_state = _demo_state()
    user = _actor(demo_state, x_demo_user)
    return ApiResponse(success=True, data=_execute(lambda: demo_state.queue(user)))


@router.get(
    "/workload",
    response_model=ApiResponse[list[DemoWorkloadRow]],
    response_model_exclude_none=True,
)
def get_workload(x_demo_user: Annotated[str, Header()] = "bayu"):
    demo_state = _demo_state()
    user = _actor(demo_state, x_demo_user)
    return ApiResponse(success=True, data=_execute(lambda: demo_state.workload(user)))


@router.get(
    "/documents/{doc_id}",
    response_model=ApiResponse[DemoDocument],
    response_model_exclude_none=True,
)
def get_document(doc_id: str, x_demo_user: Annotated[str, Header()] = "rina"):
    demo_state = _demo_state()
    user = _actor(demo_state, x_demo_user)
    document = _execute(lambda: demo_state.document(doc_id))
    _execute(lambda: demo_state.accessible_document(user, document))
    return ApiResponse(success=True, data=document.model_copy(deep=True))


@router.post(
    "/documents",
    status_code=status.HTTP_201_CREATED,
    response_model=ApiResponse[DemoDocument],
    response_model_exclude_none=True,
)
def upload_document(
    request: DemoUploadRequest,
    x_demo_user: Annotated[str, Header()] = "dewi",
):
    demo_state = _demo_state()
    user = _actor(demo_state, x_demo_user)
    result = _execute(lambda: demo_service.upload_document(user, request, demo_state))
    return ApiResponse(success=True, data=result.model_copy(deep=True))


@router.patch(
    "/documents/{doc_id}/fields/{field_name}",
    response_model=ApiResponse[DemoActionResult],
    response_model_exclude_none=True,
)
def correct_field(
    doc_id: str,
    field_name: FieldName,
    request: FieldCorrection,
    x_demo_user: Annotated[str, Header()] = "rina",
):
    demo_state = _demo_state()
    user = _actor(demo_state, x_demo_user)
    document = _execute(lambda: demo_state.document(doc_id))
    _execute(lambda: demo_state.accessible_document(user, document))
    if user.role != "finance":
        raise HTTPException(
            status_code=403, detail="Hanya Finance dapat mengoreksi field."
        )
    old_value = getattr(document.f, field_name)
    if field_name in ("dpp", "ppn", "total"):
        digits = "".join(
            character for character in request.value if character.isdigit()
        )
        new_value: str | int = int(digits or "0")
    else:
        new_value = request.value.strip()
    fields = document.f.model_copy(update={field_name: new_value})
    document.f = DemoFields.model_validate(fields.model_dump())
    document.conf[field_name] = 1
    demo_state.add_event(
        "doc",
        doc_id,
        user,
        f"Data dikoreksi: {field_name}",
        f"Dari {old_value} menjadi {new_value}.",
    )
    message = (
        "Tidak ada perubahan."
        if str(old_value) == str(new_value)
        else "Koreksi tersimpan."
    )
    return ApiResponse(success=True, data=DemoActionResult(msg=message))


@router.post(
    "/documents/{doc_id}/decision",
    response_model=ApiResponse[DemoActionResult],
    response_model_exclude_none=True,
)
def decide_document(
    doc_id: str,
    request: DecisionRequest,
    x_demo_user: Annotated[str, Header()] = "rina",
):
    demo_state = _demo_state()
    user = _actor(demo_state, x_demo_user)
    document = _execute(lambda: demo_state.document(doc_id))
    _execute(lambda: demo_state.accessible_document(user, document))
    if user.role != "finance":
        raise HTTPException(
            status_code=403, detail="Hanya Finance dapat memutuskan dokumen."
        )
    if document.status != "Dalam Review":
        raise HTTPException(
            status_code=409, detail="Dokumen tidak sedang Dalam Review."
        )
    if request.kind == "approve":
        if document.tax is None:
            raise HTTPException(status_code=409, detail="Pajak belum diatur.")
        document.status = "Disetujui"
        client = demo_state.clients[document.klien]
        client["counter"] += 1
        document.voucher_no = f"VCH-{client['code']}-{client['counter']:04d}"
        document.issue = ""
        message = f"Disetujui. Voucher {document.voucher_no} diterbitkan."
    else:
        reason = request.reason.strip()
        if not reason:
            raise HTTPException(status_code=422, detail="Alasan wajib diisi.")
        document.status = "Ditolak" if request.kind == "reject" else "Dikembalikan"
        document.issue = reason
        message = (
            "Dokumen ditolak."
            if request.kind == "reject"
            else "Dokumen dikembalikan untuk diperbaiki."
        )
    demo_state.add_event("doc", doc_id, user, "Keputusan dokumen", message)
    return ApiResponse(success=True, data=DemoActionResult(msg=message))


@router.get(
    "/documents/{doc_id}/tax",
    response_model=ApiResponse[DemoTaxDocument],
    response_model_exclude_none=True,
)
def get_document_tax(doc_id: str, x_demo_user: Annotated[str, Header()] = "dewi"):
    demo_state = _demo_state()
    user = _actor(demo_state, x_demo_user)
    document = _execute(lambda: demo_state.document(doc_id))
    _execute(lambda: demo_state.accessible_document(user, document))
    if user.role != "support":
        raise HTTPException(
            status_code=403, detail="Hanya Support dapat mengelola pajak."
        )
    return ApiResponse(
        success=True,
        data=DemoTaxDocument(
            id=document.id,
            no=document.no,
            klien=document.klien,
            vendor=document.f.vendor,
            status=document.status,
            dpp=document.f.dpp,
            ppn_invoice=document.f.ppn,
            tax=[line.model_copy(deep=True) for line in document.tax]
            if document.tax is not None
            else None,
            approvers=document.approvers,
        ),
    )


@router.put(
    "/documents/{doc_id}/tax",
    response_model=ApiResponse[DemoActionResult],
    response_model_exclude_none=True,
)
def update_document_tax(
    doc_id: str,
    request: TaxUpdate,
    x_demo_user: Annotated[str, Header()] = "dewi",
):
    demo_state = _demo_state()
    user = _actor(demo_state, x_demo_user)
    document = _execute(lambda: demo_state.document(doc_id))
    _execute(lambda: demo_state.accessible_document(user, document))
    if user.role != "support":
        raise HTTPException(
            status_code=403, detail="Hanya Support dapat mengelola pajak."
        )
    if document.status in ("Disetujui", "Ditolak"):
        raise HTTPException(status_code=409, detail="Dokumen sudah selesai.")
    codes = [line.code for line in request.tax]
    if len(codes) != len(set(codes)):
        raise HTTPException(status_code=422, detail="Kode pajak tidak boleh duplikat.")
    document.tax = [line.model_copy(deep=True) for line in request.tax]
    document.approvers = request.approvers
    return ApiResponse(
        success=True,
        data=DemoActionResult(msg="Pajak dan jumlah penyetuju tersimpan."),
    )


@router.post(
    "/documents/{doc_id}/resubmit",
    response_model=ApiResponse[DemoActionResult],
    response_model_exclude_none=True,
)
def resubmit_document(
    doc_id: str,
    request: ResubmitRequest,
    x_demo_user: Annotated[str, Header()] = "andi",
):
    demo_state = _demo_state()
    user = _actor(demo_state, x_demo_user)
    document = _execute(lambda: demo_state.document(doc_id))
    _execute(lambda: demo_state.accessible_document(user, document))
    if user.role != "support" or document.status != "Dikembalikan":
        raise HTTPException(
            status_code=409, detail="Dokumen tidak dapat dikirim ulang."
        )
    if document.tax is None:
        raise HTTPException(status_code=409, detail="Pajak belum diatur.")
    document.status = "Dalam Review"
    document.issue = ""
    document.note = request.note
    message = f"Dokumen dikirim ulang ke {document.reviewer}."
    demo_state.add_event("doc", doc_id, user, "Dokumen dikirim ulang", request.note)
    return ApiResponse(success=True, data=DemoActionResult(msg=message))


@router.post(
    "/documents/{doc_id}/reassign",
    response_model=ApiResponse[DemoActionResult],
    response_model_exclude_none=True,
)
def reassign_document(
    doc_id: str,
    request: ReassignRequest,
    x_demo_user: Annotated[str, Header()] = "bayu",
):
    demo_state = _demo_state()
    user = _authorized_user(demo_state, x_demo_user, "lead")
    document = _execute(lambda: demo_state.document(doc_id))
    target = next(
        (item for item in demo_state.users if item.id == request.reviewer_id), None
    )
    if target is None or target.role != "finance" or target.status != "Aktif":
        raise HTTPException(status_code=422, detail="Penerima harus Finance aktif.")
    if target.id == document.uploader:
        raise HTTPException(
            status_code=409, detail="Reviewer tidak boleh sama dengan pengunggah."
        )
    previous = document.reviewer
    document.reviewer = target.id
    demo_state.add_event(
        "workload",
        doc_id,
        user,
        "Tugas dialihkan",
        f"Dari {previous} ke {target.name}.",
    )
    return ApiResponse(
        success=True,
        data=DemoActionResult(msg=f"Tugas {document.no} dialihkan ke {target.name}."),
    )


@router.get(
    "/client-options",
    response_model=ApiResponse[list[str]],
    response_model_exclude_none=True,
)
def get_client_options(x_demo_user: Annotated[str, Header()] = "dewi"):
    demo_state = _demo_state()
    user = _authorized_user(demo_state, x_demo_user, "support")
    clients = demo_state.assigned_clients(user.id, demo_state.assignments)
    return ApiResponse(success=True, data=clients)


@router.get(
    "/assignments",
    response_model=ApiResponse[list[DemoAssignment]],
    response_model_exclude_none=True,
)
def get_assignments(x_demo_user: Annotated[str, Header()] = "bayu"):
    demo_state = _demo_state()
    _authorized_user(demo_state, x_demo_user, "lead", "admin")
    return ApiResponse(
        success=True,
        data=[item.model_copy(deep=True) for item in demo_state.assignments],
    )


@router.put(
    "/assignments/{support_id}",
    response_model=ApiResponse[DemoActionResult],
    response_model_exclude_none=True,
)
def set_assignment(
    support_id: str,
    request: AssignmentUpdate,
    x_demo_user: Annotated[str, Header()] = "bayu",
):
    demo_state = _demo_state()
    user = _authorized_user(demo_state, x_demo_user, "lead")
    target = next((item for item in demo_state.users if item.id == support_id), None)
    if target is None or target.role != "support":
        raise HTTPException(status_code=404, detail="Pengguna Support tidak ditemukan.")
    if len(request.klien) != len(set(request.klien)) or any(
        name not in demo_state.clients for name in request.klien
    ):
        raise HTTPException(status_code=422, detail="Daftar klien tidak valid.")
    assignment = next(
        (item for item in demo_state.assignments if item.support_id == support_id), None
    )
    if assignment is None:
        assignment = DemoAssignment(
            id=f"A-{len(demo_state.assignments) + 1}",
            support_id=support_id,
            klien=request.klien,
        )
        demo_state.assignments.append(assignment)
    else:
        assignment.klien = request.klien
    demo_state.add_event(
        "admin",
        "",
        user,
        "Penugasan klien diperbarui",
        f"{target.name}: {', '.join(request.klien) or 'tidak ada klien'}.",
    )
    return ApiResponse(
        success=True,
        data=DemoActionResult(msg=f"Penugasan {target.name} diperbarui."),
    )


@router.get(
    "/clients",
    response_model=ApiResponse[list[DemoClientSummary]],
    response_model_exclude_none=True,
)
def get_clients(x_demo_user: Annotated[str, Header()] = "sari"):
    demo_state = _demo_state()
    user = _actor(demo_state, x_demo_user)
    return ApiResponse(
        success=True, data=_execute(lambda: demo_state.client_summaries(user))
    )


@router.post(
    "/clients",
    status_code=status.HTTP_201_CREATED,
    response_model=ApiResponse[DemoClientSummary],
    response_model_exclude_none=True,
)
def add_client(
    request: ClientCreate,
    x_demo_user: Annotated[str, Header()] = "sari",
):
    demo_state = _demo_state()
    user = _authorized_user(demo_state, x_demo_user, "admin")
    name = request.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Nama klien wajib diisi.")
    if any(client.casefold() == name.casefold() for client in demo_state.clients):
        raise HTTPException(status_code=409, detail="Klien sudah terdaftar.")
    code = "".join(part[0] for part in name.split() if part).upper()[:3] or "CL"
    suffix = 2
    base = code
    existing_codes = {info["code"] for info in demo_state.clients.values()}
    while code in existing_codes:
        code = f"{base}{suffix}"
        suffix += 1
    demo_state.clients[name] = {
        "code": code,
        "nama_pic": "",
        "next_sequence": 1,
        "counter": 0,
    }
    demo_state.add_event("admin", "", user, "Klien ditambahkan", name)
    return ApiResponse(
        success=True,
        data=DemoClientSummary(name=name, code=code, docs=0, assignees=[]),
    )


@router.get(
    "/users",
    response_model=ApiResponse[list[DemoUser]],
    response_model_exclude_none=True,
)
def get_users(x_demo_user: Annotated[str, Header()] = "sari"):
    demo_state = _demo_state()
    _authorized_user(demo_state, x_demo_user, "admin")
    return ApiResponse(
        success=True,
        data=[demo_service.public_user(user) for user in demo_state.users],
    )


@router.post(
    "/users",
    status_code=status.HTTP_201_CREATED,
    response_model=ApiResponse[DemoUser],
    response_model_exclude_none=True,
)
def create_user(
    request: UserCreate,
    x_demo_user: Annotated[str, Header()] = "sari",
):
    demo_state = _demo_state()
    actor = _authorized_user(demo_state, x_demo_user, "admin")
    email = request.email.strip().lower()
    if email in demo_state.credentials:
        raise HTTPException(status_code=409, detail="Email sudah terdaftar.")
    user = DemoUser(
        id=f"demo-user-{len(demo_state.users) + 1}",
        name=request.name.strip(),
        role=request.role,
        about="Dibuat oleh System Admin.",
        email=email,
    )
    demo_state.users.append(user)
    demo_state.credentials[email] = (user.id, request.password)
    demo_state.add_event(
        "admin", "", actor, "Akun pegawai dibuat", f"{user.name} ({email})."
    )
    return ApiResponse(success=True, data=demo_service.public_user(user))


@router.patch(
    "/users/{user_id}/role",
    response_model=ApiResponse[DemoUser],
    response_model_exclude_none=True,
)
def update_user_role(
    user_id: str,
    request: RoleUpdate,
    x_demo_user: Annotated[str, Header()] = "sari",
):
    demo_state = _demo_state()
    actor = _authorized_user(demo_state, x_demo_user, "admin")
    if user_id == actor.id:
        raise HTTPException(
            status_code=409, detail="Peran akun sendiri tidak dapat diubah."
        )
    target = next((item for item in demo_state.users if item.id == user_id), None)
    if target is None:
        raise HTTPException(status_code=404, detail="Pengguna tidak ditemukan.")
    old_role = target.role
    target.role = request.role
    demo_state.add_event(
        "admin",
        "",
        actor,
        "Peran diubah",
        f"{target.name}: {old_role} menjadi {request.role}.",
    )
    return ApiResponse(success=True, data=demo_service.public_user(target))


@router.get(
    "/access-requests",
    response_model=ApiResponse[list[DemoAccessRequest]],
    response_model_exclude_none=True,
)
def get_access_requests(x_demo_user: Annotated[str, Header()] = "sari"):
    demo_state = _demo_state()
    _authorized_user(demo_state, x_demo_user, "admin")
    return ApiResponse(
        success=True, data=[item.model_copy(deep=True) for item in demo_state.requests]
    )


@router.post(
    "/access-requests/{request_id}/decision",
    response_model=ApiResponse[DemoActionResult],
    response_model_exclude_none=True,
)
def decide_access_request(
    request_id: str,
    request: AccessDecision,
    x_demo_user: Annotated[str, Header()] = "sari",
):
    demo_state = _demo_state()
    actor = _actor(demo_state, x_demo_user)
    message = _execute(
        lambda: demo_service.decide_access_request(
            actor, request_id, request, demo_state
        )
    )
    return ApiResponse(success=True, data=DemoActionResult(msg=message))


@router.get(
    "/audit",
    response_model=ApiResponse[list[DemoAuditEvent]],
    response_model_exclude_none=True,
)
def get_audit(x_demo_user: Annotated[str, Header()] = "sari"):
    demo_state = _demo_state()
    user = _actor(demo_state, x_demo_user)
    return ApiResponse(success=True, data=demo_state.audit(user))


@router.get(
    "/vouchers",
    response_model=ApiResponse[list[DemoDocumentSummary]],
    response_model_exclude_none=True,
)
def get_vouchers(x_demo_user: Annotated[str, Header()] = "rina"):
    demo_state = _demo_state()
    user = _actor(demo_state, x_demo_user)
    return ApiResponse(success=True, data=_execute(lambda: demo_state.vouchers(user)))


@router.get(
    "/vouchers/{doc_id}",
    response_model=ApiResponse[DemoVoucher],
    response_model_exclude_none=True,
)
def get_voucher(doc_id: str, x_demo_user: Annotated[str, Header()] = "rina"):
    demo_state = _demo_state()
    user = _actor(demo_state, x_demo_user)
    return ApiResponse(
        success=True, data=_execute(lambda: demo_state.voucher(user, doc_id))
    )


@router.post(
    "/vouchers/{doc_id}/download",
    response_model=ApiResponse[DemoActionResult],
    response_model_exclude_none=True,
)
def download_voucher(doc_id: str, x_demo_user: Annotated[str, Header()] = "dewi"):
    demo_state = _demo_state()
    user = _authorized_user(demo_state, x_demo_user, "support")
    document = _execute(lambda: demo_state.document(doc_id))
    _execute(lambda: demo_state.accessible_document(user, document))
    if document.status != "Disetujui":
        raise HTTPException(status_code=409, detail="Voucher belum disetujui Finance.")
    demo_state.add_event(
        "doc",
        doc_id,
        user,
        "Voucher diunduh",
        f"{document.voucher_no} diunduh sebagai PDF.",
    )
    return ApiResponse(
        success=True,
        data=DemoActionResult(msg="Voucher siap dicetak atau disimpan sebagai PDF."),
    )
