from app.schemas.response import (
    PageDetails,
    PagedResponse,
)

itemsPerPage = 10  # TODO: put in settings


def resolve_paging(page: PageDetails | None = None) -> tuple[int, int]:
    page = PageDetails(index=1, size=10) if page is None else page

    return [page.size, (page.index - 1) * page.size]


def to_paged_response[T](data: T, total: int, page: PageDetails) -> PagedResponse[T]:
    return PagedResponse[T](
        success=True,
        data=data,
        page=PageDetails(
            index=page and page.index or 1,
            size=page and page.size or itemsPerPage,
            total=total,
        ),
    )
