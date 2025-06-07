import { generatePageNumbers } from './paginationUtils.js';
import { useFiltering } from './useFiltering.js';
import { usePagination } from './usePagination.js';
import { useSignupsData } from './useSignupsData.js';

export function SignupsTable() {
  // Data management
  const {
    signups,
    encounters,
    isConnected,
    isLoading,
    error,
    recentlyUpdated,
    useMockData,
  } = useSignupsData();

  // Filtering
  const { filters, setFilters, filteredSignups } = useFiltering(signups);

  // Pagination
  const totalItems = filteredSignups.length;
  const {
    currentPage,
    pageSize,
    totalPages,
    startIndex,
    endIndex,
    goToPage,
    changePageSize,
  } = usePagination(totalItems, filters);

  const paginatedSignups = filteredSignups.slice(startIndex, endIndex);

  // Loading state
  if (isLoading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner" />
        <p>Loading signups...</p>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="error-container">
        <div className="error-message">
          <h3>Failed to load signups</h3>
          <p>{error}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="retry-button"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Connection Status - only show when not using mock data */}
      {!useMockData && (
        <div className="connection-status">
          <div
            className={`status-indicator ${isConnected ? 'connected' : 'disconnected'}`}
          >
            <span className="status-dot" />
            {isConnected ? 'Live Updates Active' : 'Connecting...'}
          </div>
        </div>
      )}

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
              <option value="Early Prog Party">Early Prog Party</option>
              <option value="Prog Party">Prog Party</option>
              <option value="Clear Party">Clear Party</option>
              <option value="Cleared">Cleared</option>
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
                <tr
                  key={signup.id}
                  className={`table-row ${recentlyUpdated.has(signup.id) ? 'row-updated' : ''}`}
                >
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
                        signup.partyStatus === 'Clear Party'
                          ? 'badge-clear'
                          : signup.partyStatus === 'Prog Party'
                            ? 'badge-prog'
                            : 'badge-early-prog'
                      }`}
                    >
                      {signup.partyStatus}
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
            {generatePageNumbers(currentPage, totalPages).map((page) => {
              if (page === '...') {
                return (
                  <span
                    key={`ellipsis-${Math.random()}`}
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
