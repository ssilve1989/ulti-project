import { ParticipantType, Role } from '@ulti-project/shared';
import type {
  DraftLock,
  Encounter,
  HelperData,
  Participant,
  ScheduledEvent,
} from '@ulti-project/shared';
import { useEffect, useMemo, useState } from 'react';
import { useHelpersQuery, useParticipantsQuery, useActiveLocksQuery } from '../../hooks/queries/useHelpersQuery.js';
import { api } from '../../lib/api/client.js';
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
  // React Query hooks for data fetching
  const { data: helpers = [], isLoading: helpersLoading, error: helpersError } = useHelpersQuery();
  const { data: allParticipants = [], isLoading: participantsLoading, error: participantsError } = useParticipantsQuery({ encounter });
  const { data: draftLocks = [], isLoading: locksLoading, error: locksError } = useActiveLocksQuery(event.id);

  // Filter proggers from all participants
  const proggers = useMemo(() => allParticipants.filter(p => p.type === 'progger'), [allParticipants]);

  // Combine loading states
  const loading = helpersLoading || participantsLoading || locksLoading;
  
  // Combine error states
  const error = helpersError?.message || participantsError?.message || locksError?.message || null;

  const [helperAvailability, setHelperAvailability] = useState<
    Map<string, { available: boolean; reason?: string }>
  >(new Map());

  const [filters, setFilters] = useState<FilterState>({
    search: '',
    role: 'all',
    type: 'all',
    availability: 'all',
  });

  // Data is now loaded automatically by React Query hooks

  // Check helper availability for the event time
  useEffect(() => {
    const checkHelperAvailability = async () => {
      if (helpers.length === 0) return;

      const scheduledTimeDate = new Date(event.scheduledTime);
      const eventEnd = new Date(
        scheduledTimeDate.getTime() + event.duration * 60 * 1000,
      );
      const availabilityMap = new Map();

      try {
        // Check availability for all helpers
        const availabilityPromises = helpers.map(async (helper) => {
          const result = await api.helpers.checkHelperAvailability(
            helper.id,
            scheduledTimeDate,
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

  // Real-time updates are now handled by React Query's background refetching
  // TODO: Implement real-time updates through WebSocket or SSE via the API client

  // Convert helpers to participants, memoized to prevent re-renders
  const helperParticipants = useMemo(
    () =>
      helpers.map(
        (helper) =>
          ({
            type: ParticipantType.Helper,
            id: helper.id,
            discordId: helper.discordId,
            name: helper.name,
            job: helper.availableJobs?.[0]?.job || 'Paladin', // Default job
            encounter: undefined,
            progPoint: undefined,
            availability: undefined,
            isConfirmed: false,
            // Store availableJobs as a custom property for helpers
            availableJobs: helper.availableJobs || [],
          }) as Participant & { availableJobs: any[] },
      ),
    [helpers],
  );

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
        const expiresAtDate = new Date(lock.expiresAt);
        const timeLeft = Math.max(
          0,
          (expiresAtDate.getTime() || 0) - Date.now(),
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
            <ul style={{ color: 'var(--text-primary)' }} className="divide-y">
              {filteredParticipants.map((participant) => {
                const status = getParticipantStatus(participant);
                const key = `${participant.type}-${participant.id}`;
                const canSelect = status.type === 'available';
                const isPending =
                  pendingParticipant?.id === participant.id &&
                  pendingParticipant?.type === participant.type;

                return (
                  <li key={key}>
                    <button
                      type="button"
                      disabled={!canSelect}
                      onClick={() =>
                        canSelect && onParticipantSelect(participant)
                      }
                      className={`w-full text-left p-4 transition-colors min-h-[5rem] flex items-start ${
                        isPending
                          ? 'bg-blue-100 dark:bg-blue-900/30'
                          : canSelect
                            ? 'hover:bg-gray-100 dark:hover:bg-gray-800'
                            : 'opacity-50 cursor-not-allowed'
                      }`}
                    >
                      <div className="flex-shrink-0 mr-4 pt-1">
                        <OptimizedIcon
                          {...getJobIconProps(
                            (participant as any).job ||
                              (participant as any).availableJobs?.[0]?.job,
                          )}
                          className="w-8 h-8"
                        />
                      </div>
                      <div className="flex-grow">
                        <div className="flex items-center justify-between">
                          <h4 className="font-medium">{participant.name}</h4>
                          <span
                            className={`text-xs px-2 py-1 rounded-full ${getParticipantStatusColor(status.type)}`}
                          >
                            {status.label}
                          </span>
                        </div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {participant.type === 'helper'
                            ? (participant as any).availableJobs
                                .map((j: any) => j.job)
                                .join(', ')
                            : `${participant.job} - ${participant.progPoint}`}
                        </p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
