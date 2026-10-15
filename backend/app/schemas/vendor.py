from pydantic import BaseModel, Field, field_validator


class VendorCreateRequest(BaseModel):
    name: str = Field(max_length=255)
    pic: str = Field(max_length=255)
    email: str = Field(max_length=255)
    phone_number: str | None = Field(default=None, max_length=255)
    address: str | None = Field(default=None, max_length=255)

    @field_validator("name", "pic")
    @classmethod
    def required_text_must_not_be_empty(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Field wajib diisi.")
        return value

    @field_validator("email")
    @classmethod
    def normalize_and_validate_email(cls, value: str) -> str:
        value = value.strip().lower()
        if "@" not in value or "." not in value.rsplit("@", 1)[-1]:
            raise ValueError("Alamat email tidak valid.")
        return value

    @field_validator("phone_number", "address")
    @classmethod
    def normalize_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        return value or None


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
