import { Injectable } from '@nestjs/common';
import { EmptyError, catchError, first, from, mergeMap, of } from 'rxjs';
import type { Encounter } from '../encounters/encounters.consts.js';
import { EncounterIds } from './fflogs.consts.js';
import { InjectFFLogsSDKClient } from './fflogs.decorators.js';
import type { FFLogsSDKClient } from './fflogs.interfaces.js';
import type { EncounterRankingsQueryVariables } from './graphql/sdk.js';

@Injectable()
class FfLogsService {
  constructor(
    @InjectFFLogsSDKClient() private readonly client: FFLogsSDKClient,
  ) {}

  hasClearedEncounter(
    encounter: Encounter,
    queryParams: EncounterRankingsQueryVariables,
  ) {
    const ids = EncounterIds.get(encounter);

    if (!ids) {
      throw new Error(`No FFLogs IDs configured for encounter ${encounter}`);
    }

    return from(ids).pipe(
      mergeMap(async (id) => {
        const result = await this.client.encounterRankings({
          ...queryParams,
          encounterID: id,
        });

        console.log({
          ...queryParams,
          encounterID: id,
        });

        return (
          result.characterData?.character?.encounterRankings?.totalKills > 0
        );
      }),
      first((hasKilled) => hasKilled),
      catchError((err) => {
        if (err instanceof EmptyError) {
          return of(false);
        }
        throw err;
      }),
    );
  }
}

export { FfLogsService };
