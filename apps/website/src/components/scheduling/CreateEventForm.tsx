import { useState } from 'react';
import { Encounter } from '@ulti-project/shared';
import { useCreateEventMutation } from '../../hooks/queries/useEventsQuery.js';

// Default durations for each encounter
const DEFAULT_DURATIONS: Record<Encounter, number> = {
  [Encounter.FRU]: 120,
  [Encounter.TOP]: 180,
  [Encounter.DSR]: 150,
  [Encounter.TEA]: 120,
  [Encounter.UWU]: 90,
  [Encounter.UCOB]: 90,
};

interface FormData {
  name: string;
  encounter: Encounter | '';
  date: string;
  time: string;
  duration: number;
}

export default function CreateEventForm() {
  const [formData, setFormData] = useState<FormData>({
    name: '',
    encounter: '',
    date: '',
    time: '',
    duration: 120,
  });

  const createEventMutation = useCreateEventMutation();

  const handleEncounterChange = (encounter: Encounter | '') => {
    setFormData(prev => ({
      ...prev,
      encounter,
      duration: encounter ? DEFAULT_DURATIONS[encounter] : 120,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.encounter) {
      alert('Please select an encounter');
      return;
    }

    // Combine date and time
    const scheduledTime = new Date(`${formData.date}T${formData.time}`).toISOString();

    try {
      const event = await createEventMutation.mutateAsync({
        guildId: '__GUILD_ID__', // This will be replaced with actual guild context
        name: formData.name,
        encounter: formData.encounter,
        scheduledTime,
        duration: formData.duration,
        teamLeaderId: 'current-user', // This will be replaced with actual user ID
      });

      // Redirect to roster management
      window.location.href = `/scheduling/event?eventId=${event.id}`;
    } catch (error) {
      console.error('Failed to create event:', error);
      alert('Failed to create event. Please try again.');
    }
  };

  const encounters = Object.values(Encounter);
  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="min-h-screen grid grid-cols-[1fr_min(800px,100%)_1fr] px-4 py-8">
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
          </div>

          <h1 style={{ color: 'var(--text-primary)' }} className="text-3xl font-bold">
            Create New Event
          </h1>
          <p style={{ color: 'var(--text-secondary)' }} className="mt-2">
            Set up a new Ultimate raid event
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Event Name */}
          <div>
            <label
              htmlFor="name"
              style={{ color: 'var(--text-primary)' }}
              className="block text-sm font-medium mb-2"
            >
              Event Name
            </label>
            <input
              type="text"
              id="name"
              required
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="e.g., FRU Prog Session, TOP Clear Run"
              style={{
                backgroundColor: 'var(--bg-primary)',
                borderColor: 'var(--border-primary)',
                color: 'var(--text-primary)',
              }}
              className="w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-400"
            />
          </div>

          {/* Encounter */}
          <div>
            <label
              htmlFor="encounter"
              style={{ color: 'var(--text-primary)' }}
              className="block text-sm font-medium mb-2"
            >
              Encounter
            </label>
            <select
              id="encounter"
              required
              value={formData.encounter}
              onChange={(e) => handleEncounterChange(e.target.value as Encounter | '')}
              style={{
                backgroundColor: 'var(--bg-primary)',
                borderColor: 'var(--border-primary)',
                color: 'var(--text-primary)',
              }}
              className="w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select an encounter</option>
              {encounters.map((encounter) => (
                <option key={encounter} value={encounter}>
                  {encounter}
                </option>
              ))}
            </select>
          </div>

          {/* Date and Time */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="date"
                style={{ color: 'var(--text-primary)' }}
                className="block text-sm font-medium mb-2"
              >
                Date
              </label>
              <input
                type="date"
                id="date"
                required
                min={today}
                value={formData.date}
                onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
                style={{
                  backgroundColor: 'var(--bg-primary)',
                  borderColor: 'var(--border-primary)',
                  color: 'var(--text-primary)',
                }}
                className="w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label
                htmlFor="time"
                style={{ color: 'var(--text-primary)' }}
                className="block text-sm font-medium mb-2"
              >
                Start Time
              </label>
              <input
                type="time"
                id="time"
                required
                value={formData.time}
                onChange={(e) => setFormData(prev => ({ ...prev, time: e.target.value }))}
                style={{
                  backgroundColor: 'var(--bg-primary)',
                  borderColor: 'var(--border-primary)',
                  color: 'var(--text-primary)',
                }}
                className="w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Duration */}
          <div>
            <label
              htmlFor="duration"
              style={{ color: 'var(--text-primary)' }}
              className="block text-sm font-medium mb-2"
            >
              Duration (minutes)
            </label>
            <input
              type="number"
              id="duration"
              required
              min="30"
              max="300"
              step="15"
              value={formData.duration}
              onChange={(e) => setFormData(prev => ({ ...prev, duration: parseInt(e.target.value) || 120 }))}
              placeholder="120"
              style={{
                backgroundColor: 'var(--bg-primary)',
                borderColor: 'var(--border-primary)',
                color: 'var(--text-primary)',
              }}
              className="w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-400"
            />
            <p style={{ color: 'var(--text-secondary)' }} className="text-sm mt-1">
              Typical durations: Clear parties (20-120 min), Prog parties (60-180 min)
            </p>
          </div>

          {/* Form Actions */}
          <div className="flex gap-4 pt-6">
            <button
              type="submit"
              disabled={createEventMutation.isPending}
              style={{
                backgroundColor: 'var(--bg-accent)',
                color: 'var(--text-inverse)',
              }}
              className="flex-1 hover:opacity-90 px-6 py-3 rounded-lg font-medium transition-opacity disabled:opacity-50"
            >
              {createEventMutation.isPending ? 'Creating...' : 'Create Event'}
            </button>

            <a
              href="/scheduling"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
              }}
              className="flex-1 hover:opacity-80 px-6 py-3 rounded-lg font-medium text-center transition-opacity"
            >
              Cancel
            </a>
          </div>
        </form>

        {/* Loading State */}
        {createEventMutation.isPending && (
          <div className="text-center py-8">
            <div
              style={{ borderColor: 'var(--bg-accent)' }}
              className="inline-block animate-spin rounded-full h-8 w-8 border-b-2"
            />
            <p style={{ color: 'var(--text-secondary)' }} className="mt-2">
              Creating event...
            </p>
          </div>
        )}
      </div>
    </div>
  );
}