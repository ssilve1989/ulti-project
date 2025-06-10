export interface PaginationConfig {
  currentPage: number;
  totalPages: number;
  maxVisible?: number;
}

export interface PaginationResult {
  pages: (number | string)[];
  hasPrevious: boolean;
  hasNext: boolean;
  showFirstEllipsis: boolean;
  showLastEllipsis: boolean;
}

/**
 * Generate pagination page numbers with ellipsis support
 * Consolidates logic from Pagination.astro and SignupsTable/paginationUtils.ts
 */
export function generatePaginationPages(
  currentPage: number,
  totalPages: number,
  maxVisible = 5,
): (number | string)[] {
  const pages: (number | string)[] = [];

  if (totalPages <= maxVisible) {
    // Show all pages if total is within max visible
    for (let i = 1; i <= totalPages; i++) {
      pages.push(i);
    }
    return pages;
  }

  let start = Math.max(1, currentPage - 2);
  let end = Math.min(totalPages, currentPage + 2);

  // Adjust range to maintain maxVisible pages when possible
  if (end - start + 1 < maxVisible) {
    if (start === 1) {
      end = Math.min(totalPages, start + maxVisible - 1);
    } else {
      start = Math.max(1, end - maxVisible + 1);
    }
  }

  // Add first page and ellipsis if needed
  if (start > 1) {
    pages.push(1);
    if (start > 2) {
      pages.push('...');
    }
  }

  // Add visible page range
  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  // Add ellipsis and last page if needed
  if (end < totalPages) {
    if (end < totalPages - 1) {
      pages.push('...');
    }
    pages.push(totalPages);
  }

  return pages;
}

/**
 * Get pagination state information
 */
export function getPaginationState(
  currentPage: number,
  totalPages: number,
  maxVisible = 5,
): PaginationResult {
  const pages = generatePaginationPages(currentPage, totalPages, maxVisible);

  return {
    pages,
    hasPrevious: currentPage > 1,
    hasNext: currentPage < totalPages,
    showFirstEllipsis: pages.includes('...') && pages[1] === '...',
    showLastEllipsis:
      pages.includes('...') && pages[pages.length - 2] === '...',
  };
}

/**
 * Calculate pagination indices for data slicing
 */
export function getPaginationIndices(
  currentPage: number,
  pageSize: number,
): { startIndex: number; endIndex: number } {
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;

  return { startIndex, endIndex };
}

/**
 * Calculate total pages from item count and page size
 */
export function calculateTotalPages(
  totalItems: number,
  pageSize: number,
): number {
  return Math.ceil(totalItems / pageSize);
}
