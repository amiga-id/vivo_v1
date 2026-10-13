from typing import Any

from pydantic import (
    BaseModel,
    ConfigDict,
)


class ErrorDetails(BaseModel):
    message: str
    code: int | None = None
    action: str | None = None
    details: list[Any] | None = None


class ApiResponse[T](BaseModel):
    success: bool = True
    data: T | None = None
    error: ErrorDetails | str | None = None


class PageDetails(BaseModel):
    index: int
    size: int
    total: int | None = None


class PagedRequest[T](BaseModel):
    page: PageDetails | None = None
    query: str | T | None = None


class PagedResponse[T](BaseModel):
    model_config = ConfigDict(exclude_none=True)

    success: bool = True
    page: PageDetails
    data: list[T]
    error: ErrorDetails | str | None = None
