import { EventStatus } from '@ulti-project/shared';
import type { ScheduledEvent } from '@ulti-project/shared';
import { useEffect, useState } from 'react';
import {
  useDeleteEventMutation,
  useUpdateEventMutation,
} from '../../hooks/queries/useEventsQuery.js';
import { getEventStatusInfo } from '../../lib/utils/statusUtils.js';
import { getLoadingSpinnerClasses } from '../../lib/utils/uiUtils.js';

interface EventManagementProps {
  event: ScheduledEvent;
  teamLeaderId: string;
  onEventUpdate: (event: ScheduledEvent) => void;
  onEventDeleted: () => void;
}

interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  duration?: number;
}

export default function EventManagement({
  event,
  teamLeaderId,
  onEventUpdate,
  onEventDeleted,
}: EventManagementProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Notification type styling lookup
  const notificationStyles = {
    success: 'border-green-500',
    error: 'border-red-500',
    warning: 'border-yellow-500',
    info: 'border-blue-500',
  } as const;

  // React Query mutations
  const updateEventMutation = useUpdateEventMutation();
  const deleteEventMutation = useDeleteEventMutation();

  // Auto-save functionality
  useEffect(() => {
    if (!hasUnsavedChanges || event.status !== EventStatus.Draft) return;

    const autoSaveInterval = setInterval(() => {
      handleAutoSave();
    }, 30000); // 30 seconds

    return () => clearInterval(autoSaveInterval);
  }, [hasUnsavedChanges, event.status]);

  const addNotification = (notification: Omit<Notification, 'id'>) => {
    const id = Date.now().toString();
    const newNotification = { ...notification, id };
    setNotifications((prev) => [...prev, newNotification]);

    // Auto-remove after duration
    const duration = notification.duration || 5000;
    setTimeout(() => {
      removeNotification(id);
    }, duration);
  };

  const removeNotification = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const handleAutoSave = async () => {
    try {
      // In a real implementation, this would save the current roster state
      await new Promise((resolve) => setTimeout(resolve, 100));
      setHasUnsavedChanges(false);
      setLastSaved(new Date());
    } catch (error) {
      console.error('Auto-save failed:', error);
    }
  };

  const handlePublishEvent = async () => {
    // Validation - require all 8 slots to be filled
    if (event.roster.filledSlots < 8) {
      addNotification({
        type: 'error',
        title: 'Cannot Publish Event',
        message: `All 8 slots must be filled before publishing. Currently ${event.roster.filledSlots}/8 slots are filled.`,
      });
      return;
    }

    const roleCheck = validateRosterRoles();
    if (!roleCheck.isValid) {
      addNotification({
        type: 'error',
        title: 'Invalid Roster Composition',
        message: roleCheck.message,
      });
      return;
    }

    // Confirmation dialog
    const confirmed = window.confirm(
      `Publish "${event.name}"?

This will:
• Make the event visible to all participants
• Send notifications to assigned participants  
• Lock the roster from major changes

Current roster: ${event.roster.filledSlots}/${event.roster.totalSlots} slots filled`,
    );

    if (!confirmed) return;

    setLoading('publish');

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

          addNotification({
            type: 'success',
            title: 'Event Published',
            message: `"${event.name}" has been published successfully. Participants will be notified.`,
            duration: 7000,
          });
          setLoading(null);
        },
        onError: (error) => {
          addNotification({
            type: 'error',
            title: 'Publish Failed',
            message:
              error instanceof Error
                ? error.message
                : 'Failed to publish event',
          });
          setLoading(null);
        },
      },
    );
  };

  const handleSaveAsDraft = async () => {
    setLoading('save');

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

          setHasUnsavedChanges(false);
          setLastSaved(new Date());

          addNotification({
            type: 'success',
            title: 'Draft Saved',
            message: 'Your changes have been saved successfully.',
            duration: 3000,
          });
          setLoading(null);
        },
        onError: (error) => {
          addNotification({
            type: 'error',
            title: 'Save Failed',
            message:
              error instanceof Error ? error.message : 'Failed to save draft',
          });
          setLoading(null);
        },
      },
    );
  };

  const handleCancelEvent = async () => {
    const confirmed = window.confirm(
      `Cancel "${event.name}"?

This will:
• Delete the event permanently
• Release all participant locks
• Notify assigned participants

This action cannot be undone.`,
    );

    if (!confirmed) return;

    setLoading('cancel');

    deleteEventMutation.mutate(
      {
        eventId: event.id,
        teamLeaderId,
      },
      {
        onSuccess: () => {
          addNotification({
            type: 'info',
            title: 'Event Cancelled',
            message: `"${event.name}" has been cancelled and all participants have been notified.`,
            duration: 5000,
          });

          // Delay navigation to show notification
          setTimeout(() => {
            onEventDeleted();
          }, 1000);
        },
        onError: (error) => {
          addNotification({
            type: 'error',
            title: 'Cancellation Failed',
            message:
              error instanceof Error ? error.message : 'Failed to cancel event',
          });
          setLoading(null);
        },
      },
    );
  };

  const handleUnpublishEvent = async () => {
    const confirmed = window.confirm(
      `Unpublish "${event.name}"?

This will:
• Change the event back to draft status
• Allow major roster modifications
• Notify participants of the change

Continue?`,
    );

    if (!confirmed) return;

    setLoading('unpublish');

    updateEventMutation.mutate(
      {
        eventId: event.id,
        updates: {
          status: EventStatus.Draft,
        },
      },
      {
        onSuccess: (updatedEvent) => {
          onEventUpdate(updatedEvent);
          setHasUnsavedChanges(false);
          setLastSaved(new Date());

          addNotification({
            type: 'success',
            title: 'Event Unpublished',
            message: `"${event.name}" has been moved back to draft status.`,
            duration: 5000,
          });
          setLoading(null);
        },
        onError: (error) => {
          addNotification({
            type: 'error',
            title: 'Unpublish Failed',
            message:
              error instanceof Error
                ? error.message
                : 'Failed to unpublish event',
          });
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
        message: `Exactly 2 Tanks are required (currently ${roleCounts.Tank}/2).`,
      };
    }
    if (roleCounts.Healer !== 2) {
      return {
        isValid: false,
        message: `Exactly 2 Healers are required (currently ${roleCounts.Healer}/2).`,
      };
    }
    if (roleCounts.DPS !== 4) {
      return {
        isValid: false,
        message: `Exactly 4 DPS are required (currently ${roleCounts.DPS}/4).`,
      };
    }

    return { isValid: true, message: '' };
  };

  const statusInfo = getEventStatusInfo(event.status);
  const canPublish =
    event.status === EventStatus.Draft && event.roster.filledSlots === 8;
  const canSave = event.status === EventStatus.Draft;
  const canUnpublish = event.status === EventStatus.Published;
  const canCancel = [EventStatus.Draft, EventStatus.Published].includes(
    event.status,
  );

  return (
    <div className="space-y-4">
      {/* Notifications */}
      <div className="fixed top-4 right-4 z-50 space-y-2">
        {notifications.map((notification) => (
          <div
            key={notification.id}
            style={{ backgroundColor: 'var(--bg-primary)' }}
            className={`max-w-sm p-4 rounded-lg shadow-lg border-l-4 ${notificationStyles[notification.type]}`}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h4
                  style={{ color: 'var(--text-primary)' }}
                  className="font-medium"
                >
                  {notification.title}
                </h4>
                <p
                  style={{ color: 'var(--text-secondary)' }}
                  className="mt-1 text-sm"
                >
                  {notification.message}
                </p>
              </div>
              <button
                type="button"
                style={{ color: 'var(--text-tertiary)' }}
                className="ml-2 hover:opacity-80"
                onClick={() => removeNotification(notification.id)}
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Event Status Card */}
      <div
        style={{
          backgroundColor: 'var(--bg-primary)',
          borderColor: 'var(--border-primary)',
        }}
        className="rounded-lg border p-6"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <span
              className={`px-3 py-1 rounded-full text-sm font-medium border ${statusInfo.color}`}
            >
              {statusInfo.icon} {statusInfo.label}
            </span>

            {hasUnsavedChanges && event.status === EventStatus.Draft && (
              <span
                style={{ color: 'var(--warning-text)' }}
                className="text-sm flex items-center gap-1"
              >
                <div
                  style={{ backgroundColor: 'var(--warning-text)' }}
                  className="w-2 h-2 rounded-full animate-pulse"
                />
                Unsaved changes
              </span>
            )}

            {lastSaved && !hasUnsavedChanges && (
              <span
                style={{ color: 'var(--success-text)' }}
                className="text-sm flex items-center gap-1"
              >
                <div
                  style={{ backgroundColor: 'var(--success-text)' }}
                  className="w-2 h-2 rounded-full"
                />
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
              style={{
                backgroundColor:
                  loading === 'publish'
                    ? 'var(--bg-tertiary)'
                    : 'var(--bg-accent)',
                color: 'var(--text-inverse)',
                cursor: loading === 'publish' ? 'wait' : 'pointer',
              }}
              className="px-6 py-3 rounded-lg font-medium transition-opacity flex items-center gap-2 hover:opacity-90"
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
                <>📢 Publish Event</>
              )}
            </button>
          )}

          {canUnpublish && (
            <button
              type="button"
              style={{
                backgroundColor:
                  loading === 'unpublish'
                    ? 'var(--bg-tertiary)'
                    : 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                cursor: loading === 'unpublish' ? 'wait' : 'pointer',
              }}
              className="px-6 py-3 rounded-lg font-medium transition-opacity flex items-center gap-2 hover:opacity-80"
              onClick={handleUnpublishEvent}
              disabled={loading !== null}
            >
              {loading === 'unpublish' ? (
                <>
                  <div
                    style={{ borderColor: 'var(--text-primary)' }}
                    className="animate-spin rounded-full h-4 w-4 border-b-2"
                  />
                  Unpublishing...
                </>
              ) : (
                <>📝 Back to Draft</>
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
              onClick={handleSaveAsDraft}
              disabled={loading !== null}
            >
              {loading === 'save' ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600" />
                  Saving...
                </>
              ) : (
                <>💾 {hasUnsavedChanges ? 'Save Changes' : 'Save Draft'}</>
              )}
            </button>
          )}

          {canCancel && (
            <button
              type="button"
              style={{
                backgroundColor:
                  loading === 'cancel'
                    ? 'rgba(239, 68, 68, 0.3)'
                    : 'rgba(239, 68, 68, 0.1)',
                color: '#ef4444',
                cursor: loading === 'cancel' ? 'wait' : 'pointer',
              }}
              className="px-6 py-3 rounded-lg font-medium transition-opacity flex items-center gap-2 hover:opacity-80"
              onClick={handleCancelEvent}
              disabled={loading !== null}
            >
              {loading === 'cancel' ? (
                <>
                  <div
                    style={{ borderColor: '#ef4444' }}
                    className="animate-spin rounded-full h-4 w-4 border-b-2"
                  />
                  Cancelling...
                </>
              ) : (
                <>🗑️ Cancel Event</>
              )}
            </button>
          )}
        </div>

        {/* Event Details */}
        <div
          style={{ borderColor: 'var(--border-primary)' }}
          className="mt-6 pt-4 border-t"
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
    </div>
  );
}
