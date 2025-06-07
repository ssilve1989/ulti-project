import { useEffect, useRef, useState } from 'react';
import type { SignupFilters } from './useFiltering.js';

export function usePagination(totalItems: number, filters: SignupFilters) {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Reset to page 1 when filters change
  const prevFiltersRef = useRef(filters);
  useEffect(() => {
    const filtersChanged =
      prevFiltersRef.current.encounter !== filters.encounter ||
      prevFiltersRef.current.partyType !== filters.partyType ||
      prevFiltersRef.current.search !== filters.search;

    if (filtersChanged) {
      setCurrentPage(1);
      prevFiltersRef.current = filters;
    }
  });

  const totalPages = Math.ceil(totalItems / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;

  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  const changePageSize = (newSize: number) => {
    setPageSize(newSize);
    setCurrentPage(1);
  };

  return {
    currentPage,
    pageSize,
    totalPages,
    startIndex,
    endIndex,
    goToPage,
    changePageSize,
  };
}
