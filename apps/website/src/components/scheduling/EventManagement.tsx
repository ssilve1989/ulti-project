import { EventStatus } from '@ulti-project/shared';
import type { ScheduledEvent } from '@ulti-project/shared';
import { useEffect, useState } from 'react';
import { deleteEvent, updateEvent } from '../../lib/schedulingApi.js';
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

    try {
      setLoading('publish');
      const updatedEvent = await updateEvent(event.id, {
        status: EventStatus.Published,
      });

      onEventUpdate(updatedEvent);
      setHasUnsavedChanges(false);
      setLastSaved(new Date());

      addNotification({
        type: 'success',
        title: 'Event Published',
        message: `"${event.name}" has been published successfully. Participants will be notified.`,
        duration: 7000,
      });
    } catch (error) {
      addNotification({
        type: 'error',
        title: 'Publish Failed',
        message:
          error instanceof Error ? error.message : 'Failed to publish event',
      });
    } finally {
      setLoading(null);
    }
  };

  const handleSaveAsDraft = async () => {
    try {
      setLoading('save');

      // Actually save the draft by updating the lastModified timestamp
      // This ensures the event is marked as saved in the backend
      const updatedEvent = await updateEvent(event.id, {
        // Update lastModified timestamp to mark as saved
        // The roster state is already persisted through assign/unassign operations
      });

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
    } catch (error) {
      addNotification({
        type: 'error',
        title: 'Save Failed',
        message:
          error instanceof Error ? error.message : 'Failed to save draft',
      });
    } finally {
      setLoading(null);
    }
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

    try {
      setLoading('cancel');
      await deleteEvent(event.id, teamLeaderId);

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
    } catch (error) {
      addNotification({
        type: 'error',
        title: 'Cancellation Failed',
        message:
          error instanceof Error ? error.message : 'Failed to cancel event',
      });
      setLoading(null);
    }
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

    try {
      setLoading('unpublish');
      const updatedEvent = await updateEvent(event.id, {
        status: EventStatus.Draft,
      });

      onEventUpdate(updatedEvent);
      setHasUnsavedChanges(false);
      setLastSaved(new Date());

      addNotification({
        type: 'success',
        title: 'Event Unpublished',
        message: `"${event.name}" has been moved back to draft status.`,
        duration: 5000,
      });
    } catch (error) {
      addNotification({
        type: 'error',
        title: 'Unpublish Failed',
        message:
          error instanceof Error ? error.message : 'Failed to unpublish event',
      });
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
            className={`
              max-w-sm p-4 rounded-lg shadow-lg border-l-4 bg-white
              ${notification.type === 'success' ? 'border-green-500' : ''}
              ${notification.type === 'error' ? 'border-red-500' : ''}
              ${notification.type === 'warning' ? 'border-yellow-500' : ''}
              ${notification.type === 'info' ? 'border-blue-500' : ''}
            `}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h4 className="font-medium text-gray-900">
                  {notification.title}
                </h4>
                <p className="mt-1 text-sm text-gray-600">
                  {notification.message}
                </p>
              </div>
              <button
                type="button"
                className="ml-2 text-gray-400 hover:text-gray-600"
                onClick={() => removeNotification(notification.id)}
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Event Status Card */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <span
              className={`px-3 py-1 rounded-full text-sm font-medium border ${statusInfo.color}`}
            >
              {statusInfo.icon} {statusInfo.label}
            </span>

            {hasUnsavedChanges && event.status === EventStatus.Draft && (
              <span className="text-sm text-amber-600 flex items-center gap-1">
                <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
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
              className={`
                px-6 py-3 rounded-lg font-medium transition-colors flex items-center gap-2
                ${
                  loading === 'unpublish'
                    ? 'bg-gray-300 cursor-wait'
                    : 'bg-gray-100 hover:bg-gray-200'
                } text-gray-700
              `}
              onClick={handleUnpublishEvent}
              disabled={loading !== null}
            >
              {loading === 'unpublish' ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600" />
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
                  Cancelling...
                </>
              ) : (
                <>🗑️ Cancel Event</>
              )}
            </button>
          )}
        </div>

        {/* Event Details */}
        <div className="mt-6 pt-4 border-t border-gray-200">
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
    </div>
  );
}
