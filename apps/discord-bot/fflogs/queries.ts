import { gql } from 'graphql-request';

export const CharacterDataQuery = gql`
  query characterData($name: String, $server: String, $region: String) {
    characterData {
      character(name: $name, serverSlug: $server, serverRegion: $region) {
          hidden
          id
          lodestoneID
          name
          zoneRankings
      }
    }
  }
`;

export const EncounterRankingsQuery = gql`
query encounterRankings($name: String, $server: String, $region: String, $encounterID: Int) {
    characterData {
        character(name: $name, serverSlug: $server, serverRegion: $region) {
            id
            name
            encounterRankings(
                encounterID: $encounterID
                includeCombatantInfo: false
                includeOtherPlayers: false
                includeHistoricalGraph: false
                includePrivateLogs: true
                partition: -1
            )
        }
    }
}`;
