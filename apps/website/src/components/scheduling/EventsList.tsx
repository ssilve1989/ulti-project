import { useEventsQuery } from '../../hooks/queries/useEventsQuery.js';
import { getEventStatusColor } from '../../lib/utils/statusUtils.js';
import { formatSchedulingDate } from '../../lib/utils/uiUtils.js';
import type { ScheduledEvent } from '@ulti-project/shared';

interface EventsListProps {
  className?: string;
}

export function EventsList({ className = '' }: EventsListProps) {
  const { data: events, isLoading, error } = useEventsQuery();

  if (isLoading) {
    return (
      <div className={`${className} space-y-4`}>
        {/* Loading skeleton */}
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}
            className="rounded-lg border p-6 animate-pulse"
          >
            <div className="flex justify-between items-start mb-4">
              <div className="space-y-2">
                <div style={{ backgroundColor: 'var(--bg-tertiary)' }} className="h-5 w-32 rounded" />
                <div style={{ backgroundColor: 'var(--bg-tertiary)' }} className="h-4 w-24 rounded" />
              </div>
              <div style={{ backgroundColor: 'var(--bg-tertiary)' }} className="h-6 w-16 rounded-full" />
            </div>
            <div className="space-y-2 mb-4">
              <div style={{ backgroundColor: 'var(--bg-tertiary)' }} className="h-4 w-40 rounded" />
              <div style={{ backgroundColor: 'var(--bg-tertiary)' }} className="h-4 w-32 rounded" />
              <div style={{ backgroundColor: 'var(--bg-tertiary)' }} className="h-4 w-36 rounded" />
            </div>
            <div className="mb-4">
              <div style={{ backgroundColor: 'var(--bg-tertiary)' }} className="h-2 w-full rounded-full" />
            </div>
            <div className="flex gap-2">
              <div style={{ backgroundColor: 'var(--bg-tertiary)' }} className="h-10 flex-1 rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className={`${className} text-center py-12`}>
        <div
          style={{ color: 'var(--text-error)' }}
          className="text-sm font-medium mb-2"
        >
          Failed to load events
        </div>
        <div style={{ color: 'var(--text-secondary)' }} className="text-sm">
          {error instanceof Error ? error.message : 'An error occurred'}
        </div>
      </div>
    );
  }

  if (!events || events.length === 0) {
    return (
      <div className={`${className} text-center py-12`}>
        <svg
          style={{ color: 'var(--text-tertiary)' }}
          className="mx-auto h-12 w-12"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
        <h3
          style={{ color: 'var(--text-primary)' }}
          className="mt-2 text-sm font-medium"
        >
          No events scheduled
        </h3>
        <p
          style={{ color: 'var(--text-secondary)' }}
          className="mt-1 text-sm"
        >
          Get started by creating your first event.
        </p>
        <div className="mt-6">
          <a
            href="/scheduling/create"
            style={{
              backgroundColor: 'var(--bg-accent)',
              color: 'var(--text-inverse)',
            }}
            className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md hover:opacity-90 transition-opacity"
          >
            Create New Event
          </a>
        </div>
      </div>
    );
  }

  // Group events by status for better organization
  const eventsByStatus = {
    draft: events.filter((e) => e.status === 'draft'),
    published: events.filter((e) => e.status === 'published'),
    'in-progress': events.filter((e) => e.status === 'in-progress'),
    completed: events.filter((e) => e.status === 'completed'),
  };

  const handlePublishEvent = async (eventId: string) => {
    // TODO: Implement publish event functionality
    console.log('Publishing event:', eventId);
  };

  return (
    <div className={className}>
      {Object.entries(eventsByStatus).map(([status, statusEvents]) =>
        statusEvents.length > 0 ? (
          <div key={status} className="mb-8">
            <h2
              style={{ color: 'var(--text-primary)' }}
              className="text-xl font-semibold mb-4 capitalize"
            >
              {status.replace('-', ' ')} Events ({statusEvents.length})
            </h2>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {statusEvents.map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  onPublish={handlePublishEvent}
                />
              ))}
            </div>
          </div>
        ) : null
      )}
    </div>
  );
}

interface EventCardProps {
  event: ScheduledEvent;
  onPublish: (eventId: string) => void;
}

function EventCard({ event, onPublish }: EventCardProps) {
  return (
    <div
      style={{
        backgroundColor: 'var(--bg-primary)',
        borderColor: 'var(--border-primary)',
      }}
      className="rounded-lg border p-6 hover:shadow-md transition-shadow"
    >
      {/* Event Header */}
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3
            style={{ color: 'var(--text-primary)' }}
            className="font-semibold text-lg"
          >
            {event.name}
          </h3>
          <p
            style={{ color: 'var(--text-secondary)' }}
            className="text-sm"
          >
            {event.encounter}
          </p>
        </div>
        <span
          className={`px-2 py-1 rounded-full text-xs font-medium ${getEventStatusColor(
            event.status
          )}`}
        >
          {event.status}
        </span>
      </div>

      {/* Event Details */}
      <div className="space-y-2 mb-4">
        <div
          style={{ color: 'var(--text-secondary)' }}
          className="flex items-center text-sm"
        >
          <svg
            style={{ color: 'var(--text-secondary)' }}
            className="w-4 h-4 mr-2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          {formatSchedulingDate(event.scheduledTime)}
        </div>

        <div
          style={{ color: 'var(--text-secondary)' }}
          className="flex items-center text-sm"
        >
          <svg
            style={{ color: 'var(--text-secondary)' }}
            className="w-4 h-4 mr-2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          {event.duration} minutes
        </div>

        <div
          style={{ color: 'var(--text-secondary)' }}
          className="flex items-center text-sm"
        >
          <svg
            style={{ color: 'var(--text-secondary)' }}
            className="w-4 h-4 mr-2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
            />
          </svg>
          {event.teamLeaderName}
        </div>
      </div>

      {/* Roster Progress */}
      <div className="mb-4">
        <div
          style={{ color: 'var(--text-secondary)' }}
          className="flex justify-between text-sm mb-1"
        >
          <span>Roster Progress</span>
          <span>
            {event.roster.filledSlots}/{event.roster.totalSlots}
          </span>
        </div>
        <div
          style={{ backgroundColor: 'var(--bg-tertiary)' }}
          className="w-full rounded-full h-2"
        >
          <div
            className="h-2 rounded-full transition-all"
            style={{
              backgroundColor: 'var(--bg-accent)',
              width: `${
                (event.roster.filledSlots / event.roster.totalSlots) * 100
              }%`,
            }}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <a
          href={`/scheduling/${event.id}`}
          style={{
            backgroundColor: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
          }}
          className="flex-1 hover:opacity-80 px-4 py-2 rounded text-center text-sm font-medium transition-opacity"
        >
          {event.status === 'draft' ? 'Edit Roster' : 'View Details'}
        </a>

        {event.status === 'draft' && (
          <button
            type="button"
            style={{
              backgroundColor: 'var(--bg-accent)',
              color: 'var(--text-inverse)',
            }}
            className="hover:opacity-90 px-4 py-2 rounded text-sm font-medium transition-opacity"
            onClick={() => onPublish(event.id)}
          >
            Publish
          </button>
        )}
      </div>
    </div>
  );
}