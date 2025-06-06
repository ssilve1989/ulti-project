export function generatePageNumbers(
  currentPage: number,
  totalPages: number,
  maxVisible = 5,
): (number | string)[] {
  const pages: (number | string)[] = [];
  let start = Math.max(1, currentPage - 2);
  let end = Math.min(totalPages, currentPage + 2);

  if (end - start + 1 < maxVisible) {
    if (start === 1) {
      end = Math.min(totalPages, start + maxVisible - 1);
    } else {
      start = Math.max(1, end - maxVisible + 1);
    }
  }

  if (start > 1) {
    pages.push(1);
    if (start > 2) {
      pages.push('...');
    }
  }

  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  if (end < totalPages) {
    if (end < totalPages - 1) {
      pages.push('...');
    }
    pages.push(totalPages);
  }

  return pages;
}
