import { Role } from '@ulti-project/shared';

/**
 * Get role icon emoji
 * Consolidates getRoleIcon functions from multiple components
 */
export function getRoleIcon(role: Role | string): string {
  switch (role) {
    case 'Tank':
    case Role.Tank:
      return '🛡️';
    case 'Healer':
    case Role.Healer:
      return '💚';
    case 'DPS':
    case Role.DPS:
      return '⚔️';
    default:
      return '❓';
  }
}

/**
 * Get progress color based on percentage
 */
export function getProgressColor(percentage: number): string {
  if (percentage >= 100) return 'bg-green-500';
  if (percentage >= 75) return 'bg-blue-500';
  if (percentage >= 50) return 'bg-yellow-500';
  if (percentage >= 25) return 'bg-orange-500';
  return 'bg-red-500';
}
