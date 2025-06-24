import { useState } from 'react';
import { useEventQuery } from '../../hooks/queries/useEventsQuery.js';
import { getEventStatusColor } from '../../lib/utils/statusUtils.js';
import { formatEventDate } from '../../lib/utils/uiUtils.js';
import RosterManagementWithProvider from './RosterManagementWithProvider.js';

function getEventIdFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('eventId');
}

export default function EventPageContent() {
  const [eventId] = useState(() => getEventIdFromUrl());

  // Use React Query hook to fetch event data
  const {
    data: event,
    isLoading,
    error,
    isError,
  } = useEventQuery(eventId || '');

  // Loading state
  if (!eventId || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4" />
          <p style={{ color: 'var(--text-secondary)' }}>Loading event...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (isError || !event) {
    const errorMessage = isError
      ? error instanceof Error
        ? error.message
        : 'Failed to load event data'
      : !eventId
        ? 'No event ID provided'
        : 'Event not found';

    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p style={{ color: 'var(--text-error)' }} className="text-lg mb-4">
            {errorMessage}
          </p>
          <a
            href="/scheduling"
            style={{ color: 'var(--text-accent)' }}
            className="hover:opacity-80 transition-opacity"
          >
            ← Back to Events
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen grid grid-cols-[1fr_min(1200px,100%)_1fr] px-4 py-8">
      <div className="col-start-2">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-4">
            <a
              href="/scheduling"
              style={{ color: 'var(--text-accent)' }}
              className="hover:opacity-80 flex items-center gap-2 transition-opacity"
            >
              <svg
                style={{ color: 'var(--text-accent)' }}
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M15 19l-7-7 7-7"
                />
              </svg>
              Back to Events
            </a>
            <span
              className={`px-3 py-1 rounded-full text-sm font-medium ${getEventStatusColor(event.status)}`}
            >
              {event.status}
            </span>
          </div>

          <h1
            style={{ color: 'var(--text-primary)' }}
            className="text-3xl font-bold"
          >
            {event.name}
          </h1>
          <p style={{ color: 'var(--text-secondary)' }} className="mt-2">
            Roster management for {event.encounter}
          </p>
        </div>

        {/* Event Details Card */}
        <div
          style={{
            backgroundColor: 'var(--bg-primary)',
            borderColor: 'var(--border-primary)',
          }}
          className="rounded-lg border p-6 mb-8"
        >
          <h2
            style={{ color: 'var(--text-primary)' }}
            className="text-xl font-semibold mb-4"
          >
            Event Details
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <h3
                style={{ color: 'var(--text-secondary)' }}
                className="text-sm font-medium mb-1"
              >
                Encounter
              </h3>
              <p
                style={{ color: 'var(--text-primary)' }}
                className="text-lg font-semibold"
              >
                {event.encounter}
              </p>
            </div>

            <div>
              <h3
                style={{ color: 'var(--text-secondary)' }}
                className="text-sm font-medium mb-1"
              >
                Scheduled Time
              </h3>
              <p
                style={{ color: 'var(--text-primary)' }}
                className="text-lg font-semibold"
              >
                {formatEventDate(event.scheduledTime)}
              </p>
            </div>

            <div>
              <h3
                style={{ color: 'var(--text-secondary)' }}
                className="text-sm font-medium mb-1"
              >
                Duration
              </h3>
              <p
                style={{ color: 'var(--text-primary)' }}
                className="text-lg font-semibold"
              >
                {event.duration} minutes
              </p>
            </div>

            <div>
              <h3
                style={{ color: 'var(--text-secondary)' }}
                className="text-sm font-medium mb-1"
              >
                Team Leader
              </h3>
              <p
                style={{ color: 'var(--text-primary)' }}
                className="text-lg font-semibold"
              >
                {event.teamLeaderName}
              </p>
            </div>

            <div>
              <h3
                style={{ color: 'var(--text-secondary)' }}
                className="text-sm font-medium mb-1"
              >
                Roster Progress
              </h3>
              <p
                style={{ color: 'var(--text-primary)' }}
                className="text-lg font-semibold"
              >
                {event.roster.filledSlots}/{event.roster.totalSlots} slots
                filled
              </p>
            </div>

            <div>
              <h3
                style={{ color: 'var(--text-secondary)' }}
                className="text-sm font-medium mb-1"
              >
                Party
              </h3>
              <p
                style={{ color: 'var(--text-primary)' }}
                className="text-lg font-semibold"
              >
                8 slots
              </p>
            </div>
          </div>
        </div>

        {/* Interactive Roster Management */}
        <RosterManagementWithProvider
          event={event}
          teamLeaderId={event.teamLeaderId}
        />
      </div>
    </div>
  );
}
