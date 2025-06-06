import { CommunityStatsSection } from './CommunityStatsSection.js';
import { QueryProvider } from './QueryProvider.js';

export function CommunityStatsSectionWithProvider() {
  return (
    <QueryProvider>
      <CommunityStatsSection />
    </QueryProvider>
  );
}
