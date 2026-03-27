import { GraphQLClient, gql } from 'graphql-request';

const FFLOGS_API_URL = 'https://www.fflogs.com/api/v2/client';

const WorldDataQuery = gql`
  query worldData {
    worldData {
      zones {
        id
        name
        encounters {
          id
          name
        }
      }
    }
  }
`;

export interface FflogsEncounterResult {
  id: number;
  name: string;
  zoneName: string;
  zoneId: number;
}

interface WorldDataQueryResult {
  worldData: {
    zones: Array<{
      id: number;
      name: string;
      encounters: Array<{
        id: number;
        name: string;
      }> | null;
    }> | null;
  } | null;
}

// In-memory cache for the duration of the CLI session
let cachedResults: FflogsEncounterResult[] | null = null;

async function fetchAllEncounters(
  token: string,
): Promise<FflogsEncounterResult[]> {
  if (cachedResults) return cachedResults;

  const client = new GraphQLClient(FFLOGS_API_URL, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const data = await client.request<WorldDataQueryResult>(WorldDataQuery);
  const zones = data.worldData?.zones ?? [];

  const results: FflogsEncounterResult[] = [];
  for (const zone of zones) {
    for (const encounter of zone.encounters ?? []) {
      results.push({
        id: encounter.id,
        name: encounter.name,
        zoneName: zone.name,
        zoneId: zone.id,
      });
    }
  }

  cachedResults = results;
  return results;
}

export async function searchFflogsEncounters(
  token: string,
  query: string,
): Promise<FflogsEncounterResult[]> {
  const all = await fetchAllEncounters(token);
  const lower = query.toLowerCase();
  return all.filter((e) => e.name.toLowerCase().includes(lower));
}

export function clearFflogsCache(): void {
  cachedResults = null;
}
