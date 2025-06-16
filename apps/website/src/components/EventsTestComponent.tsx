import type { ScheduledEvent } from '@ulti-project/shared';
import { useEventsQuery } from '../hooks/api/useEvents.js';
import { QueryProvider } from './QueryProvider.js';

function EventsTestComponent() {
  // Use the mock guild ID for testing
  const { data, isLoading, error } = useEventsQuery({
    guildId: '913492538516717578', // MOCK_GUILD_ID from mockData.ts
    limit: 10,
  });

  if (isLoading) {
    return <div>Loading events...</div>;
  }

  if (error) {
    return <div>Error loading events: {error.message}</div>;
  }

  const apiType =
    import.meta.env.VITE_USE_MOCK_API === 'true' ? 'Mock' : 'Real';

  // Debug: let's see what the data looks like
  console.log('Events data:', data);
  if (data?.events?.[0]) {
    console.log(
      'First event scheduledTime:',
      data.events[0].scheduledTime,
      typeof data.events[0].scheduledTime,
    );
  }

  return (
    <div>
      <h2>Events ({apiType} API Test)</h2>
      <p>Total events: {data?.events?.length || 0}</p>
      <p>Has more: {data?.hasMore ? 'Yes' : 'No'}</p>
      {data?.events && data.events.length > 0 ? (
        <ul>
          {data.events.map((event: ScheduledEvent & { guildId: string }) => {
            // Debug the date conversion
            const rawDate = event.scheduledTime;
            const dateObj = new Date(rawDate);
            const dateString = dateObj.toLocaleDateString();

            return (
              <li key={event.id}>
                {event.name} - {event.encounter} - {dateString} - Status:{' '}
                {event.status}
                {/* Debug info */}
                <small style={{ marginLeft: '10px', color: 'gray' }}>
                  (Raw: {String(rawDate)}, Type: {typeof rawDate})
                </small>
              </li>
            );
          })}
        </ul>
      ) : (
        <p>No events found</p>
      )}
    </div>
  );
}

export function EventsTestWithProvider() {
  return (
    <QueryProvider>
      <EventsTestComponent />
    </QueryProvider>
  );
}

export default EventsTestWithProvider;
