from fastapi import APIRouter

from app.api.v1 import (
    auth,
    demo,
    documents,
    vendors,
)

router = APIRouter(prefix="/v1")
router.include_router(auth.router)
router.include_router(vendors.router)
router.include_router(demo.router)
router.include_router(documents.router)
