interface PaginationProps {
  page: number;
  pageCount: number;
  firstItem: number;
  lastItem: number;
  totalItems: number;
  onPageChange: (page: number) => void;
}

export default function Pagination({
  page,
  pageCount,
  firstItem,
  lastItem,
  totalItems,
  onPageChange,
}: PaginationProps) {
  if (pageCount <= 1) return null;

  const startPage = Math.max(1, Math.min(page - 2, pageCount - 4));
  const visiblePageCount = Math.min(pageCount, 5);

  return (
    <nav className="pagination" aria-label="Navigasi halaman">
      <span className="pagination-summary" aria-live="polite">
        Menampilkan {firstItem}–{lastItem} dari {totalItems}
      </span>
      <div className="pagination-controls">
        <button
          className="btn sm"
          type="button"
          disabled={page === 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Halaman sebelumnya"
        >
          Sebelumnya
        </button>
        {Array.from({ length: visiblePageCount }, (_, index) => startPage + index).map(number => (
          <button
            className="btn sm"
            type="button"
            key={number}
            aria-label={`Halaman ${number}`}
            aria-current={page === number ? 'page' : undefined}
            onClick={() => onPageChange(number)}
          >
            {number}
          </button>
        ))}
        <button
          className="btn sm"
          type="button"
          disabled={page === pageCount}
          onClick={() => onPageChange(page + 1)}
          aria-label="Halaman berikutnya"
        >
          Berikutnya
        </button>
      </div>
    </nav>
  );
}
