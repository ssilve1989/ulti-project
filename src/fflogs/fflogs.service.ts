import { Injectable } from '@nestjs/common';
import {
  EmptyError,
  type Observable,
  catchError,
  first,
  from,
  mergeMap,
  of,
} from 'rxjs';
import type { Encounter } from '../encounters/encounters.consts.js';
import { EncounterIds } from './fflogs.consts.js';
import { InjectFFLogsSDKClient } from './fflogs.decorators.js';
import type { FFLogsSDKClient } from './fflogs.interfaces.js';
import type { EncounterRankingsQueryVariables } from './graphql/sdk.js';

@Injectable()
class FFLogsService {
  constructor(
    @InjectFFLogsSDKClient() private readonly client: FFLogsSDKClient,
  ) {}

  hasClearedEncounter(
    encounter: Encounter,
    queryParams: EncounterRankingsQueryVariables,
  ): Observable<boolean> {
    const ids = EncounterIds.get(encounter);

    if (!ids) {
      throw new Error(`No FFLogs IDs configured for encounter ${encounter}`);
    }

    return from(ids).pipe(
      mergeMap(async (encounterId) => {
        const result = await this.client.encounterRankings({
          ...queryParams,
          encounterID: encounterId,
        });

        const hasKills =
          result.characterData?.character?.encounterRankings?.totalKills > 0;
        return hasKills;
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

export { FFLogsService };
