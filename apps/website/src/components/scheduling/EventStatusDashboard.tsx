import type { ScheduledEvent } from '@ulti-project/shared';
import { useMemo } from 'react';
import { getProgressColor, getRoleIcon } from '../../lib/utils/roleUtils.js';
import {
  getEventIcon,
  getEventStatusColorDashboard,
} from '../../lib/utils/statusUtils.js';

interface EventStatusDashboardProps {
  event: ScheduledEvent;
}

interface RosterStats {
  totalSlots: number;
  filledSlots: number;
  helperSlots: number;
  proggerSlots: number;
  roleBreakdown: {
    Tank: { filled: number; total: number };
    Healer: { filled: number; total: number };
    DPS: { filled: number; total: number };
  };
  completionPercentage: number;
}

export default function EventStatusDashboard({
  event,
}: EventStatusDashboardProps) {
  const stats = useMemo((): RosterStats => {
    let totalSlots = 0;
    let filledSlots = 0;
    let helperSlots = 0;
    let proggerSlots = 0;

    const roleBreakdown = {
      Tank: { filled: 0, total: 0 },
      Healer: { filled: 0, total: 0 },
      DPS: { filled: 0, total: 0 },
    };

    for (const slot of event.roster.party) {
      totalSlots++;
      roleBreakdown[slot.role].total++;

      if (slot.assignedParticipant) {
        filledSlots++;
        roleBreakdown[slot.role].filled++;

        if (slot.assignedParticipant.type === 'helper') {
          helperSlots++;
        } else {
          proggerSlots++;
        }
      }
    }

    return {
      totalSlots,
      filledSlots,
      helperSlots,
      proggerSlots,
      roleBreakdown,
      completionPercentage:
        totalSlots > 0 ? Math.round((filledSlots / totalSlots) * 100) : 0,
    };
  }, [event.roster]);

  const isReadyToPublish =
    stats.filledSlots > 0 &&
    stats.roleBreakdown.Tank.filled > 0 &&
    stats.roleBreakdown.Healer.filled > 0;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
      {/* Event Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{getEventIcon(event.status)}</span>
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              {event.name}
            </h2>
            <p className="text-sm text-gray-600">
              {event.encounter} •{' '}
              {new Date(event.scheduledTime).toLocaleString()}
            </p>
          </div>
        </div>

        <div
          className={`px-3 py-1 rounded-full text-sm font-medium border ${getEventStatusColorDashboard(event.status)}`}
        >
          {event.status.charAt(0).toUpperCase() + event.status.slice(1)}
        </div>
      </div>

      {/* Progress Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Overall Progress */}
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-700">
              Overall Progress
            </h3>
            <span className="text-sm font-semibold text-gray-900">
              {stats.completionPercentage}%
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all duration-300 ${getProgressColor(stats.completionPercentage)}`}
              style={{ width: `${stats.completionPercentage}%` }}
            />
          </div>
          <p className="text-xs text-gray-600 mt-1">
            {stats.filledSlots} of {stats.totalSlots} slots filled
          </p>
        </div>

        {/* Participant Types */}
        <div className="bg-gray-50 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-700 mb-3">
            Participant Mix
          </h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">👥 Helpers</span>
              <span className="text-sm font-medium text-blue-600">
                {stats.helperSlots}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">🎯 Proggers</span>
              <span className="text-sm font-medium text-green-600">
                {stats.proggerSlots}
              </span>
            </div>
          </div>
        </div>

        {/* Readiness Status */}
        <div className="bg-gray-50 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-700 mb-3">
            Event Readiness
          </h3>
          <div className="space-y-2">
            {event.status === 'draft' && (
              <div
                className={`flex items-center gap-2 text-sm ${isReadyToPublish ? 'text-green-600' : 'text-red-600'}`}
              >
                <span>{isReadyToPublish ? '✅' : '❌'}</span>
                <span>
                  {isReadyToPublish
                    ? 'Ready to publish'
                    : 'Not ready to publish'}
                </span>
              </div>
            )}

            <div
              className={`flex items-center gap-2 text-sm ${stats.roleBreakdown.Tank.filled > 0 ? 'text-green-600' : 'text-red-600'}`}
            >
              <span>{stats.roleBreakdown.Tank.filled > 0 ? '✅' : '❌'}</span>
              <span>Tank coverage</span>
            </div>

            <div
              className={`flex items-center gap-2 text-sm ${stats.roleBreakdown.Healer.filled > 0 ? 'text-green-600' : 'text-red-600'}`}
            >
              <span>{stats.roleBreakdown.Healer.filled > 0 ? '✅' : '❌'}</span>
              <span>Healer coverage</span>
            </div>
          </div>
        </div>
      </div>

      {/* Role Breakdown */}
      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-4">
          Role Distribution
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Object.entries(stats.roleBreakdown).map(([role, data]) => (
            <div key={role} className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xl">{getRoleIcon(role)}</span>
                <h4 className="font-medium text-gray-900">{role}</h4>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Filled</span>
                  <span className="text-sm font-medium">
                    {data.filled}/{data.total}
                  </span>
                </div>

                <div className="w-full bg-gray-200 rounded-full h-1.5">
                  <div
                    className={`h-1.5 rounded-full transition-all duration-300 ${
                      data.filled === data.total
                        ? 'bg-green-500'
                        : data.filled > 0
                          ? 'bg-blue-500'
                          : 'bg-gray-300'
                    }`}
                    style={{
                      width: `${data.total > 0 ? (data.filled / data.total) * 100 : 0}%`,
                    }}
                  />
                </div>

                <div className="text-xs text-gray-500">
                  {data.total > 0
                    ? Math.round((data.filled / data.total) * 100)
                    : 0}
                  % complete
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Event Timeline */}
      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-4">
          Event Timeline
        </h3>
        <div className="space-y-3">
          <div className="flex items-center gap-3 text-sm">
            <div className="w-2 h-2 bg-blue-500 rounded-full" />
            <span className="text-gray-600">Created:</span>
            <span className="font-medium">
              {new Date(event.createdAt).toLocaleString()}
            </span>
          </div>

          <div className="flex items-center gap-3 text-sm">
            <div className="w-2 h-2 bg-yellow-500 rounded-full" />
            <span className="text-gray-600">Last Modified:</span>
            <span className="font-medium">
              {new Date(event.lastModified).toLocaleString()}
            </span>
          </div>

          <div className="flex items-center gap-3 text-sm">
            <div className="w-2 h-2 bg-green-500 rounded-full" />
            <span className="text-gray-600">Scheduled:</span>
            <span className="font-medium">
              {new Date(event.scheduledTime).toLocaleString()}
            </span>
          </div>

          <div className="flex items-center gap-3 text-sm">
            <div className="w-2 h-2 bg-purple-500 rounded-full" />
            <span className="text-gray-600">Duration:</span>
            <span className="font-medium">{event.duration} minutes</span>
          </div>
        </div>
      </div>

      {/* Team Leader Info */}
      <div className="pt-4 border-t border-gray-200">
        <div className="flex items-center justify-between text-sm text-gray-600">
          <span>
            Team Leader: <strong>{event.teamLeaderName}</strong>
          </span>
          <span>
            Event ID:{' '}
            <code className="bg-gray-100 px-2 py-1 rounded text-xs">
              {event.id}
            </code>
          </span>
        </div>
      </div>
    </div>
  );
}
