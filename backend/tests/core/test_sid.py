from uuid import UUID

from app.core.sid import (
    from_uuid,
    to_uuid,
)

ids: dict[str, str] = {
    "01a084df-184d-73d6-b921-0f842d0b8aed": "2JWYA8EPvheESx7NN3PGBj",
}


def test_short_id_from_str():
    for k, v in ids.items():
        assert v == from_uuid(k)


def test_short_id_from_uuid():
    for k, v in ids.items():
        assert v == from_uuid(UUID(k))


def test_str_to_short_id():
    for k, v in ids.items():
        assert UUID(k) == to_uuid(v)
