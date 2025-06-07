import type {
  EncounterInfo,
  SignupDisplayData,
} from '@ulti-project/shared/types';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  type SignupChangeEvent,
  createSignupsEventSource,
} from '../lib/api.js';

interface SignupsTableProps {
  initialSignups: SignupDisplayData[];
  encounters: EncounterInfo[];
}

export function SignupsTable({
  initialSignups,
  encounters,
}: SignupsTableProps) {
  // State for real-time signups data
  const [signups, setSignups] = useState<SignupDisplayData[]>(initialSignups);
  const [isConnected, setIsConnected] = useState(false);

  // UI State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [filters, setFilters] = useState({
    encounter: '',
    partyType: '',
    role: '',
    search: '',
  });

  // Handle SSE updates
  const handleSignupChange = useCallback((event: SignupChangeEvent) => {
    setSignups((prevSignups) => {
      const { type, doc } = event;

      switch (type) {
        case 'added':
          // Check if signup already exists (to handle initial load)
          if (prevSignups.some((s) => s.id === doc.id)) {
            return prevSignups;
          }
          return [...prevSignups, doc];

        case 'modified':
          return prevSignups.map((signup) =>
            signup.id === doc.id ? doc : signup,
          );

        case 'removed':
          return prevSignups.filter((signup) => signup.id !== doc.id);

        default:
          return prevSignups;
      }
    });
  }, []);

  // Set up SSE connection
  useEffect(() => {
    const eventSource = createSignupsEventSource();

    if (!eventSource) {
      return; // SSR or mock disabled
    }

    const handleMessage = (event: MessageEvent) => {
      try {
        const changeEvent: SignupChangeEvent = JSON.parse(event.data);
        handleSignupChange(changeEvent);
      } catch (error) {
        console.error('Failed to parse SSE message:', error);
      }
    };

    const handleOpen = () => {
      setIsConnected(true);
      console.log('SSE connection established');
    };

    const handleError = (error: Event) => {
      setIsConnected(false);
      console.error('SSE connection error:', error);
    };

    eventSource.addEventListener('message', handleMessage);
    eventSource.addEventListener('open', handleOpen);
    eventSource.addEventListener('error', handleError);

    return () => {
      eventSource.close();
      setIsConnected(false);
    };
  }, [handleSignupChange]);

  // Client-side filtering
  const filteredSignups = useMemo(() => {
    return signups.filter((signup) => {
      if (filters.encounter && signup.encounter !== filters.encounter)
        return false;
      if (filters.partyType && signup.partyType !== filters.partyType)
        return false;
      if (filters.role && signup.role !== filters.role) return false;
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        const matchesName = signup.characterName
          .toLowerCase()
          .includes(searchLower);
        const matchesWorld = signup.world.toLowerCase().includes(searchLower);
        if (!matchesName && !matchesWorld) return false;
      }
      return true;
    });
  }, [signups, filters]);

  // Client-side pagination
  const totalItems = filteredSignups.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedSignups = filteredSignups.slice(startIndex, endIndex);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filters]);

  // Pagination controls
  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  const changePageSize = (newSize: number) => {
    setPageSize(newSize);
    setCurrentPage(1);
  };

  // Generate page numbers for pagination
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisible = 5;
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
  };

  return (
    <div>
      {/* Connection Status */}
      <div className="connection-status">
        <div
          className={`status-indicator ${isConnected ? 'connected' : 'disconnected'}`}
        >
          <span className="status-dot" />
          {isConnected ? 'Live Updates Active' : 'Connecting...'}
        </div>
      </div>

      {/* Filters */}
      <div className="filters-container">
        <h2 className="filters-title">Filters</h2>
        <div className="filters-grid">
          <div className="filter-group">
            <label htmlFor="encounter" className="filter-label">
              Encounter
            </label>
            <select
              id="encounter"
              className="filter-select"
              value={filters.encounter}
              onChange={(e) =>
                setFilters({ ...filters, encounter: e.target.value })
              }
            >
              <option value="">All Encounters</option>
              {encounters.map((encounter) => (
                <option key={encounter.id} value={encounter.id}>
                  {encounter.shortName}
                </option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <label htmlFor="partyType" className="filter-label">
              Party Type
            </label>
            <select
              id="partyType"
              className="filter-select"
              value={filters.partyType}
              onChange={(e) =>
                setFilters({ ...filters, partyType: e.target.value })
              }
            >
              <option value="">All Types</option>
              <option value="Early Prog">Early Prog</option>
              <option value="Prog">Prog</option>
              <option value="Clear">Clear</option>
            </select>
          </div>
          <div className="filter-group">
            <label htmlFor="role" className="filter-label">
              Role
            </label>
            <select
              id="role"
              className="filter-select"
              value={filters.role}
              onChange={(e) => setFilters({ ...filters, role: e.target.value })}
            >
              <option value="">All Roles</option>
              <option value="Tank">Tank</option>
              <option value="Healer">Healer</option>
              <option value="DPS">DPS</option>
            </select>
          </div>
          <div className="filter-group">
            <label htmlFor="search" className="filter-label">
              Search
            </label>
            <input
              type="text"
              id="search"
              placeholder="Character name or world..."
              className="filter-input"
              value={filters.search}
              onChange={(e) =>
                setFilters({ ...filters, search: e.target.value })
              }
            />
          </div>
        </div>
      </div>

      {/* Stats and Pagination Info */}
      <div className="stats-container">
        <div className="stats-info">
          <p className="stats-text">
            Showing{' '}
            <span className="stats-count">{paginatedSignups.length}</span> of
            <span className="stats-total"> {totalItems}</span> approved signups
            <span className="total-signups"> (Total: {signups.length})</span>
          </p>
          <p className="pagination-info">
            Page {currentPage} of {totalPages || 1}
          </p>
        </div>
        <div className="page-size-selector">
          <label htmlFor="pageSize" className="page-size-label">
            Show:
          </label>
          <select
            id="pageSize"
            className="page-size-select"
            value={pageSize}
            onChange={(e) => changePageSize(Number.parseInt(e.target.value))}
          >
            <option value="10">10</option>
            <option value="20">20</option>
            <option value="50">50</option>
            <option value="100">100</option>
          </select>
          <span className="page-size-label">per page</span>
        </div>
      </div>

      {/* Signups Table */}
      <div className="table-container">
        <div className="table-wrapper">
          <table className="signups-table">
            <thead className="table-header">
              <tr>
                <th className="table-header-cell">Character</th>
                <th className="table-header-cell">Encounter</th>
                <th className="table-header-cell">Party Type</th>
                <th className="table-header-cell">Role/Job</th>
                <th className="table-header-cell">Prog Point</th>
              </tr>
            </thead>
            <tbody className="table-body">
              {paginatedSignups.map((signup) => (
                <tr key={signup.id} className="table-row">
                  <td className="table-cell">
                    <div>
                      <div className="character-name">
                        {signup.characterName}
                      </div>
                      <div className="character-world">{signup.world}</div>
                    </div>
                  </td>
                  <td className="table-cell">
                    <span className="badge badge-encounter">
                      {signup.encounter}
                    </span>
                  </td>
                  <td className="table-cell">
                    <span
                      className={`badge ${
                        signup.partyType === 'Clear'
                          ? 'badge-clear'
                          : signup.partyType === 'Prog'
                            ? 'badge-prog'
                            : 'badge-early-prog'
                      }`}
                    >
                      {signup.partyType}
                    </span>
                  </td>
                  <td className="table-cell">
                    <div>
                      <div className="role-name">{signup.role}</div>
                      <div className="job-name">{signup.job}</div>
                    </div>
                  </td>
                  <td className="table-cell">
                    <div className="prog-point">{signup.progPoint}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="pagination-container">
          <div className="pagination-controls">
            <button
              type="button"
              className={`pagination-button ${currentPage === 1 ? 'disabled' : ''}`}
              onClick={() => goToPage(1)}
              disabled={currentPage === 1}
              aria-label="First page"
            >
              ⟪
            </button>
            <button
              type="button"
              className={`pagination-button ${currentPage === 1 ? 'disabled' : ''}`}
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage === 1}
              aria-label="Previous page"
            >
              ⟨
            </button>

            {/* Page numbers */}
            {getPageNumbers().map((page, index) => {
              if (page === '...') {
                return (
                  <span
                    key={`ellipsis-${currentPage}-${index}`}
                    className="pagination-ellipsis"
                  >
                    ...
                  </span>
                );
              }
              return (
                <button
                  type="button"
                  key={page}
                  className={`pagination-button ${page === currentPage ? 'active' : ''}`}
                  onClick={() => goToPage(page as number)}
                >
                  {page}
                </button>
              );
            })}

            <button
              type="button"
              className={`pagination-button ${currentPage === totalPages ? 'disabled' : ''}`}
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage === totalPages}
              aria-label="Next page"
            >
              ⟩
            </button>
            <button
              type="button"
              className={`pagination-button ${currentPage === totalPages ? 'disabled' : ''}`}
              onClick={() => goToPage(totalPages)}
              disabled={currentPage === totalPages}
              aria-label="Last page"
            >
              ⟫
            </button>
          </div>
        </div>
      )}

      {/* Empty State */}
      {totalItems === 0 && (
        <div className="empty-state">
          <div className="empty-message">
            No signups found matching your filters.
          </div>
          <p className="empty-subtext">Try adjusting your search criteria.</p>
        </div>
      )}
    </div>
  );
}
