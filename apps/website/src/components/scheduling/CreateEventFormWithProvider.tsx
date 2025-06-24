import { QueryProvider } from '../QueryProvider.js';
import CreateEventForm from './CreateEventForm.js';

export default function CreateEventFormWithProvider() {
  return (
    <QueryProvider>
      <CreateEventForm />
    </QueryProvider>
  );
}