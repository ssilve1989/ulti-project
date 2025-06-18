import type { EncounterInfo, SignupDisplayData } from '@ulti-project/shared';
import { useCallback, useEffect, useState } from 'react';
import {
  type SignupChangeEvent,
  createSignupsEventSource,
  devControls,
  getInitialSignups,
} from '../../lib/api.js';

export function useSignupsData() {
  const [signups, setSignups] = useState<SignupDisplayData[]>([]);
  const [encounters, setEncounters] = useState<EncounterInfo[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recentlyUpdated, setRecentlyUpdated] = useState<Set<string>>(
    new Set(),
  );
  const [useMockData, setUseMockData] = useState(
    devControls?.useMockData() ?? false,
  );

  // Load initial data on mount and when mock data setting changes
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        setIsLoading(true);
        setError(null);
        setSignups([]); // Clear existing data
        const data = await getInitialSignups();
        setSignups(data.signups);
        setEncounters(data.encounters as EncounterInfo[]);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load signups');
        console.error('Failed to load initial signups:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadInitialData();

    // Listen for mock data toggle changes
    const handleMockDataChange = () => {
      // Update mock data state
      setUseMockData(devControls?.useMockData() ?? false);
      loadInitialData();
    };

    window.addEventListener('mock-data-changed', handleMockDataChange);

    return () => {
      window.removeEventListener('mock-data-changed', handleMockDataChange);
    };
  }, []);

  // Handle SSE updates
  const handleSignupChange = useCallback((event: SignupChangeEvent) => {
    setSignups((prevSignups) => {
      const { type, doc } = event;

      switch (type) {
        case 'added':
          // Check if signup already exists (to handle initial load)
          if (prevSignups.some((s) => s.id === doc.id)) {
            return prevSignups;
          }
          return [...prevSignups, doc];

        case 'modified':
          // Mark as recently updated for flash animation
          setRecentlyUpdated((prev) => new Set(prev).add(doc.id));

          // Remove from recently updated after animation duration
          setTimeout(() => {
            setRecentlyUpdated((prev) => {
              const newSet = new Set(prev);
              newSet.delete(doc.id);
              return newSet;
            });
          }, 2000); // 2 second flash duration

          return prevSignups.map((signup) =>
            signup.id === doc.id ? doc : signup,
          );

        case 'removed':
          return prevSignups.filter((signup) => signup.id !== doc.id);

        default:
          return prevSignups;
      }
    });
  }, []);

  // Set up SSE connection for real-time updates (after initial load)
  useEffect(() => {
    // Only set up SSE after initial data is loaded
    if (isLoading) {
      return;
    }

    const eventSource = createSignupsEventSource();

    if (!eventSource) {
      return; // SSR or mock disabled
    }

    const handleMessage = (event: MessageEvent) => {
      try {
        const changeEvent: SignupChangeEvent = JSON.parse(event.data);
        // Only handle modifications and removals, not additions (to avoid duplicates from initial load)
        if (changeEvent.type === 'modified' || changeEvent.type === 'removed') {
          handleSignupChange(changeEvent);
        }
      } catch (error) {
        console.error('Failed to parse SSE message:', error);
      }
    };

    const handleOpen = () => {
      setIsConnected(true);
      console.log('SSE connection established for real-time updates');
    };

    const handleError = (error: Event) => {
      setIsConnected(false);
      console.error('SSE connection error:', error);
    };

    eventSource.addEventListener('message', handleMessage);
    eventSource.addEventListener('open', handleOpen);
    eventSource.addEventListener('error', handleError);

    return () => {
      eventSource.close();
      setIsConnected(false);
    };
  }, [handleSignupChange, isLoading]);

  return {
    signups,
    encounters,
    isConnected,
    isLoading,
    error,
    recentlyUpdated,
    useMockData,
  };
}
