import { EventStatus } from '@ulti-project/shared';
import type { ScheduledEvent } from '@ulti-project/shared';
import { useCallback, useEffect, useState } from 'react';
import { useUpdateEventMutation, useDeleteEventMutation } from '../../hooks/queries/useEventsQuery.js';
import { getEventStatusColorDashboard } from '../../lib/utils/statusUtils.js';
import { getLoadingSpinnerClasses } from '../../lib/utils/uiUtils.js';

interface EventHeaderProps {
  event: ScheduledEvent;
  teamLeaderId: string;
  onEventUpdate: (event: ScheduledEvent) => void;
  onEventDeleted: () => void;
}

export default function EventHeader({
  event,
  teamLeaderId,
  onEventUpdate,
  onEventDeleted,
}: EventHeaderProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [lastEventVersion, setLastEventVersion] = useState(event.version);

  // React Query mutations
  const updateEventMutation = useUpdateEventMutation();
  const deleteEventMutation = useDeleteEventMutation();

  // Track when the event is updated to detect unsaved changes
  useEffect(() => {
    if (event.version !== lastEventVersion) {
      setHasUnsavedChanges(true);
      setLastEventVersion(event.version);
    }
  }, [event.version, lastEventVersion]);

  const handleSaveAsDraft = useCallback(
    async (silent = false) => {
      if (!silent) {
        setLoading('save');
        setError(null);
      }

      updateEventMutation.mutate(
        {
          eventId: event.id,
          updates: {
            // Update lastModified timestamp to mark as saved
            // The roster state is already persisted through assign/unassign operations
          },
        },
        {
          onSuccess: (updatedEvent) => {
            // Update the parent component with the fresh event data
            onEventUpdate(updatedEvent);

            if (!silent) {
              console.log('Draft saved successfully');
            }

            setHasUnsavedChanges(false);
            setLastSaved(new Date());
            if (!silent) {
              setLoading(null);
            }
          },
          onError: (err) => {
            if (!silent) {
              setError(err instanceof Error ? err.message : 'Failed to save draft');
              setLoading(null);
            }
          },
        },
      );
    },
    [event.id, onEventUpdate, updateEventMutation],
  );

  // Auto-save functionality (every 30 seconds if there are changes)
  useEffect(() => {
    if (!hasUnsavedChanges || event.status !== 'draft') return;

    const autoSaveInterval = setInterval(() => {
      handleSaveAsDraft(true); // Silent save
    }, 30000); // 30 seconds

    return () => clearInterval(autoSaveInterval);
  }, [hasUnsavedChanges, event.status, handleSaveAsDraft]);

  const handlePublishEvent = async () => {
    // Enhanced validation - require all 8 slots to be filled
    if (event.roster.filledSlots < 8) {
      setError(
        `Cannot publish: All 8 slots must be filled (currently ${event.roster.filledSlots}/8)`,
      );
      return;
    }

    // Check if all required roles are filled (2 tanks, 2 healers, 4 DPS)
    const roleCheck = validateRosterRoles();
    if (!roleCheck.isValid) {
      setError(`Cannot publish: ${roleCheck.message}`);
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to publish this event?

This will:
• Make the event visible to all participants
• Send notifications to assigned participants
• Lock the roster from major changes

Roster: ${event.roster.filledSlots}/${event.roster.totalSlots} slots filled`,
    );

    if (!confirmed) return;

    setLoading('publish');
    setError(null);

    updateEventMutation.mutate(
      {
        eventId: event.id,
        updates: {
          status: EventStatus.Published,
        },
      },
      {
        onSuccess: (updatedEvent) => {
          onEventUpdate(updatedEvent);
          setHasUnsavedChanges(false);
          setLastSaved(new Date());
          setLoading(null);
        },
        onError: (err) => {
          setError(err instanceof Error ? err.message : 'Failed to publish event');
          setLoading(null);
        },
      },
    );
  };

  const handleCancelEvent = async () => {
    const confirmed = window.confirm(
      `Are you sure you want to cancel "${event.name}"?

This will:
• Delete the event permanently
• Release all participant locks
• Notify assigned participants

This action cannot be undone.`,
    );

    if (!confirmed) return;

    setLoading('cancel');
    setError(null);

    deleteEventMutation.mutate(
      {
        eventId: event.id,
        teamLeaderId,
      },
      {
        onSuccess: () => {
          onEventDeleted();
          setLoading(null);
        },
        onError: (err) => {
          setError(err instanceof Error ? err.message : 'Failed to cancel event');
          setLoading(null);
        },
      },
    );
  };

  const validateRosterRoles = () => {
    const roleCounts = { Tank: 0, Healer: 0, DPS: 0 };

    for (const slot of event.roster.party) {
      if (slot.assignedParticipant) {
        roleCounts[slot.role]++;
      }
    }

    // Validate exact role requirements for Ultimate raids
    if (roleCounts.Tank !== 2) {
      return {
        isValid: false,
        message: `Exactly 2 Tanks required (${roleCounts.Tank}/2)`,
      };
    }
    if (roleCounts.Healer !== 2) {
      return {
        isValid: false,
        message: `Exactly 2 Healers required (${roleCounts.Healer}/2)`,
      };
    }
    if (roleCounts.DPS !== 4) {
      return {
        isValid: false,
        message: `Exactly 4 DPS required (${roleCounts.DPS}/4)`,
      };
    }

    return { isValid: true, message: '' };
  };

  const canPublish = event.status === 'draft' && event.roster.filledSlots === 8;
  const canSave = event.status === 'draft';
  const canCancel = ['draft', 'published'].includes(event.status);

  return (
    <div
      style={{
        backgroundColor: 'var(--bg-primary)',
        borderColor: 'var(--border-primary)',
      }}
      className="rounded-lg border p-4 mb-6"
    >
      {/* Error Display */}
      {error && (
        <div
          style={{
            backgroundColor: 'var(--warning-bg)',
            borderColor: 'var(--warning-border)',
          }}
          className="mb-4 p-3 border rounded-lg"
        >
          <div style={{ color: 'var(--warning-text)' }} className="text-sm">
            <strong>Error:</strong> {error}
            <button
              type="button"
              style={{ color: 'var(--warning-text)' }}
              className="ml-2 opacity-60 hover:opacity-100"
              onClick={() => setError(null)}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Status Bar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span
            className={`px-3 py-1 rounded-full text-sm font-medium border ${getEventStatusColorDashboard(event.status)}`}
          >
            {event.status.charAt(0).toUpperCase() + event.status.slice(1)}
          </span>

          {hasUnsavedChanges && event.status === 'draft' && (
            <span className="text-sm text-amber-600 flex items-center gap-1">
              <div className="w-2 h-2 bg-amber-500 rounded-full" />
              Unsaved changes
            </span>
          )}

          {lastSaved && !hasUnsavedChanges && (
            <span className="text-sm text-green-600 flex items-center gap-1">
              <div className="w-2 h-2 bg-green-500 rounded-full" />
              Saved {lastSaved.toLocaleTimeString()}
            </span>
          )}
        </div>

        <div style={{ color: 'var(--text-secondary)' }} className="text-sm">
          <strong>
            {event.roster.filledSlots}/{event.roster.totalSlots}
          </strong>{' '}
          slots filled
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-3">
        {canPublish && (
          <button
            type="button"
            className={`
              px-6 py-3 rounded-lg font-medium transition-colors flex items-center gap-2
              ${
                loading === 'publish'
                  ? 'bg-blue-400 cursor-wait'
                  : 'bg-blue-600 hover:bg-blue-700'
              } text-white
            `}
            onClick={handlePublishEvent}
            disabled={loading !== null}
          >
            {loading === 'publish' ? (
              <>
                <div
                  className={getLoadingSpinnerClasses({
                    size: 'small',
                    color: 'white',
                  })}
                />
                Publishing...
              </>
            ) : (
              <>
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                  />
                </svg>
                Publish Event
              </>
            )}
          </button>
        )}

        {canSave && (
          <button
            type="button"
            style={{
              backgroundColor:
                loading === 'save'
                  ? 'var(--bg-tertiary)'
                  : hasUnsavedChanges
                    ? 'var(--warning-bg)'
                    : 'var(--bg-secondary)',
              color:
                loading === 'save'
                  ? 'var(--text-secondary)'
                  : hasUnsavedChanges
                    ? 'var(--warning-text)'
                    : 'var(--text-primary)',
              borderColor: hasUnsavedChanges
                ? 'var(--warning-border)'
                : 'transparent',
              cursor: loading === 'save' ? 'wait' : 'pointer',
            }}
            className="px-6 py-3 rounded-lg font-medium transition-opacity flex items-center gap-2 border hover:opacity-80"
            onClick={() => handleSaveAsDraft(false)}
            disabled={loading !== null}
          >
            {loading === 'save' ? (
              <>
                <div
                  className={getLoadingSpinnerClasses({
                    size: 'small',
                    color: 'gray',
                  })}
                />
                Saving...
              </>
            ) : (
              <>
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3-3m0 0l-3 3m3-3v12"
                  />
                </svg>
                {hasUnsavedChanges ? 'Save Changes' : 'Save as Draft'}
              </>
            )}
          </button>
        )}

        {canCancel && (
          <button
            type="button"
            className={`
              px-6 py-3 rounded-lg font-medium transition-colors flex items-center gap-2
              ${
                loading === 'cancel'
                  ? 'bg-red-300 cursor-wait'
                  : 'bg-red-100 hover:bg-red-200'
              } text-red-700
            `}
            onClick={handleCancelEvent}
            disabled={loading !== null}
          >
            {loading === 'cancel' ? (
              <>
                <div
                  className={getLoadingSpinnerClasses({
                    size: 'small',
                    color: 'gray',
                  })}
                />
                Canceling...
              </>
            ) : (
              <>
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
                Cancel Event
              </>
            )}
          </button>
        )}
      </div>

      {/* Additional Info */}
      <div
        style={{ borderColor: 'var(--border-primary)' }}
        className="mt-4 pt-4 border-t"
      >
        <div
          style={{ color: 'var(--text-secondary)' }}
          className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm"
        >
          <div>
            <strong>Created:</strong>{' '}
            {new Date(event.createdAt).toLocaleString()}
          </div>
          <div>
            <strong>Last Modified:</strong>{' '}
            {new Date(event.lastModified).toLocaleString()}
          </div>
          <div>
            <strong>Team Leader:</strong> {event.teamLeaderName}
          </div>
        </div>
      </div>
    </div>
  );
}
