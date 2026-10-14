from pydantic import (
    BaseModel,
)


class VendorFilterRequest(BaseModel):
    name: str | None = None
    email: str | None = None


class VendorResponse(BaseModel):
    id: str
    name: str
    pic: str
    email: str
    phone_number: str | None
    address: str | None
    created_at: str
    updated_at: str | None
