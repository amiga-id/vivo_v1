from fastapi import APIRouter

from app.api.v1 import (
    admin,
    audit,
    auth,
    demo,
    documents,
    lead,
    rag,
    vendors,
    vouchers,
)

router = APIRouter(prefix="/v1")
router.include_router(admin.router)
router.include_router(auth.router)
router.include_router(audit.router)
router.include_router(vendors.router)
router.include_router(demo.router)
router.include_router(documents.router)
router.include_router(lead.router)
router.include_router(rag.router)
router.include_router(vouchers.router)
