from pydantic import (
    BaseModel,
    computed_field,
    field_validator,
)


class AuthToken(BaseModel):
    access_token: str
    token_type: str
    expires: str

    @computed_field
    @property
    def authorization(self) -> str:
        return f"{self.token_type.capitalize()} {self.access_token}"


class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def email_must_contain_at(cls, v: str) -> str:
        if "@" not in v or "." not in v.split("@")[-1]:
            raise ValueError("Invalid email address")
        return v.lower().strip()


class RegisterResponse(BaseModel):
    id: str
    name: str
    email: str
    created_at: str


class LoginRequest(BaseModel):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def email_must_contain_at(cls, v: str) -> str:
        if "@" not in v or "." not in v.split("@")[-1]:
            raise ValueError("Invalid email address")
        return v.lower().strip()


class LoginResponse(BaseModel):
    email: str
    access_token: str
    token_type: str
    expires: str


class AccountFilterRequest(BaseModel):
    name: str | None = None
    email: str | None = None


class AccountUpdateRequest(BaseModel):
    name: str | None = None
    phone_number: str | None = None
    avatar_url: str | None = None
    about: str | None = None


class AccountResponse(BaseModel):
    id: str
    name: str
    email: str
    email_verified: bool
    phone_number: str | None
    phone_verified: bool
    avatar_url: str | None
    avatar_provider: str
    about: str | None
    created_at: str
    updated_at: str | None
