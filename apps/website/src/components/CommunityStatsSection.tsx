import { useQuery } from '@tanstack/react-query';
import { getCommunityStats } from '../lib/api.js';

export function CommunityStatsSection() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['communityStats'],
    queryFn: getCommunityStats,
    staleTime: 5 * 60 * 1000, // Consider data stale after 5 minutes
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
    retry: 2,
    refetchOnWindowFocus: false,
  });

  if (isLoading) {
    return (
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-number stat-blue">
            <div className="loading-spinner-small" />
          </div>
          <div className="stat-label">Total Signups</div>
        </div>
        <div className="stat-card">
          <div className="stat-number stat-purple">
            <div className="loading-spinner-small" />
          </div>
          <div className="stat-label">Active Encounters</div>
        </div>
        <div className="stat-card">
          <div className="stat-number stat-green">
            <div className="loading-spinner-small" />
          </div>
          <div className="stat-label">Active Squads</div>
        </div>
      </div>
    );
  }

  // Default values if error or no data
  const totalSignups = stats?.totalSignups || 0;
  const activeEncounters = stats?.activeEncounters || 0;
  const activeSquads =
    stats?.squads?.filter((s) => s.status === 'active').length || 0;

  return (
    <div className="stats-grid">
      <div className="stat-card">
        <div className="stat-number stat-blue">{totalSignups}</div>
        <div className="stat-label">Total Signups</div>
      </div>
      <div className="stat-card">
        <div className="stat-number stat-purple">{activeEncounters}</div>
        <div className="stat-label">Active Encounters</div>
      </div>
      <div className="stat-card">
        <div className="stat-number stat-green">{activeSquads}</div>
        <div className="stat-label">Active Squads</div>
      </div>
    </div>
  );
}
