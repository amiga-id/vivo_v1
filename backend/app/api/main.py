from fastapi import APIRouter

from app.api.v1 import (
    auth,
    vendors,
)

router = APIRouter(prefix="/v1")
router.include_router(auth.router)
router.include_router(vendors.router)
