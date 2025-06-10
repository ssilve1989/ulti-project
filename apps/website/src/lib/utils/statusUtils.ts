import { EventStatus } from '@ulti-project/shared';

export interface StatusInfo {
  color: string;
  icon: string;
  label: string;
}

/**
 * Get status color classes for event status badges
 * Consolidates getStatusColor functions from multiple components
 */
export function getEventStatusColor(status: string): string {
  switch (status) {
    case 'draft':
    case EventStatus.Draft:
      return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    case 'published':
    case EventStatus.Published:
      return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'in-progress':
    case EventStatus.InProgress:
      return 'bg-green-100 text-green-800 border-green-200';
    case 'completed':
    case EventStatus.Completed:
      return 'bg-gray-100 text-gray-800 border-gray-200';
    case 'cancelled':
    case EventStatus.Cancelled:
      return 'bg-red-100 text-red-800 border-red-200';
    default:
      return 'bg-gray-100 text-gray-800 border-gray-200';
  }
}

/**
 * Get status color classes for dashboard-style status indicators
 */
export function getEventStatusColorDashboard(status: string): string {
  switch (status) {
    case 'draft':
    case EventStatus.Draft:
      return 'text-yellow-600 bg-yellow-50 border-yellow-200';
    case 'published':
    case EventStatus.Published:
      return 'text-blue-600 bg-blue-50 border-blue-200';
    case 'in-progress':
    case EventStatus.InProgress:
      return 'text-green-600 bg-green-50 border-green-200';
    case 'completed':
    case EventStatus.Completed:
      return 'text-gray-600 bg-gray-50 border-gray-200';
    case 'cancelled':
    case EventStatus.Cancelled:
      return 'text-red-600 bg-red-50 border-red-200';
    default:
      return 'text-gray-600 bg-gray-50 border-gray-200';
  }
}

/**
 * Get complete status information including icon and label
 */
export function getEventStatusInfo(status: string): StatusInfo {
  switch (status) {
    case 'draft':
    case EventStatus.Draft:
      return {
        color: 'bg-yellow-100 text-yellow-800 border-yellow-200',
        icon: '📝',
        label: 'Draft',
      };
    case 'published':
    case EventStatus.Published:
      return {
        color: 'bg-blue-100 text-blue-800 border-blue-200',
        icon: '📢',
        label: 'Published',
      };
    case 'in-progress':
    case EventStatus.InProgress:
      return {
        color: 'bg-green-100 text-green-800 border-green-200',
        icon: '🎮',
        label: 'In Progress',
      };
    case 'completed':
    case EventStatus.Completed:
      return {
        color: 'bg-gray-100 text-gray-800 border-gray-200',
        icon: '✅',
        label: 'Completed',
      };
    case 'cancelled':
    case EventStatus.Cancelled:
      return {
        color: 'bg-red-100 text-red-800 border-red-200',
        icon: '❌',
        label: 'Cancelled',
      };
    default:
      return {
        color: 'bg-gray-100 text-gray-800 border-gray-200',
        icon: '❓',
        label: 'Unknown',
      };
  }
}

/**
 * Get event icon for status
 */
export function getEventIcon(status: string): string {
  switch (status) {
    case 'draft':
    case EventStatus.Draft:
      return '📝';
    case 'published':
    case EventStatus.Published:
      return '📢';
    case 'in-progress':
    case EventStatus.InProgress:
      return '⚔️';
    case 'completed':
    case EventStatus.Completed:
      return '✅';
    case 'cancelled':
    case EventStatus.Cancelled:
      return '❌';
    default:
      return '❓';
  }
}

/**
 * Get participant status color classes
 */
export function getParticipantStatusColor(statusType: string): string {
  switch (statusType) {
    case 'selected':
      return 'bg-green-100 text-green-800';
    case 'locked':
      return 'bg-yellow-100 text-yellow-800';
    case 'unavailable':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-gray-100 text-gray-600';
  }
}
