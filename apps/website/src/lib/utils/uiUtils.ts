/**
 * Common UI utility functions
 */

/**
 * Format date for display in various contexts
 */
export function formatEventDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(date);
}

/**
 * Format date for scheduling index page
 */
export function formatSchedulingDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(date);
}

/**
 * Create loading spinner component props
 */
export interface LoadingSpinnerProps {
  size?: 'small' | 'medium' | 'large';
  color?: 'blue' | 'white' | 'gray';
}

/**
 * Get loading spinner CSS classes
 */
export function getLoadingSpinnerClasses(
  props: LoadingSpinnerProps = {},
): string {
  const { size = 'medium', color = 'blue' } = props;

  const sizeClasses = {
    small: 'h-4 w-4',
    medium: 'h-5 w-5',
    large: 'h-8 w-8',
  };

  const colorClasses = {
    blue: 'border-b-2 border-blue-600',
    white: 'border-b-2 border-white',
    gray: 'border-b-2 border-gray-600',
  };

  return `animate-spin rounded-full ${sizeClasses[size]} ${colorClasses[color]}`;
}

/**
 * Delay utility for async operations
 */
export const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));
