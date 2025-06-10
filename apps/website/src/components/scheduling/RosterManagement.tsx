import type { Participant, ScheduledEvent } from '@ulti-project/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getEvent } from '../../lib/schedulingApi.js';
import ErrorBoundary from './ErrorBoundary.js';
import EventManagement from './EventManagement.js';
import ParticipantPool from './ParticipantPool.js';
import RosterBuilder from './RosterBuilder.js';

interface RosterManagementProps {
  event: ScheduledEvent;
  teamLeaderId: string;
  onEventUpdate?: (event: ScheduledEvent) => void;
}

export default function RosterManagement({
  event: initialEvent,
  teamLeaderId,
  onEventUpdate = (updatedEvent) => {
    console.log('Event updated (default handler):', updatedEvent);
  },
}: RosterManagementProps) {
  console.log(
    'RosterManagement initialized with onEventUpdate:',
    typeof onEventUpdate,
    onEventUpdate,
  );

  // Use a ref to store the function to avoid closure issues
  const onEventUpdateRef = useRef(onEventUpdate);
  onEventUpdateRef.current = onEventUpdate;

  // State for the current event (starts with static data, then fetches fresh data)
  const [event, setEvent] = useState<ScheduledEvent>(initialEvent);
  const [isLoadingFreshData, setIsLoadingFreshData] = useState(true);

  const [selectedParticipants, setSelectedParticipants] = useState<Set<string>>(
    new Set(),
  );
  const [showParticipantPool, setShowParticipantPool] = useState(true);
  const [pendingParticipant, setPendingParticipant] =
    useState<Participant | null>(null);

  // Fetch fresh event data on mount to override stale static data
  useEffect(() => {
    const fetchFreshEventData = async () => {
      try {
        const freshEvent = await getEvent(initialEvent.id);
        if (freshEvent) {
          setEvent(freshEvent);
          console.log('Loaded fresh event data:', freshEvent);
        }
      } catch (error) {
        console.error('Failed to fetch fresh event data:', error);
        // Keep using the initial static data if fetch fails
      } finally {
        setIsLoadingFreshData(false);
      }
    };

    fetchFreshEventData();
  }, [initialEvent.id]);

  // Track selected participants from roster
  const updateSelectedParticipants = useCallback(
    (updatedEvent: ScheduledEvent) => {
      console.log(
        'updateSelectedParticipants called with onEventUpdate:',
        typeof onEventUpdateRef.current,
        onEventUpdateRef.current,
      );

      const selected = new Set<string>();

      for (const party of updatedEvent.roster.parties) {
        for (const slot of party) {
          if (slot.assignedParticipant) {
            selected.add(
              `${slot.assignedParticipant.type}-${slot.assignedParticipant.id}`,
            );
          }
        }
      }

      setSelectedParticipants(selected);

      // Update the local event state
      setEvent(updatedEvent);

      if (typeof onEventUpdateRef.current === 'function') {
        onEventUpdateRef.current(updatedEvent);
      } else {
        console.error(
          'onEventUpdate is not a function:',
          typeof onEventUpdateRef.current,
          onEventUpdateRef.current,
        );
      }
    },
    [], // Remove onEventUpdate from dependencies since we use ref
  );

  const handleParticipantSelect = useCallback((participant: Participant) => {
    // Set the participant as pending assignment
    setPendingParticipant(participant);
    console.log('Participant selected for assignment:', participant);
  }, []);

  const handleSlotSelect = useCallback(() => {
    if (pendingParticipant) {
      // Clear the pending participant after assignment attempt
      setPendingParticipant(null);
    }
  }, [pendingParticipant]);

  const handleToggleParticipantPool = () => {
    setShowParticipantPool(!showParticipantPool);
  };

  const handleEventDeleted = () => {
    // Redirect to scheduling dashboard
    window.location.href = '/scheduling';
  };

  return (
    <div className="space-y-6">
      {/* Loading indicator while fetching fresh data */}
      {isLoadingFreshData && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600" />
            <span className="text-blue-800 text-sm">
              Loading latest roster data...
            </span>
          </div>
        </div>
      )}

      {/* Event Actions */}
      <ErrorBoundary>
        <EventManagement
          event={event}
          teamLeaderId={teamLeaderId}
          onEventUpdate={updateSelectedParticipants}
          onEventDeleted={handleEventDeleted}
        />
      </ErrorBoundary>

      {/* Toggle Button for Mobile */}
      <div className="lg:hidden">
        <button
          type="button"
          onClick={handleToggleParticipantPool}
          className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          {showParticipantPool ? 'Show Roster' : 'Show Participants'}
        </button>
      </div>

      {/* Desktop Layout */}
      <div className="hidden lg:grid lg:grid-cols-5 lg:gap-6">
        {/* Participant Pool - Left Side */}
        <div className="lg:col-span-2">
          <ErrorBoundary>
            <ParticipantPool
              eventId={event.id}
              encounter={event.encounter}
              onParticipantSelect={handleParticipantSelect}
              selectedParticipants={selectedParticipants}
              pendingParticipant={pendingParticipant}
            />
          </ErrorBoundary>
        </div>

        {/* Roster Builder - Right Side */}
        <div className="lg:col-span-3">
          <ErrorBoundary>
            <RosterBuilder
              event={event}
              teamLeaderId={teamLeaderId}
              onEventUpdate={updateSelectedParticipants}
              onParticipantSelect={handleParticipantSelect}
              pendingParticipant={pendingParticipant}
              onSlotSelect={handleSlotSelect}
            />
          </ErrorBoundary>
        </div>
      </div>

      {/* Mobile Layout */}
      <div className="lg:hidden">
        {showParticipantPool ? (
          <ErrorBoundary>
            <ParticipantPool
              eventId={event.id}
              encounter={event.encounter}
              onParticipantSelect={handleParticipantSelect}
              selectedParticipants={selectedParticipants}
              pendingParticipant={pendingParticipant}
            />
          </ErrorBoundary>
        ) : (
          <ErrorBoundary>
            <RosterBuilder
              event={event}
              teamLeaderId={teamLeaderId}
              onEventUpdate={updateSelectedParticipants}
              onParticipantSelect={handleParticipantSelect}
              pendingParticipant={pendingParticipant}
              onSlotSelect={handleSlotSelect}
            />
          </ErrorBoundary>
        )}
      </div>

      {/* Instructions */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="text-sm font-medium text-blue-900 mb-2">
          How to Build Your Roster
        </h3>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>
            • <strong>Click participants</strong> in the left panel to select
            them
          </li>
          <li>
            • <strong>Click empty slots</strong> in the roster to assign
            participants
          </li>
          <li>
            • <strong>Click filled slots</strong> to unassign participants
          </li>
          <li>
            • <strong>Any participant</strong> can be assigned to any compatible
            role slot
          </li>
          <li>
            • <strong>Yellow indicators</strong> show participants locked by
            other team leaders
          </li>
          <li>
            • <strong>Green highlighted slots</strong> show compatible slots for
            selected participants
          </li>
        </ul>

        {pendingParticipant && (
          <div className="mt-3 p-3 bg-blue-100 border border-blue-300 rounded-lg">
            <div className="flex items-center gap-2">
              <span className="text-blue-800 font-medium">Selected:</span>
              <span className="text-blue-900">{pendingParticipant.name}</span>
              <span className="text-xs bg-blue-200 text-blue-800 px-2 py-1 rounded">
                {pendingParticipant.job}
              </span>
            </div>
            <p className="text-xs text-blue-700 mt-1">
              Click a compatible green slot to assign this participant
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
