from uuid import UUID

from shortuuid import (
    decode,
    encode,
)


def is_uuid(uuid: str, version: int = 7) -> tuple[bool, UUID | None]:
    try:
        uuid_obj = UUID(uuid, version=version)
    except ValueError, TypeError:
        return False, None

    return uuid_obj is not None and str(uuid_obj) == uuid.lower(), uuid_obj


def from_uuid(str: UUID | str) -> str:
    return encode(str if isinstance(str, UUID) else UUID(str))


def to_uuid(str: str) -> UUID:
    ok, uuid = is_uuid(str)

    return uuid if ok else decode(str)
