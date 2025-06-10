import type {
  DraftLock,
  Encounter,
  HelperData,
  Participant,
  Role,
  ScheduledEvent,
} from '@ulti-project/shared';
import { useEffect, useMemo, useState } from 'react';
import {
  createDraftLocksEventSource,
  createHelpersEventSource,
  getActiveLocks,
  getAllParticipants,
  getHelpers,
  isHelperAvailableForEvent,
} from '../../lib/schedulingApi.js';

interface ParticipantPoolProps {
  event: ScheduledEvent;
  encounter: Encounter;
  onParticipantSelect: (participant: Participant) => void;
  selectedParticipants: Set<string>;
  pendingParticipant?: Participant | null;
}

interface FilterState {
  search: string;
  role: Role | 'all';
  type: 'all' | 'helper' | 'progger';
  availability: 'all' | 'available' | 'locked';
}

export default function ParticipantPool({
  event,
  encounter,
  onParticipantSelect,
  selectedParticipants,
  pendingParticipant,
}: ParticipantPoolProps) {
  const [helpers, setHelpers] = useState<HelperData[]>([]);
  const [proggers, setProggers] = useState<Participant[]>([]);
  const [draftLocks, setDraftLocks] = useState<DraftLock[]>([]);
  const [helperAvailability, setHelperAvailability] = useState<
    Map<string, { available: boolean; reason?: string }>
  >(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filters, setFilters] = useState<FilterState>({
    search: '',
    role: 'all',
    type: 'all',
    availability: 'all',
  });

  // Load initial data
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const [helpersData, proggersData, locksData] = await Promise.all([
          getHelpers(),
          getAllParticipants({ encounter }),
          getActiveLocks(event.id),
        ]);

        setHelpers(helpersData);
        setProggers(proggersData.filter((p) => p.type === 'progger'));
        setDraftLocks(locksData);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to load participants',
        );
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [event.id, encounter]);

  // Check helper availability for the event time
  useEffect(() => {
    const checkHelperAvailability = async () => {
      if (helpers.length === 0) return;

      const eventEnd = new Date(
        event.scheduledTime.getTime() + event.duration * 60 * 1000,
      );
      const availabilityMap = new Map();

      try {
        // Check availability for all helpers
        const availabilityPromises = helpers.map(async (helper) => {
          const result = await isHelperAvailableForEvent(
            helper.id,
            event.scheduledTime,
            eventEnd,
          );
          return { helperId: helper.id, ...result };
        });

        const results = await Promise.all(availabilityPromises);

        for (const { helperId, available, reason } of results) {
          availabilityMap.set(helperId, { available, reason });
        }

        setHelperAvailability(availabilityMap);
      } catch (err) {
        console.warn('Failed to check helper availability:', err);
      }
    };

    checkHelperAvailability();
  }, [helpers, event.scheduledTime, event.duration]);

  // Set up real-time updates
  useEffect(() => {
    let helpersSource: EventSource | null = null;
    let locksSource: EventSource | null = null;

    try {
      helpersSource = createHelpersEventSource();
      locksSource = createDraftLocksEventSource(event.id);

      helpersSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (Array.isArray(data)) {
            setHelpers(data);
          }
        } catch (err) {
          console.warn('Failed to parse helpers SSE data:', err);
        }
      };

      helpersSource.onerror = (error) => {
        console.warn('Helpers SSE connection error:', error);
      };

      locksSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (Array.isArray(data)) {
            setDraftLocks(data);
          }
        } catch (err) {
          console.warn('Failed to parse locks SSE data:', err);
        }
      };

      locksSource.onerror = (error) => {
        console.warn('Locks SSE connection error:', error);
      };
    } catch (err) {
      console.warn('Failed to create SSE connections:', err);
    }

    return () => {
      try {
        helpersSource?.close();
        locksSource?.close();
      } catch (err) {
        console.warn('Error closing SSE connections:', err);
      }
    };
  }, [event.id]);

  // Convert helpers to participants
  const helperParticipants = useMemo(() => {
    try {
      return helpers.map((helper) => ({
        type: 'helper' as const,
        id: helper.id,
        discordId: helper.discordId,
        name: helper.name,
        characterName: undefined,
        job: helper.availableJobs?.[0]?.job || 'Paladin',
        availability: undefined,
        isConfirmed: false,
        availableJobs: helper.availableJobs || [],
      }));
    } catch (err) {
      console.warn('Error converting helpers to participants:', err);
      return [];
    }
  }, [helpers]);

  // Combine and filter participants
  const filteredParticipants = useMemo(() => {
    try {
      const allParticipants = [...helperParticipants, ...proggers];

      return allParticipants.filter((participant) => {
        try {
          // Search filter
          if (filters.search) {
            const searchLower = filters.search.toLowerCase();
            const matchesName = participant.name
              ?.toLowerCase()
              .includes(searchLower);
            const matchesCharacter = participant.characterName
              ?.toLowerCase()
              .includes(searchLower);
            if (!matchesName && !matchesCharacter) return false;
          }

          // Type filter
          if (filters.type !== 'all' && participant.type !== filters.type) {
            return false;
          }

          // Role filter
          if (filters.role !== 'all') {
            if (participant.type === 'helper') {
              const helper = participant as any;
              const hasRole = helper.availableJobs?.some(
                (job: any) => job.role === filters.role,
              );
              if (!hasRole) return false;
            } else {
              // For proggers, determine role from job
              const role = getJobRole(participant.job);
              if (role !== filters.role) return false;
            }
          }

          // Availability filter
          if (filters.availability !== 'all') {
            const isLocked = draftLocks.some(
              (lock) =>
                lock.participantId === participant.id &&
                lock.participantType === participant.type,
            );
            const isSelected = selectedParticipants.has(
              `${participant.type}-${participant.id}`,
            );

            // For helpers, also check schedule availability
            let isUnavailable = false;
            if (participant.type === 'helper') {
              const availability = helperAvailability.get(participant.id);
              isUnavailable = availability ? !availability.available : false;
            }

            if (
              filters.availability === 'available' &&
              (isLocked || isSelected || isUnavailable)
            ) {
              return false;
            }
            if (
              filters.availability === 'locked' &&
              !isLocked &&
              !isSelected &&
              !isUnavailable
            ) {
              return false;
            }
          }

          return true;
        } catch (err) {
          console.warn('Error filtering participant:', participant, err);
          return false;
        }
      });
    } catch (err) {
      console.warn('Error filtering participants:', err);
      return [];
    }
  }, [
    helperParticipants,
    proggers,
    filters,
    draftLocks,
    selectedParticipants,
    helperAvailability,
  ]);

  const getParticipantStatus = (participant: Participant) => {
    try {
      const key = `${participant.type}-${participant.id}`;

      if (selectedParticipants.has(key)) {
        return {
          type: 'selected',
          label: 'Selected',
          color: 'bg-green-100 text-green-800',
        };
      }

      const lock = draftLocks.find(
        (lock) =>
          lock.participantId === participant.id &&
          lock.participantType === participant.type,
      );

      if (lock) {
        const timeLeft = Math.max(
          0,
          (lock.expiresAt?.getTime() || 0) - Date.now(),
        );
        const minutesLeft = Math.ceil(timeLeft / (1000 * 60));
        return {
          type: 'locked',
          label: `Locked by ${lock.lockedByName || 'Unknown'} (${minutesLeft}m)`,
          color: 'bg-yellow-100 text-yellow-800',
        };
      }

      // Check helper availability for event time
      if (participant.type === 'helper') {
        const availability = helperAvailability.get(participant.id);
        if (availability && !availability.available) {
          const label =
            availability.reason === 'absent'
              ? 'Absent'
              : availability.reason === 'outside_schedule'
                ? 'Unavailable'
                : 'Not Available';

          return {
            type: 'unavailable',
            label,
            color: 'bg-red-100 text-red-800',
          };
        }
      }

      return {
        type: 'available',
        label: 'Available',
        color: 'bg-gray-100 text-gray-600',
      };
    } catch (err) {
      console.warn('Error getting participant status:', participant, err);
      return {
        type: 'available',
        label: 'Available',
        color: 'bg-gray-100 text-gray-600',
      };
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 min-w-0">
        <div className="animate-pulse">
          {/* Header - matches real content structure */}
          <div className="p-4 border-b border-gray-200">
            <div className="h-6 bg-gray-200 rounded mb-4 w-48" />

            {/* Filters - matches real content structure */}
            <div className="space-y-3">
              <div className="h-10 bg-gray-200 rounded w-full" />

              <div className="flex flex-wrap gap-2">
                <div className="h-8 bg-gray-200 rounded w-24" />
                <div className="h-8 bg-gray-200 rounded w-24" />
                <div className="h-8 bg-gray-200 rounded w-28" />
              </div>
            </div>
          </div>

          {/* Participant List - matches real content structure */}
          <div className="max-h-96 overflow-y-auto">
            <div className="space-y-0 divide-y divide-gray-200">
              {Array.from({ length: 5 }, (_, i) => (
                <div
                  key={`skeleton-item-${Date.now()}-${i}`}
                  className="min-h-[5rem] bg-gray-50 flex items-start p-4"
                >
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-200 rounded w-1/3" />
                    <div className="h-3 bg-gray-200 rounded w-1/2" />
                    <div className="flex gap-1">
                      <div className="h-5 bg-gray-200 rounded w-12" />
                      <div className="h-5 bg-gray-200 rounded w-12" />
                      <div className="h-5 bg-gray-200 rounded w-12" />
                    </div>
                    <div className="h-3 bg-gray-200 rounded w-3/4" />
                  </div>
                  <div className="flex-shrink-0 mt-1">
                    <div className="h-6 bg-gray-200 rounded-full w-16" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg border border-red-200 p-6 min-w-0">
        <div className="text-red-600">
          <h3 className="font-medium mb-2">Error Loading Participants</h3>
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 min-w-0">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Available Participants
        </h2>

        {/* Filters */}
        <div className="space-y-3">
          <input
            type="text"
            placeholder="Search participants..."
            value={filters.search}
            onChange={(e) =>
              setFilters((prev) => ({ ...prev, search: e.target.value }))
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          <div className="flex flex-wrap gap-2">
            <select
              value={filters.type}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, type: e.target.value as any }))
              }
              className="px-3 py-1 border border-gray-300 rounded-md text-sm"
            >
              <option value="all">All Types</option>
              <option value="helper">Helpers</option>
              <option value="progger">Proggers</option>
            </select>

            <select
              value={filters.role}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, role: e.target.value as any }))
              }
              className="px-3 py-1 border border-gray-300 rounded-md text-sm"
            >
              <option value="all">All Roles</option>
              <option value="Tank">Tank</option>
              <option value="Healer">Healer</option>
              <option value="DPS">DPS</option>
            </select>

            <select
              value={filters.availability}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  availability: e.target.value as any,
                }))
              }
              className="px-3 py-1 border border-gray-300 rounded-md text-sm"
            >
              <option value="all">All Status</option>
              <option value="available">Available</option>
              <option value="locked">Locked/Selected</option>
            </select>
          </div>
        </div>
      </div>

      {/* Participant List */}
      <div className="max-h-96 overflow-y-auto">
        {filteredParticipants.length === 0 ? (
          <div className="p-6 text-center text-gray-500">
            <p>No participants match your filters</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {filteredParticipants.map((participant) => {
              const status = getParticipantStatus(participant);
              const canSelect = status.type === 'available';
              const isPending =
                pendingParticipant &&
                pendingParticipant.type === participant.type &&
                pendingParticipant.id === participant.id;

              return (
                <button
                  key={`${participant.type}-${participant.id}`}
                  type="button"
                  className={`w-full text-left p-4 transition-colors min-h-[5rem] flex items-start ${
                    isPending
                      ? 'bg-blue-100 border-l-4 border-blue-500'
                      : canSelect
                        ? 'cursor-pointer hover:bg-gray-50'
                        : 'cursor-not-allowed opacity-60'
                  }`}
                  onClick={() => canSelect && onParticipantSelect(participant)}
                  disabled={!canSelect}
                >
                  <div className="flex items-start justify-between w-full min-w-0 gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <h3 className="font-medium text-gray-900 truncate text-sm">
                          {participant.name}
                        </h3>
                      </div>

                      {participant.characterName && (
                        <p className="text-xs text-gray-600 truncate mb-1">
                          {participant.characterName}
                        </p>
                      )}

                      {/* Job display - different for helpers vs proggers */}
                      {participant.type === 'helper' &&
                      (participant as any).availableJobs ? (
                        <div className="mb-1">
                          <div className="flex flex-wrap gap-1">
                            {(participant as any).availableJobs
                              .slice(0, 3)
                              .map((helperJob: any, index: number) => (
                                <span
                                  key={`${helperJob.job}-${index}`}
                                  className="inline-block px-1.5 py-0.5 text-xs bg-blue-100 text-blue-800 rounded whitespace-nowrap"
                                >
                                  {helperJob.job}
                                </span>
                              ))}
                            {(participant as any).availableJobs.length > 3 && (
                              <span className="inline-block px-1.5 py-0.5 text-xs bg-gray-100 text-gray-600 rounded whitespace-nowrap">
                                +{(participant as any).availableJobs.length - 3}
                              </span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="mb-1">
                          <span className="inline-block px-1.5 py-0.5 text-xs bg-gray-100 text-gray-800 rounded">
                            {participant.job}
                          </span>
                          {participant.type === 'progger' && (
                            <div className="text-xs text-gray-500 mt-1 truncate">
                              {participant.encounter} • {participant.progPoint}
                            </div>
                          )}
                        </div>
                      )}

                      {participant.availability && (
                        <p className="text-xs text-gray-600 leading-relaxed line-clamp-2">
                          {participant.availability}
                        </p>
                      )}
                    </div>

                    <div className="flex-shrink-0 mt-1">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ${status.color}`}
                      >
                        {status.label}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// Helper function to determine role from job
function getJobRole(job: string): Role {
  const tankJobs = ['Paladin', 'Warrior', 'Dark Knight', 'Gunbreaker'];
  const healerJobs = ['White Mage', 'Scholar', 'Astrologian', 'Sage'];

  if (tankJobs.includes(job)) return 'Tank';
  if (healerJobs.includes(job)) return 'Healer';
  return 'DPS';
}
