import { ParticipantType, Role } from '@ulti-project/shared';
import type {
  DraftLock,
  Encounter,
  HelperData,
  Participant,
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
import { getJobIconProps } from '../../lib/utils/iconUtils.js';
import { getJobRole } from '../../lib/utils/jobUtils.js';
import { getParticipantStatusColor } from '../../lib/utils/statusUtils.js';
import OptimizedIcon from '../OptimizedIcon.js';

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
        new Date(event.scheduledTime).getTime() + event.duration * 60 * 1000,
      );
      const availabilityMap = new Map();

      try {
        // Check availability for all helpers
        const availabilityPromises = helpers.map(async (helper) => {
          const result = await isHelperAvailableForEvent(
            helper.id,
            new Date(event.scheduledTime),
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
      return helpers.map(
        (helper) =>
          ({
            type: ParticipantType.Helper,
            id: helper.id,
            discordId: helper.discordId,
            name: helper.name,
            job: helper.availableJobs?.[0]?.job || 'Paladin',
            encounter: undefined,
            progPoint: undefined,
            availability: undefined,
            isConfirmed: false,
            // Store availableJobs as a custom property for helpers
            availableJobs: helper.availableJobs || [],
          }) as Participant & { availableJobs: any[] },
      );
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
            if (!matchesName) return false;
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
          color: getParticipantStatusColor('selected'),
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
          (lock.expiresAt ? new Date(lock.expiresAt).getTime() : 0) -
            Date.now(),
        );
        const minutesLeft = Math.ceil(timeLeft / (1000 * 60));
        return {
          type: 'locked',
          label: `Locked by ${lock.lockedByName || 'Unknown'} (${minutesLeft}m)`,
          color: getParticipantStatusColor('locked'),
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
            color: getParticipantStatusColor('unavailable'),
          };
        }
      }

      return {
        type: 'available',
        label: 'Available',
        color: getParticipantStatusColor('available'),
      };
    } catch (err) {
      console.warn('Error getting participant status:', participant, err);
      return {
        type: 'available',
        label: 'Available',
        color: getParticipantStatusColor('available'),
      };
    }
  };

  if (loading) {
    return (
      <div
        style={{
          backgroundColor: 'var(--bg-primary)',
          borderColor: 'var(--border-primary)',
        }}
        className="rounded-lg border min-w-0"
      >
        <div className="animate-pulse">
          {/* Header - matches real content structure */}
          <div
            style={{ borderColor: 'var(--border-primary)' }}
            className="p-4 border-b"
          >
            <div
              style={{ backgroundColor: 'var(--bg-tertiary)' }}
              className="h-6 rounded mb-4 w-48"
            />

            {/* Filters - matches real content structure */}
            <div className="space-y-3">
              <div
                style={{ backgroundColor: 'var(--bg-tertiary)' }}
                className="h-10 rounded w-full"
              />

              <div className="flex flex-wrap gap-2">
                <div
                  style={{ backgroundColor: 'var(--bg-tertiary)' }}
                  className="h-8 rounded w-24"
                />
                <div
                  style={{ backgroundColor: 'var(--bg-tertiary)' }}
                  className="h-8 rounded w-24"
                />
                <div
                  style={{ backgroundColor: 'var(--bg-tertiary)' }}
                  className="h-8 rounded w-28"
                />
              </div>
            </div>
          </div>

          {/* Participant List - matches real content structure */}
          <div className="max-h-96 overflow-y-auto">
            <div
              style={{ borderColor: 'var(--border-primary)' }}
              className="space-y-0 divide-y"
            >
              {Array.from({ length: 5 }, (_, i) => (
                <div
                  key={`skeleton-item-${Date.now()}-${i}`}
                  style={{ backgroundColor: 'var(--bg-secondary)' }}
                  className="min-h-[5rem] flex items-start p-4"
                >
                  <div className="flex-1 space-y-2">
                    <div
                      style={{ backgroundColor: 'var(--bg-tertiary)' }}
                      className="h-4 rounded w-1/3"
                    />
                    <div
                      style={{ backgroundColor: 'var(--bg-tertiary)' }}
                      className="h-3 rounded w-1/2"
                    />
                    <div className="flex gap-1">
                      <div
                        style={{ backgroundColor: 'var(--bg-tertiary)' }}
                        className="h-5 rounded w-12"
                      />
                      <div
                        style={{ backgroundColor: 'var(--bg-tertiary)' }}
                        className="h-5 rounded w-12"
                      />
                      <div
                        style={{ backgroundColor: 'var(--bg-tertiary)' }}
                        className="h-5 rounded w-12"
                      />
                    </div>
                    <div
                      style={{ backgroundColor: 'var(--bg-tertiary)' }}
                      className="h-3 rounded w-3/4"
                    />
                  </div>
                  <div className="flex-shrink-0 mt-1">
                    <div
                      style={{ backgroundColor: 'var(--bg-tertiary)' }}
                      className="h-6 rounded-full w-16"
                    />
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
      <div
        style={{
          backgroundColor: 'var(--bg-primary)',
          borderColor: 'var(--warning-border)',
        }}
        className="rounded-lg border p-6 min-w-0"
      >
        <div style={{ color: 'var(--warning-text)' }}>
          <h3 className="font-medium mb-2">Error Loading Participants</h3>
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        backgroundColor: 'var(--bg-primary)',
        borderColor: 'var(--border-primary)',
      }}
      className="rounded-lg border min-w-0"
    >
      {/* Header */}
      <div
        style={{ borderColor: 'var(--border-primary)' }}
        className="p-4 border-b"
      >
        <h2
          style={{ color: 'var(--text-primary)' }}
          className="text-lg font-semibold mb-4"
        >
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
            style={{
              backgroundColor: 'var(--bg-primary)',
              borderColor: 'var(--border-primary)',
              color: 'var(--text-primary)',
            }}
            className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-400"
          />

          <div className="flex flex-wrap gap-2">
            <select
              value={filters.type}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, type: e.target.value as any }))
              }
              style={{
                backgroundColor: 'var(--bg-primary)',
                borderColor: 'var(--border-primary)',
                color: 'var(--text-primary)',
              }}
              className="px-3 py-1 border rounded-md text-sm"
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
              style={{
                backgroundColor: 'var(--bg-primary)',
                borderColor: 'var(--border-primary)',
                color: 'var(--text-primary)',
              }}
              className="px-3 py-1 border rounded-md text-sm"
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
              style={{
                backgroundColor: 'var(--bg-primary)',
                borderColor: 'var(--border-primary)',
                color: 'var(--text-primary)',
              }}
              className="px-3 py-1 border rounded-md text-sm"
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
          <div
            className="p-6 text-center"
            style={{ color: 'var(--text-secondary)' }}
          >
            <p>No participants match your filters</p>
          </div>
        ) : (
          <div
            style={{ borderColor: 'var(--border-primary)' }}
            className="divide-y"
          >
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
                        ? 'cursor-pointer hover:bg-opacity-50'
                        : 'cursor-not-allowed opacity-60'
                  }`}
                  style={{
                    backgroundColor: isPending
                      ? 'rgba(59, 130, 246, 0.1)'
                      : canSelect
                        ? 'transparent'
                        : 'var(--bg-primary)',
                    borderLeftColor: isPending ? '#3b82f6' : 'transparent',
                    borderLeftWidth: isPending ? '4px' : '0',
                  }}
                  onMouseEnter={(e) => {
                    if (canSelect && !isPending) {
                      e.currentTarget.style.backgroundColor =
                        'var(--bg-secondary)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (canSelect && !isPending) {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }
                  }}
                  onClick={() => canSelect && onParticipantSelect(participant)}
                  disabled={!canSelect}
                >
                  <div className="flex items-start justify-between w-full min-w-0 gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <h3
                          style={{ color: 'var(--text-primary)' }}
                          className="font-medium truncate text-sm"
                        >
                          {participant.name}
                        </h3>
                      </div>

                      {/* Job display - different for helpers vs proggers */}
                      {participant.type === 'helper' &&
                      (participant as any).availableJobs ? (
                        <div className="mb-1">
                          <div className="flex flex-wrap gap-1">
                            {(participant as any).availableJobs
                              .slice(0, 3)
                              .map((helperJob: any, index: number) => (
                                <div
                                  key={`${helperJob.job}-${index}`}
                                  className="flex items-center gap-1 px-1.5 py-0.5 text-xs rounded whitespace-nowrap"
                                  style={{
                                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                                    color: 'var(--text-accent)',
                                  }}
                                >
                                  <OptimizedIcon
                                    {...getJobIconProps(helperJob.job)}
                                    className="w-3 h-3"
                                  />
                                  <span>{helperJob.job}</span>
                                </div>
                              ))}
                            {(participant as any).availableJobs.length > 3 && (
                              <span
                                className="inline-block px-1.5 py-0.5 text-xs rounded whitespace-nowrap"
                                style={{
                                  backgroundColor: 'var(--bg-secondary)',
                                  color: 'var(--text-secondary)',
                                }}
                              >
                                +{(participant as any).availableJobs.length - 3}
                              </span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="mb-1">
                          <div className="flex items-center gap-1">
                            <OptimizedIcon
                              {...getJobIconProps(participant.job)}
                              className="w-4 h-4"
                            />
                            <span
                              className="inline-block px-1.5 py-0.5 text-xs rounded"
                              style={{
                                backgroundColor: 'var(--bg-secondary)',
                                color: 'var(--text-primary)',
                              }}
                            >
                              {participant.job}
                            </span>
                          </div>
                          {participant.type === ParticipantType.Progger &&
                            participant.encounter &&
                            participant.progPoint && (
                              <div
                                style={{ color: 'var(--text-tertiary)' }}
                                className="text-xs mt-1 truncate"
                              >
                                {participant.encounter} •{' '}
                                {participant.progPoint}
                              </div>
                            )}
                        </div>
                      )}

                      {participant.availability && (
                        <p
                          style={{ color: 'var(--text-secondary)' }}
                          className="text-xs leading-relaxed line-clamp-2"
                        >
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
