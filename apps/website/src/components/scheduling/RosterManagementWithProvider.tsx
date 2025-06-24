import type { ScheduledEvent } from '@ulti-project/shared';
import { QueryProvider } from '../QueryProvider.js';
import RosterManagement from './RosterManagement.js';

interface RosterManagementWithProviderProps {
  event: ScheduledEvent;
  teamLeaderId: string;
  onEventUpdate?: (event: ScheduledEvent) => void;
}

export default function RosterManagementWithProvider(props: RosterManagementWithProviderProps) {
  return (
    <QueryProvider>
      <RosterManagement {...props} />
    </QueryProvider>
  );
}