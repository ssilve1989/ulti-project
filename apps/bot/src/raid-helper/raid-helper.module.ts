import { Module } from '@nestjs/common';
import {
  getRaidHelperApiToken,
  RAID_HELPER_API_URL,
} from './raid-helper.consts.js';
import type { RaidHelperApi } from './raid-helper.interfaces.js';
import { RaidHelperService } from './raid-helper.service.js';

/** Long enough for a slow response, short enough not to leave a command hanging */
const REQUEST_TIMEOUT_MS = 10_000;

const fetchApi: RaidHelperApi = {
  getEvent: async (eventId) => {
    const response = await fetch(
      `${RAID_HELPER_API_URL}/events/${encodeURIComponent(eventId)}`,
      { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) },
    );
    return response.json();
  },
};

@Module({
  providers: [
    RaidHelperService,
    { provide: getRaidHelperApiToken(), useValue: fetchApi },
  ],
  exports: [RaidHelperService],
})
class RaidHelperModule {}

export { RaidHelperModule };
