import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EventsList } from './EventsList.js';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export function EventsListWithProvider() {
  return (
    <QueryClientProvider client={queryClient}>
      <EventsList />
    </QueryClientProvider>
  );
}