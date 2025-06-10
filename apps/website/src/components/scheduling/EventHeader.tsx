import { EventStatus } from '@ulti-project/shared';
import type { ScheduledEvent } from '@ulti-project/shared';
import { useCallback, useEffect, useState } from 'react';
import { deleteEvent, updateEvent } from '../../lib/schedulingApi.js';

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

  // Track when the event is updated to detect unsaved changes
  useEffect(() => {
    if (event.version !== lastEventVersion) {
      setHasUnsavedChanges(true);
      setLastEventVersion(event.version);
    }
  }, [event.version, lastEventVersion]);

  const handleSaveAsDraft = useCallback(
    async (silent = false) => {
      try {
        if (!silent) {
          setLoading('save');
          setError(null);
        }

        // Actually save the draft by updating the lastModified timestamp
        // This ensures the event is marked as saved in the backend
        const updatedEvent = await updateEvent(event.id, {
          // Update lastModified timestamp to mark as saved
          // The roster state is already persisted through assign/unassign operations
        });

        // Update the parent component with the fresh event data
        onEventUpdate(updatedEvent);

        if (!silent) {
          console.log('Draft saved successfully');
        }

        setHasUnsavedChanges(false);
        setLastSaved(new Date());
      } catch (err) {
        if (!silent) {
          setError(err instanceof Error ? err.message : 'Failed to save draft');
        }
      } finally {
        if (!silent) {
          setLoading(null);
        }
      }
    },
    [event.id, onEventUpdate],
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
    // Enhanced validation
    if (event.roster.filledSlots === 0) {
      setError('Cannot publish an event with no participants assigned');
      return;
    }

    // Check if all required roles are filled (at least 1 tank, 1 healer)
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

    try {
      setLoading('publish');
      setError(null);

      const updatedEvent = await updateEvent(event.id, {
        status: EventStatus.Published,
      });
      onEventUpdate(updatedEvent);
      setHasUnsavedChanges(false);
      setLastSaved(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to publish event');
    } finally {
      setLoading(null);
    }
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

    try {
      setLoading('cancel');
      setError(null);

      await deleteEvent(event.id, teamLeaderId);
      onEventDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel event');
    } finally {
      setLoading(null);
    }
  };

  const validateRosterRoles = () => {
    const roleCounts = { Tank: 0, Healer: 0, DPS: 0 };

    for (const slot of event.roster.party) {
      if (slot.assignedParticipant) {
        roleCounts[slot.role]++;
      }
    }

    if (roleCounts.Tank === 0) {
      return { isValid: false, message: 'At least 1 Tank is required' };
    }
    if (roleCounts.Healer === 0) {
      return { isValid: false, message: 'At least 1 Healer is required' };
    }

    return { isValid: true, message: '' };
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'published':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'in-progress':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'completed':
        return 'bg-gray-100 text-gray-800 border-gray-200';
      case 'cancelled':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const canPublish = event.status === 'draft' && event.roster.filledSlots > 0;
  const canSave = event.status === 'draft';
  const canCancel = ['draft', 'published'].includes(event.status);

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
      {/* Error Display */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <div className="text-red-600 text-sm">
            <strong>Error:</strong> {error}
            <button
              type="button"
              className="ml-2 text-red-400 hover:text-red-600"
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
            className={`px-3 py-1 rounded-full text-sm font-medium border ${getStatusColor(event.status)}`}
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

        <div className="text-sm text-gray-600">
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
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
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
            className={`
              px-6 py-3 rounded-lg font-medium transition-colors flex items-center gap-2
              ${
                loading === 'save'
                  ? 'bg-gray-300 cursor-wait'
                  : hasUnsavedChanges
                    ? 'bg-amber-100 hover:bg-amber-200 text-amber-700 border border-amber-300'
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
              }
            `}
            onClick={() => handleSaveAsDraft(false)}
            disabled={loading !== null}
          >
            {loading === 'save' ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600" />
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
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-600" />
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
      <div className="mt-4 pt-4 border-t border-gray-200">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-600">
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
