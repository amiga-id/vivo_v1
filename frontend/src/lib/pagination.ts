import { useEffect, useState } from 'react';

export const PAGE_SIZE = 10;

export function usePagination<T>(items: readonly T[], resetKey?: string) {
  const [page, setPage] = useState(1);
  const pageCount = Math.ceil(items.length / PAGE_SIZE);
  const currentPage = Math.min(page, Math.max(pageCount, 1));

  useEffect(() => {
    setPage(1);
  }, [resetKey]);

  useEffect(() => {
    if (page > Math.max(pageCount, 1)) {
      setPage(Math.max(pageCount, 1));
    }
  }, [page, pageCount]);

  return {
    page: currentPage,
    pageCount,
    pageItems: items.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    firstItem: items.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1,
    lastItem: Math.min(currentPage * PAGE_SIZE, items.length),
    setPage,
  };
}
