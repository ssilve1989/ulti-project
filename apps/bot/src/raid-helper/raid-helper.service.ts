import { Injectable } from '@nestjs/common';
import { InjectRaidHelperApi } from './raid-helper.decorators.js';
import type { RaidHelperApi } from './raid-helper.interfaces.js';
import {
  type RaidHelperEvent,
  raidHelperEventSchema,
  raidHelperFailureSchema,
} from './raid-helper.schema.js';

@Injectable()
class RaidHelperService {
  constructor(@InjectRaidHelperApi() private readonly api: RaidHelperApi) {}

  /** The event, or undefined when raid-helper has no event with that id. */
  async getEvent(eventId: string): Promise<RaidHelperEvent | undefined> {
    const body = await this.api.getEvent(eventId);

    const failure = raidHelperFailureSchema.safeParse(body);
    if (failure.success && failure.data.reason === 'unknown event') {
      return undefined;
    }

    // any other failure fails to parse, and propagates
    return raidHelperEventSchema.parse(body);
  }
}

export { RaidHelperService };
