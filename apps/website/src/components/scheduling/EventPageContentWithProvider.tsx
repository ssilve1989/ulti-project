import { QueryProvider } from '../QueryProvider.js';
import EventPageContent from './EventPageContent.js';

export default function EventPageContentWithProvider() {
  return (
    <QueryProvider>
      <EventPageContent />
    </QueryProvider>
  );
}