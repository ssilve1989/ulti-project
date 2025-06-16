import type { GetHelpersResponse, HelperData } from '@ulti-project/shared';
import { useHelpersQuery } from '../hooks/api/useHelpers.js';
import { QueryProvider } from './QueryProvider.js';

function HelpersTestComponent() {
  // Use the mock guild ID for testing
  const { data, isLoading, error } = useHelpersQuery({
    guildId: '913492538516717578', // MOCK_GUILD_ID from mockData.ts
    limit: 10,
    offset: 0,
  });

  if (isLoading) {
    return <div>Loading helpers...</div>;
  }

  if (error) {
    return <div>Error loading helpers: {error.message}</div>;
  }

  const apiType =
    import.meta.env.VITE_USE_MOCK_API === 'true' ? 'Mock' : 'Real';
  const helpersData = data as GetHelpersResponse;

  return (
    <div>
      <h2>Helpers ({apiType} API Test)</h2>
      <p>Total helpers: {helpersData?.total || 0}</p>
      <p>Has more: {helpersData?.hasMore ? 'Yes' : 'No'}</p>
      {helpersData?.helpers && helpersData.helpers.length > 0 ? (
        <ul>
          {helpersData.helpers.map(
            (helper: HelperData & { guildId: string }) => (
              <li key={helper.id}>
                {helper.name} - Jobs:{' '}
                {helper.availableJobs.map((job) => job.job).join(', ')}
                {helper.weeklyAvailability &&
                  helper.weeklyAvailability.length > 0 &&
                  ` - Available ${helper.weeklyAvailability.length} days/week`}
              </li>
            ),
          )}
        </ul>
      ) : (
        <p>No helpers found</p>
      )}
    </div>
  );
}

export function HelpersTestWithProvider() {
  return (
    <QueryProvider>
      <HelpersTestComponent />
    </QueryProvider>
  );
}

export default HelpersTestWithProvider;
