import { QueryProvider } from '../QueryProvider.js';
import { SignupsTable } from './SignupsTable.js';

export function SignupsTableWithProvider() {
  return (
    <QueryProvider>
      <SignupsTable />
    </QueryProvider>
  );
}
