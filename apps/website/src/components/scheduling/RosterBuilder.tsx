import { Role } from '@ulti-project/shared';
import type {
  Job,
  Participant,
  PartySlot,
  ScheduledEvent,
} from '@ulti-project/shared';
import { useEffect, useState } from 'react';
import {
  assignParticipant,
  createEventEventSource,
  lockParticipant,
  releaseLock,
  unassignParticipant,
} from '../../lib/schedulingApi.js';
import { getJobRole } from '../../lib/utils/jobUtils.js';

interface RosterBuilderProps {
  event: ScheduledEvent;
  teamLeaderId: string;
  onEventUpdate?: (event: ScheduledEvent) => void;
  onParticipantSelect: (participant: Participant) => void;
  pendingParticipant?: Participant | null;
  onSlotSelect?: () => void;
}

interface JobSelectionModal {
  participant: Participant;
  slot: PartySlot;
  availableJobs: Job[];
  onConfirm: (job: Job) => void;
  onCancel: () => void;
}

export default function RosterBuilder({
  event,
  teamLeaderId,
  onEventUpdate = (updatedEvent) => {
    console.log('Event updated (RosterBuilder default):', updatedEvent);
  },
  onParticipantSelect,
  pendingParticipant,
  onSlotSelect,
}: RosterBuilderProps) {
  const [currentEvent, setCurrentEvent] = useState<ScheduledEvent>(event);
  const [jobSelectionModal, setJobSelectionModal] =
    useState<JobSelectionModal | null>(null);
  const [loading, setLoading] = useState<string | null>(null); // slotId being processed
  const [error, setError] = useState<string | null>(null);

  // Update local state when prop changes
  useEffect(() => {
    setCurrentEvent(event);
  }, [event]);

  // Set up real-time event updates
  useEffect(() => {
    const eventSource = createEventEventSource(event.id);

    eventSource.onmessage = (eventData) => {
      try {
        const data = JSON.parse(eventData.data);
        if (data.type === 'event_updated' && data.data.event) {
          setCurrentEvent(data.data.event);
          onEventUpdate(data.data.event);
        }
      } catch (err) {
        console.warn('Failed to parse event SSE data:', err);
      }
    };

    return () => {
      eventSource.close();
    };
  }, [event.id, onEventUpdate]);

  const handleSlotClick = (slot: PartySlot) => {
    if (slot.assignedParticipant) {
      // Unassign participant
      handleUnassignParticipant(slot);
    } else if (pendingParticipant) {
      // Assign the pending participant to this slot
      handleAssignParticipant(pendingParticipant, slot);
      onSlotSelect?.();
    } else {
      // No pending participant - just indicate slot selection
      console.log('Empty slot clicked, select a participant first');
    }
  };

  const handleAssignParticipant = async (
    participant: Participant,
    slot: PartySlot,
  ) => {
    try {
      setLoading(slot.id);
      setError(null);

      // For helpers with multiple jobs, show job selection modal
      if (
        participant.type === 'helper' &&
        (participant as any).availableJobs?.length > 1
      ) {
        const availableJobs = (participant as any).availableJobs
          .filter((helperJob: any) => helperJob.role === slot.role)
          .map((helperJob: any) => helperJob.job);

        if (availableJobs.length > 1) {
          setJobSelectionModal({
            participant,
            slot,
            availableJobs,
            onConfirm: (selectedJob) => {
              setJobSelectionModal(null);
              performAssignment(participant, slot, selectedJob);
            },
            onCancel: () => {
              setJobSelectionModal(null);
              setLoading(null);
            },
          });
          return;
        }
      }

      // Direct assignment for proggers or helpers with single job
      const selectedJob = participant.job;
      await performAssignment(participant, slot, selectedJob);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to assign participant',
      );
    } finally {
      setLoading(null);
    }
  };

  const performAssignment = async (
    participant: Participant,
    slot: PartySlot,
    selectedJob: Job,
  ) => {
    console.log('performAssignment called with:', {
      participant,
      slot,
      selectedJob,
      eventId: event.id,
      teamLeaderId,
    });

    let lockCreated = false;
    try {
      // First lock the participant
      console.log('Attempting to lock participant...');
      await lockParticipant(event.id, teamLeaderId, {
        participantId: participant.id,
        participantType: participant.type,
        slotId: slot.id,
      });
      console.log('Lock created successfully');
      lockCreated = true;

      // Then assign to slot
      console.log('Attempting to assign participant to slot...');
      const updatedEvent = await assignParticipant(event.id, teamLeaderId, {
        participantId: participant.id,
        participantType: participant.type,
        slotId: slot.id,
        selectedJob,
      });
      console.log('Assignment successful, updating state...');

      setCurrentEvent(updatedEvent);
      onEventUpdate(updatedEvent);
      console.log('Assignment completed successfully');
    } catch (err) {
      console.error('Assignment failed:', err);

      // Only try to release lock if it was successfully created
      if (lockCreated) {
        try {
          await releaseLock(
            event.id,
            teamLeaderId,
            participant.id,
            participant.type,
          );
        } catch (releaseErr) {
          console.warn(
            'Failed to release lock after assignment failure:',
            releaseErr,
          );
        }
      }

      // Set error state for user feedback
      setError(err instanceof Error ? err.message : 'Assignment failed');
      throw err;
    }
  };

  const handleUnassignParticipant = async (slot: PartySlot) => {
    if (!slot.assignedParticipant) return;

    try {
      setLoading(slot.id);
      setError(null);

      const updatedEvent = await unassignParticipant(
        event.id,
        teamLeaderId,
        slot.id,
      );
      setCurrentEvent(updatedEvent);
      onEventUpdate(updatedEvent);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to unassign participant',
      );
    } finally {
      setLoading(null);
    }
  };

  const getRoleIcon = (role: Role) => {
    switch (role) {
      case 'Tank':
        return '🛡️';
      case 'Healer':
        return '💚';
      case 'DPS':
        return '⚔️';
      default:
        return '❓';
    }
  };

  const getSlotStatus = (slot: PartySlot) => {
    if (slot.assignedParticipant) {
      return {
        type: 'filled',
        color: 'bg-green-50 border-green-200 text-green-900',
        hoverColor: 'hover:bg-green-100',
      };
    }

    if (slot.draftedBy && slot.draftedBy !== teamLeaderId) {
      return {
        type: 'locked',
        color: 'bg-yellow-50 border-yellow-200 text-yellow-900',
        hoverColor: 'hover:bg-yellow-100',
      };
    }

    // Check if this slot is compatible with pending participant
    const isCompatible =
      pendingParticipant && isSlotCompatible(slot, pendingParticipant);

    if (isCompatible) {
      return {
        type: 'compatible',
        color:
          'bg-green-100 border-green-300 text-green-900 ring-2 ring-green-200',
        hoverColor: 'hover:bg-green-200',
      };
    }

    return {
      type: 'empty',
      color: 'bg-gray-50 border-gray-200 text-gray-600',
      hoverColor: 'hover:bg-gray-100',
    };
  };

  const isSlotCompatible = (
    slot: PartySlot,
    participant: Participant,
  ): boolean => {
    // Can't assign to filled slots
    if (slot.assignedParticipant) return false;

    // Can't assign to locked slots
    if (slot.draftedBy && slot.draftedBy !== teamLeaderId) return false;

    // Check role compatibility
    const participantRole = getJobRole(participant.job);
    if (slot.role !== participantRole) return false;

    // Check job restrictions (if any)
    if (slot.jobRestriction && slot.jobRestriction !== participant.job)
      return false;

    // Allow both helpers and proggers in any slot - no restrictions
    return true;
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">Party Roster</h2>
        <p className="text-sm text-gray-600 mt-1">
          {currentEvent.roster.filledSlots}/{currentEvent.roster.totalSlots}{' '}
          slots filled
        </p>
      </div>

      {/* Error Display */}
      {error && (
        <div className="p-4 bg-red-50 border-b border-red-200">
          <div className="text-red-600 text-sm">
            <strong>Error:</strong> {error}
          </div>
        </div>
      )}

      {/* Party Grid */}
      <div className="p-4">
        <div className="space-y-6">
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              Party Roster
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {currentEvent.roster.party.map((slot) => {
                const status = getSlotStatus(slot);
                const isLoading = loading === slot.id;

                return (
                  <button
                    key={slot.id}
                    type="button"
                    className={`
                      relative p-4 rounded-lg border-2 transition-all duration-200
                      ${status.color} ${status.hoverColor}
                      ${isLoading ? 'opacity-50 cursor-wait' : 'cursor-pointer'}
                      focus:outline-none focus:ring-2 focus:ring-blue-500
                    `}
                    onClick={() => !isLoading && handleSlotClick(slot)}
                    disabled={isLoading}
                  >
                    {/* Loading Spinner */}
                    {isLoading && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600" />
                      </div>
                    )}

                    {/* Slot Content */}
                    <div className={`${isLoading ? 'opacity-30' : ''}`}>
                      {/* Role Header */}
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-1">
                          <span className="text-lg">
                            {getRoleIcon(slot.role)}
                          </span>
                          <span className="text-xs font-medium">
                            {slot.role}
                          </span>
                        </div>
                      </div>

                      {/* Participant Info */}
                      {slot.assignedParticipant ? (
                        <div>
                          <div className="font-medium text-sm truncate">
                            {slot.assignedParticipant.name}
                          </div>
                          <div className="text-xs text-gray-600 truncate">
                            {slot.assignedParticipant.job}
                          </div>
                          {slot.assignedParticipant.characterName && (
                            <div className="text-xs text-gray-500 truncate">
                              {slot.assignedParticipant.characterName}
                            </div>
                          )}
                        </div>
                      ) : slot.draftedBy && slot.draftedBy !== teamLeaderId ? (
                        <div className="text-xs">
                          <div className="font-medium">Locked</div>
                          <div className="text-gray-600">By another leader</div>
                        </div>
                      ) : (
                        <div className="text-xs">
                          <div className="font-medium">Empty Slot</div>
                          <div className="text-gray-600">Click to assign</div>
                        </div>
                      )}

                      {/* Job Restriction */}
                      {slot.jobRestriction && (
                        <div className="text-xs text-gray-500 mt-1">
                          Restricted: {slot.jobRestriction}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Job Selection Modal */}
      {jobSelectionModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Select Job for {jobSelectionModal.participant.name}
            </h3>

            <p className="text-sm text-gray-600 mb-4">
              This helper can play multiple {jobSelectionModal.slot.role} jobs.
              Please select which job they should play for this event.
            </p>

            <div className="grid grid-cols-2 gap-2 mb-6">
              {jobSelectionModal.availableJobs.map((job) => (
                <button
                  key={job}
                  type="button"
                  className="p-3 border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  onClick={() => jobSelectionModal.onConfirm(job)}
                >
                  {job}
                </button>
              ))}
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                onClick={jobSelectionModal.onCancel}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Component is already exported as default above
