import type { GraphQLClient, RequestOptions } from 'graphql-request';
export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = { [_ in K]?: never };
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
type GraphQLClientRequestHeaders = RequestOptions['requestHeaders'];
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
  JSON: { input: any; output: any; }
};

export type ArchonViewModels = {
  readonly __typename?: 'ArchonViewModels';
  readonly ability?: Maybe<Scalars['JSON']['output']>;
  readonly aboutPage?: Maybe<Scalars['JSON']['output']>;
  readonly accountPage?: Maybe<Scalars['JSON']['output']>;
  readonly adPlacements?: Maybe<Scalars['JSON']['output']>;
  readonly announcementPage?: Maybe<Scalars['JSON']['output']>;
  readonly article?: Maybe<Scalars['JSON']['output']>;
  readonly articleCategories?: Maybe<Scalars['JSON']['output']>;
  readonly articleCategory?: Maybe<Scalars['JSON']['output']>;
  readonly articleIndexPage?: Maybe<Scalars['JSON']['output']>;
  readonly articleSlugs?: Maybe<Scalars['JSON']['output']>;
  readonly authErrorPage?: Maybe<Scalars['JSON']['output']>;
  readonly buildsClassesAndSpecsPage?: Maybe<Scalars['JSON']['output']>;
  readonly buildsSpecPage?: Maybe<Scalars['JSON']['output']>;
  readonly buildsSpecPageSlugs?: Maybe<Scalars['JSON']['output']>;
  readonly buildsZonePage?: Maybe<Scalars['JSON']['output']>;
  readonly buildsZonePageSlugs?: Maybe<Scalars['JSON']['output']>;
  readonly characterPage?: Maybe<Scalars['JSON']['output']>;
  readonly characterPageContent?: Maybe<Scalars['JSON']['output']>;
  readonly cmsNavigation?: Maybe<Scalars['JSON']['output']>;
  readonly contactPage?: Maybe<Scalars['JSON']['output']>;
  readonly fightPage?: Maybe<Scalars['JSON']['output']>;
  readonly fightPageContent?: Maybe<Scalars['JSON']['output']>;
  readonly footer?: Maybe<Scalars['JSON']['output']>;
  readonly game?: Maybe<Scalars['JSON']['output']>;
  readonly gamePage?: Maybe<Scalars['JSON']['output']>;
  readonly gameSlugs?: Maybe<Scalars['JSON']['output']>;
  readonly googleAnalytics?: Maybe<Scalars['JSON']['output']>;
  readonly header?: Maybe<Scalars['JSON']['output']>;
  readonly headerTitle?: Maybe<Scalars['JSON']['output']>;
  readonly indexPage?: Maybe<Scalars['JSON']['output']>;
  readonly pageOfArticlePreviews?: Maybe<Scalars['JSON']['output']>;
  readonly playwireAds?: Maybe<Scalars['JSON']['output']>;
  readonly privacyPolicyPage?: Maybe<Scalars['JSON']['output']>;
  readonly reportPage?: Maybe<Scalars['JSON']['output']>;
  readonly signInPage?: Maybe<Scalars['JSON']['output']>;
  readonly signOutPage?: Maybe<Scalars['JSON']['output']>;
  readonly snippets?: Maybe<Scalars['JSON']['output']>;
  readonly translations?: Maybe<Scalars['JSON']['output']>;
  readonly user?: Maybe<Scalars['JSON']['output']>;
};


export type ArchonViewModelsAbilityArgs = {
  id?: InputMaybe<Scalars['Int']['input']>;
};


export type ArchonViewModelsArticleArgs = {
  articleCategorySlug?: InputMaybe<Scalars['String']['input']>;
  articleSlug?: InputMaybe<Scalars['String']['input']>;
  siteName?: InputMaybe<Scalars['String']['input']>;
};


export type ArchonViewModelsArticleCategoryArgs = {
  articleCategorySlug?: InputMaybe<Scalars['String']['input']>;
};


export type ArchonViewModelsArticleSlugsArgs = {
  articleCategorySlug?: InputMaybe<Scalars['String']['input']>;
  siteName?: InputMaybe<Scalars['String']['input']>;
};


export type ArchonViewModelsBuildsClassesAndSpecsPageArgs = {
  gameSlug?: InputMaybe<Scalars['String']['input']>;
};


export type ArchonViewModelsBuildsSpecPageArgs = {
  affixesSlug?: InputMaybe<Scalars['String']['input']>;
  categorySlug?: InputMaybe<Scalars['String']['input']>;
  classSlug?: InputMaybe<Scalars['String']['input']>;
  difficultySlug?: InputMaybe<Scalars['String']['input']>;
  encounterSlug?: InputMaybe<Scalars['String']['input']>;
  gameSlug?: InputMaybe<Scalars['String']['input']>;
  specSlug?: InputMaybe<Scalars['String']['input']>;
  zoneTypeSlug?: InputMaybe<Scalars['String']['input']>;
};


export type ArchonViewModelsBuildsZonePageArgs = {
  affixesSlug?: InputMaybe<Scalars['String']['input']>;
  difficultySlug?: InputMaybe<Scalars['String']['input']>;
  encounterSlug?: InputMaybe<Scalars['String']['input']>;
  gameSlug?: InputMaybe<Scalars['String']['input']>;
  rankingsSlug?: InputMaybe<Scalars['String']['input']>;
  zoneTypeSlug?: InputMaybe<Scalars['String']['input']>;
};


export type ArchonViewModelsCharacterPageArgs = {
  categorySlug: Scalars['String']['input'];
  characterSlug: Scalars['String']['input'];
  gameSlug: Scalars['String']['input'];
  userId?: InputMaybe<Scalars['Int']['input']>;
  zoneSlug?: InputMaybe<Scalars['String']['input']>;
};


export type ArchonViewModelsCharacterPageContentArgs = {
  categorySlug: Scalars['String']['input'];
  characterSlug: Scalars['String']['input'];
  gameSlug: Scalars['String']['input'];
  userId?: InputMaybe<Scalars['Int']['input']>;
  zoneSlug?: InputMaybe<Scalars['String']['input']>;
};


export type ArchonViewModelsCmsNavigationArgs = {
  currentSlug?: InputMaybe<Scalars['String']['input']>;
};


export type ArchonViewModelsFightPageArgs = {
  categorySlug: Scalars['String']['input'];
  fightSlug: Scalars['String']['input'];
  gameSlug: Scalars['String']['input'];
  phaseSlug?: InputMaybe<Scalars['String']['input']>;
  playerSlug?: InputMaybe<Scalars['String']['input']>;
  reportSlug: Scalars['String']['input'];
  userId?: InputMaybe<Scalars['Int']['input']>;
};


export type ArchonViewModelsFightPageContentArgs = {
  categorySlug: Scalars['String']['input'];
  fightSlug: Scalars['String']['input'];
  gameSlug: Scalars['String']['input'];
  phaseSlug?: InputMaybe<Scalars['String']['input']>;
  playerSlug?: InputMaybe<Scalars['String']['input']>;
  reportSlug: Scalars['String']['input'];
  userId?: InputMaybe<Scalars['Int']['input']>;
};


export type ArchonViewModelsHeaderArgs = {
  gameSlug?: InputMaybe<Scalars['String']['input']>;
};


export type ArchonViewModelsPageOfArticlePreviewsArgs = {
  articleCategorySlug?: InputMaybe<Scalars['String']['input']>;
  pageNumber?: InputMaybe<Scalars['Int']['input']>;
  siteName?: InputMaybe<Scalars['String']['input']>;
};


export type ArchonViewModelsReportPageArgs = {
  reportCode: Scalars['String']['input'];
  userId?: InputMaybe<Scalars['Int']['input']>;
};


export type ArchonViewModelsSnippetsArgs = {
  snippetSlugs?: InputMaybe<ReadonlyArray<InputMaybe<Scalars['String']['input']>>>;
};


export type ArchonViewModelsTranslationsArgs = {
  keys?: InputMaybe<ReadonlyArray<InputMaybe<Scalars['String']['input']>>>;
};

/** A bracket description for a given raid zone. Brackets have a minimum value, maximum value, and a bucket that can be used to establish all of the possible brackets. The type field indicates what the brackets represent, e.g., item levels or game patches, etc. */
export type Bracket = {
  readonly __typename?: 'Bracket';
  /** A float representing the value to increment when moving from bracket 1 to bracket N, etc. */
  readonly bucket: Scalars['Float']['output'];
  /** An integer representing the value used by bracket N when there are a total of N brackets, etc. */
  readonly max: Scalars['Float']['output'];
  /** An integer representing the minimum value used by bracket number 1, etc. */
  readonly min: Scalars['Float']['output'];
  /** The localized name of the bracket type. */
  readonly type?: Maybe<Scalars['String']['output']>;
};

/** A player character. Characters can earn individual rankings and appear in reports. */
export type Character = {
  readonly __typename?: 'Character';
  /** The canonical ID of the character. If a character renames or transfers, then the canonical id can be used to identify the most recent version of the character. */
  readonly canonicalID: Scalars['Int']['output'];
  /** Whether this character is claimed by the current user. Only accessible if accessed via the user API with the "view-user-profile" scope. */
  readonly claimed?: Maybe<Scalars['Boolean']['output']>;
  /** Encounter rankings information for a character, filterable to specific zones, bosses, metrics, etc. This data is not considered frozen, and it can change without notice. Use at your own risk. */
  readonly encounterRankings?: Maybe<Scalars['JSON']['output']>;
  /** Cached game data such as gear for the character. This data was fetched from the appropriate source (Blizzard APIs for WoW, Lodestone for FF). This call will only return a cached copy of the data if it exists already. It will not go out to Blizzard or Lodestone to fetch a new copy. */
  readonly gameData?: Maybe<Scalars['JSON']['output']>;
  /** The guild rank of the character in their primary guild. This is not the user rank on the site, but the rank according to the game data, e.g., a Warcraft guild rank or an FFXIV Free Company rank. */
  readonly guildRank: Scalars['Int']['output'];
  /** All guilds that the character belongs to. */
  readonly guilds?: Maybe<ReadonlyArray<Maybe<Guild>>>;
  /** Whether or not the character has all its rankings hidden. */
  readonly hidden: Scalars['Boolean']['output'];
  /** The ID of the character. */
  readonly id: Scalars['Int']['output'];
  /** The lodestone id of the character. This can be used to obtain the character information on the Lodestone. */
  readonly lodestoneID: Scalars['Int']['output'];
  /** The name of the character. */
  readonly name: Scalars['String']['output'];
  /** Recent reports for the character. */
  readonly recentReports?: Maybe<ReportPagination>;
  /** The server that the character belongs to. */
  readonly server: Server;
  /** Rankings information for a character, filterable to specific zones, bosses, metrics, etc. This data is not considered frozen, and it can change without notice. Use at your own risk. */
  readonly zoneRankings?: Maybe<Scalars['JSON']['output']>;
};


/** A player character. Characters can earn individual rankings and appear in reports. */
export type CharacterEncounterRankingsArgs = {
  byBracket?: InputMaybe<Scalars['Boolean']['input']>;
  className?: InputMaybe<Scalars['String']['input']>;
  compare?: InputMaybe<RankingCompareType>;
  difficulty?: InputMaybe<Scalars['Int']['input']>;
  encounterID?: InputMaybe<Scalars['Int']['input']>;
  includeCombatantInfo?: InputMaybe<Scalars['Boolean']['input']>;
  includeHistoricalGraph?: InputMaybe<Scalars['Boolean']['input']>;
  includeOtherPlayers?: InputMaybe<Scalars['Boolean']['input']>;
  includePrivateLogs?: InputMaybe<Scalars['Boolean']['input']>;
  metric?: InputMaybe<CharacterRankingMetricType>;
  partition?: InputMaybe<Scalars['Int']['input']>;
  role?: InputMaybe<RoleType>;
  size?: InputMaybe<Scalars['Int']['input']>;
  specName?: InputMaybe<Scalars['String']['input']>;
  timeframe?: InputMaybe<RankingTimeframeType>;
};


/** A player character. Characters can earn individual rankings and appear in reports. */
export type CharacterGameDataArgs = {
  forceUpdate?: InputMaybe<Scalars['Boolean']['input']>;
  specID?: InputMaybe<Scalars['Int']['input']>;
};


/** A player character. Characters can earn individual rankings and appear in reports. */
export type CharacterRecentReportsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  page?: InputMaybe<Scalars['Int']['input']>;
};


/** A player character. Characters can earn individual rankings and appear in reports. */
export type CharacterZoneRankingsArgs = {
  byBracket?: InputMaybe<Scalars['Boolean']['input']>;
  className?: InputMaybe<Scalars['String']['input']>;
  compare?: InputMaybe<RankingCompareType>;
  difficulty?: InputMaybe<Scalars['Int']['input']>;
  includePrivateLogs?: InputMaybe<Scalars['Boolean']['input']>;
  metric?: InputMaybe<CharacterRankingMetricType>;
  partition?: InputMaybe<Scalars['Int']['input']>;
  role?: InputMaybe<RoleType>;
  size?: InputMaybe<Scalars['Int']['input']>;
  specName?: InputMaybe<Scalars['String']['input']>;
  timeframe?: InputMaybe<RankingTimeframeType>;
  zoneID?: InputMaybe<Scalars['Int']['input']>;
};

/** The CharacterData object enables the retrieval of single characters or filtered collections of characters. */
export type CharacterData = {
  readonly __typename?: 'CharacterData';
  /** Obtain a specific character either by id or by name/server_slug/server_region. */
  readonly character?: Maybe<Character>;
  /** A collection of characters for a specific guild. */
  readonly characters?: Maybe<CharacterPagination>;
};


/** The CharacterData object enables the retrieval of single characters or filtered collections of characters. */
export type CharacterDataCharacterArgs = {
  id?: InputMaybe<Scalars['Int']['input']>;
  lodestoneID?: InputMaybe<Scalars['Int']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  serverRegion?: InputMaybe<Scalars['String']['input']>;
  serverSlug?: InputMaybe<Scalars['String']['input']>;
};


/** The CharacterData object enables the retrieval of single characters or filtered collections of characters. */
export type CharacterDataCharactersArgs = {
  guildID?: InputMaybe<Scalars['Int']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  page?: InputMaybe<Scalars['Int']['input']>;
};

export type CharacterPagination = {
  readonly __typename?: 'CharacterPagination';
  /** Current page of the cursor */
  readonly current_page: Scalars['Int']['output'];
  /** List of items on the current page */
  readonly data?: Maybe<ReadonlyArray<Maybe<Character>>>;
  /** Number of the first item returned */
  readonly from?: Maybe<Scalars['Int']['output']>;
  /** Determines if cursor has more pages after the current page */
  readonly has_more_pages: Scalars['Boolean']['output'];
  /** The last page (number of pages) */
  readonly last_page: Scalars['Int']['output'];
  /** Number of items returned per page */
  readonly per_page: Scalars['Int']['output'];
  /** Number of the last item returned */
  readonly to?: Maybe<Scalars['Int']['output']>;
  /** Number of total items selected by the query */
  readonly total: Scalars['Int']['output'];
};

/** All the possible metrics. */
export const CharacterRankingMetricType = {
  /** Boss cDPS is unique to FFXIV and is damage done to the boss adjusted for raid-contributing buffs and debuffs. */
  Bosscdps: 'bosscdps',
  /** Boss damage per second. */
  Bossdps: 'bossdps',
  /** Boss nDPS is unique to FFXIV and is damage done to the boss adjusted for raid-contributing buffs and debuffs. */
  Bossndps: 'bossndps',
  /** Boss rDPS is unique to FFXIV and is damage done to the boss adjusted for raid-contributing buffs and debuffs. */
  Bossrdps: 'bossrdps',
  /** cDPS is unique to FFXIV and is damage done adjusted for raid-contributing buffs and debuffs. */
  Cdps: 'cdps',
  /** Choose an appropriate default depending on the other selected parameters. */
  Default: 'default',
  /** Damage per second. */
  Dps: 'dps',
  /** Unique to FFXIV. Represents the combined ranking for a pair of healers in eight player content. */
  Healercombinedbosscdps: 'healercombinedbosscdps',
  /** Unique to FFXIV. Represents the combined ranking for a pair of healers in eight player content. */
  Healercombinedbossdps: 'healercombinedbossdps',
  /** Unique to FFXIV. Represents the combined ranking for a pair of healers in eight player content. */
  Healercombinedbossndps: 'healercombinedbossndps',
  /** Unique to FFXIV. Represents the combined ranking for a pair of healers in eight player content. */
  Healercombinedbossrdps: 'healercombinedbossrdps',
  /** Unique to FFXIV. Represents the combined ranking for a pair of healers in eight player content. */
  Healercombinedcdps: 'healercombinedcdps',
  /** Unique to FFXIV. Represents the combined ranking for a pair of healers in eight player content. */
  Healercombineddps: 'healercombineddps',
  /** Unique to FFXIV. Represents the combined ranking for a pair of healers in eight player content. */
  Healercombinedndps: 'healercombinedndps',
  /** Unique to FFXIV. Represents the combined ranking for a pair of healers in eight player content. */
  Healercombinedrdps: 'healercombinedrdps',
  /** Healing per second. */
  Hps: 'hps',
  /** Survivability ranking for tanks. Deprecated. Only supported for some older WoW zones. */
  Krsi: 'krsi',
  /** nDPS is unique to FFXIV and is damage done adjusted for raid-contributing buffs and debuffs. */
  Ndps: 'ndps',
  /** Score. Used by WoW Mythic dungeons and by ESO trials. */
  Playerscore: 'playerscore',
  /** Speed. Not supported by every zone. */
  Playerspeed: 'playerspeed',
  /** rDPS is unique to FFXIV and is damage done adjusted for raid-contributing buffs and debuffs. */
  Rdps: 'rdps',
  /** Unique to FFXIV. Represents the combined ranking for a pair of tanks in eight player content. */
  Tankcombinedbosscdps: 'tankcombinedbosscdps',
  /** Unique to FFXIV. Represents the combined ranking for a pair of tanks in eight player content. */
  Tankcombinedbossdps: 'tankcombinedbossdps',
  /** Unique to FFXIV. Represents the combined ranking for a pair of tanks in eight player content. */
  Tankcombinedbossndps: 'tankcombinedbossndps',
  /** Unique to FFXIV. Represents the combined ranking for a pair of tanks in eight player content. */
  Tankcombinedbossrdps: 'tankcombinedbossrdps',
  /** Unique to FFXIV. Represents the combined ranking for a pair of tanks in eight player content. */
  Tankcombinedcdps: 'tankcombinedcdps',
  /** Unique to FFXIV. Represents the combined ranking for a pair of tanks in eight player content. */
  Tankcombineddps: 'tankcombineddps',
  /** Unique to FFXIV. Represents the combined ranking for a pair of tanks in eight player content. */
  Tankcombinedndps: 'tankcombinedndps',
  /** Unique to FFXIV. Represents the combined ranking for a pair of tanks in eight player content. */
  Tankcombinedrdps: 'tankcombinedrdps',
  /** Healing done per second to tanks. */
  Tankhps: 'tankhps',
  /** Weighted damage per second. Unique to WoW currently. Used to remove pad damage and reward damage done to high priority targets. */
  Wdps: 'wdps'
} as const;

export type CharacterRankingMetricType = typeof CharacterRankingMetricType[keyof typeof CharacterRankingMetricType];
/** A single difficulty for a given raid zone. Difficulties have an integer value representing the actual difficulty, a localized name that describes the difficulty level, and a list of valid sizes for the difficulty level. */
export type Difficulty = {
  readonly __typename?: 'Difficulty';
  /** An integer representing a specific difficulty level within a zone. For example, in World of Warcraft, this could be Mythic. In FF, it could be Savage, etc. */
  readonly id: Scalars['Int']['output'];
  /** The localized name for the difficulty level. */
  readonly name: Scalars['String']['output'];
  /** A list of supported sizes for the difficulty level. An empty result means that the difficulty level has a flexible raid size. */
  readonly sizes?: Maybe<ReadonlyArray<Maybe<Scalars['Int']['output']>>>;
};

/** A single encounter for the game. */
export type Encounter = {
  readonly __typename?: 'Encounter';
  /** Player rankings information for a zone. This data is not considered frozen, and it can change without notice. Use at your own risk. */
  readonly characterRankings?: Maybe<Scalars['JSON']['output']>;
  /** Fight rankings information for a zone. This data is not considered frozen, and it can change without notice. Use at your own risk. */
  readonly fightRankings?: Maybe<Scalars['JSON']['output']>;
  /** The ID of the encounter. */
  readonly id: Scalars['Int']['output'];
  /** The localized name of the encounter. */
  readonly name: Scalars['String']['output'];
  /** The zone that this encounter is found in. */
  readonly zone: Zone;
};


/** A single encounter for the game. */
export type EncounterCharacterRankingsArgs = {
  bracket?: InputMaybe<Scalars['Int']['input']>;
  className?: InputMaybe<Scalars['String']['input']>;
  difficulty?: InputMaybe<Scalars['Int']['input']>;
  externalBuffs?: InputMaybe<ExternalBuffRankFilter>;
  filter?: InputMaybe<Scalars['String']['input']>;
  hardModeLevel?: InputMaybe<HardModeLevelRankFilter>;
  includeCombatantInfo?: InputMaybe<Scalars['Boolean']['input']>;
  leaderboard?: InputMaybe<LeaderboardRank>;
  metric?: InputMaybe<CharacterRankingMetricType>;
  page?: InputMaybe<Scalars['Int']['input']>;
  partition?: InputMaybe<Scalars['Int']['input']>;
  serverRegion?: InputMaybe<Scalars['String']['input']>;
  serverSlug?: InputMaybe<Scalars['String']['input']>;
  size?: InputMaybe<Scalars['Int']['input']>;
  specName?: InputMaybe<Scalars['String']['input']>;
};


/** A single encounter for the game. */
export type EncounterFightRankingsArgs = {
  bracket?: InputMaybe<Scalars['Int']['input']>;
  difficulty?: InputMaybe<Scalars['Int']['input']>;
  filter?: InputMaybe<Scalars['String']['input']>;
  hardModeLevel?: InputMaybe<HardModeLevelRankFilter>;
  leaderboard?: InputMaybe<LeaderboardRank>;
  metric?: InputMaybe<FightRankingMetricType>;
  page?: InputMaybe<Scalars['Int']['input']>;
  partition?: InputMaybe<Scalars['Int']['input']>;
  serverRegion?: InputMaybe<Scalars['String']['input']>;
  serverSlug?: InputMaybe<Scalars['String']['input']>;
  size?: InputMaybe<Scalars['Int']['input']>;
};

export type EncounterPhases = {
  readonly __typename?: 'EncounterPhases';
  readonly encounterID: Scalars['Int']['output'];
  /** Phase metadata for all phases in this encounter. */
  readonly phases?: Maybe<ReadonlyArray<PhaseMetadata>>;
  /** Whether the phases can be used to separate wipes in the report UI. */
  readonly separatesWipes?: Maybe<Scalars['Boolean']['output']>;
};

/** The type of events or tables to examine. */
export const EventDataType = {
  /** All Events */
  All: 'All',
  /** Buffs. */
  Buffs: 'Buffs',
  /** Casts. */
  Casts: 'Casts',
  /** Combatant info events (includes gear). */
  CombatantInfo: 'CombatantInfo',
  /** Damage done. */
  DamageDone: 'DamageDone',
  /** Damage taken. */
  DamageTaken: 'DamageTaken',
  /** Deaths. */
  Deaths: 'Deaths',
  /** Debuffs. */
  Debuffs: 'Debuffs',
  /** Dispels. */
  Dispels: 'Dispels',
  /** Healing done. */
  Healing: 'Healing',
  /** Interrupts. */
  Interrupts: 'Interrupts',
  /** Resources. */
  Resources: 'Resources',
  /** Summons */
  Summons: 'Summons',
  /** Threat. */
  Threat: 'Threat'
} as const;

export type EventDataType = typeof EventDataType[keyof typeof EventDataType];
/** A single expansion for the game. */
export type Expansion = {
  readonly __typename?: 'Expansion';
  /** The ID of the expansion. */
  readonly id: Scalars['Int']['output'];
  /** The localized name of the expansion. */
  readonly name: Scalars['String']['output'];
  /** The zones (e.g., raids and dungeons) supported for this expansion. */
  readonly zones?: Maybe<ReadonlyArray<Maybe<Zone>>>;
};

/** Whether to include ranks with major external buffs. Not all metrics, zones and games support this. It will be ignored if unsupported. */
export const ExternalBuffRankFilter = {
  /** Include all ranks, regardless of external buffs. */
  Any: 'Any',
  /** Only include ranks that DO NOT CONTAIN external buffs. */
  Exclude: 'Exclude',
  /** Only include ranks that DO CONTAIN external buffs. */
  Require: 'Require'
} as const;

export type ExternalBuffRankFilter = typeof ExternalBuffRankFilter[keyof typeof ExternalBuffRankFilter];
/** All the possible metrics. */
export const FightRankingMetricType = {
  /** Choose an appropriate default depending on the other selected parameters. */
  Default: 'default',
  /** A metric that rewards minimizing deaths and damage taken. */
  Execution: 'execution',
  /** Feats of strength in WoW or Challenges in FF. */
  Feats: 'feats',
  /** Progress metric, based off when the fight was defeated. */
  Progress: 'progress',
  /** For Mythic+ dungeons in WoW, represents the team's score. Used for ESO trials and dungeons also. */
  Score: 'score',
  /** Speed metric, based off the duration of the fight. */
  Speed: 'speed'
} as const;

export type FightRankingMetricType = typeof FightRankingMetricType[keyof typeof FightRankingMetricType];
/** A single ability for the game. */
export type GameAbility = {
  readonly __typename?: 'GameAbility';
  /** A description for the ability if it is available. */
  readonly description?: Maybe<Scalars['String']['output']>;
  /** The icon for the ability. */
  readonly icon?: Maybe<Scalars['String']['output']>;
  /** The ID of the ability. */
  readonly id: Scalars['Int']['output'];
  /** The localized name of the ability. Will be null if no localization information exists for the ability. */
  readonly name?: Maybe<Scalars['String']['output']>;
};

export type GameAbilityPagination = {
  readonly __typename?: 'GameAbilityPagination';
  /** Current page of the cursor */
  readonly current_page: Scalars['Int']['output'];
  /** List of items on the current page */
  readonly data?: Maybe<ReadonlyArray<Maybe<GameAbility>>>;
  /** Number of the first item returned */
  readonly from?: Maybe<Scalars['Int']['output']>;
  /** Determines if cursor has more pages after the current page */
  readonly has_more_pages: Scalars['Boolean']['output'];
  /** The last page (number of pages) */
  readonly last_page: Scalars['Int']['output'];
  /** Number of items returned per page */
  readonly per_page: Scalars['Int']['output'];
  /** Number of the last item returned */
  readonly to?: Maybe<Scalars['Int']['output']>;
  /** Number of total items selected by the query */
  readonly total: Scalars['Int']['output'];
};

/** A single achievement for the game. */
export type GameAchievement = {
  readonly __typename?: 'GameAchievement';
  /** The icon for the achievement. */
  readonly icon?: Maybe<Scalars['String']['output']>;
  /** The ID of the achievement. */
  readonly id: Scalars['Int']['output'];
  /** The localized name of the achievement. Will be null if no localization information exists for the achievement. */
  readonly name?: Maybe<Scalars['String']['output']>;
};

/** A single affix for Mythic Keystone dungeons. */
export type GameAffix = {
  readonly __typename?: 'GameAffix';
  /** The icon for the affix. */
  readonly icon?: Maybe<Scalars['String']['output']>;
  /** The ID of the affix. */
  readonly id: Scalars['Int']['output'];
  /** The localized name of the affix. Will be null if no localization information exists for the affix. */
  readonly name?: Maybe<Scalars['String']['output']>;
};

/** A single player class for the game. */
export type GameClass = {
  readonly __typename?: 'GameClass';
  /** An integer used to identify the class. */
  readonly id: Scalars['Int']['output'];
  /** The localized name of the class. */
  readonly name: Scalars['String']['output'];
  /** A slug used to identify the class. */
  readonly slug: Scalars['String']['output'];
  /** The specs supported by the class. */
  readonly specs?: Maybe<ReadonlyArray<Maybe<GameSpec>>>;
};

/** The game object contains collections of data such as NPCs, classes, abilities, items, maps, etc. Game data only changes when major game patches are released, so you should cache results for as long as possible and only update when new content is released for the game. */
export type GameData = {
  readonly __typename?: 'GameData';
  /** The player and enemy abilities for the game. */
  readonly abilities?: Maybe<GameAbilityPagination>;
  /** Obtain a single ability for the game. */
  readonly ability?: Maybe<GameAbility>;
  /** Obtain a single class for the game. */
  readonly class?: Maybe<GameClass>;
  /** Obtain the supported classes for the game. */
  readonly classes?: Maybe<ReadonlyArray<Maybe<GameClass>>>;
  /** Obtain all the factions that guilds and players can belong to. */
  readonly factions?: Maybe<ReadonlyArray<Maybe<GameFaction>>>;
  /** Obtain a single item for the game. */
  readonly item?: Maybe<GameItem>;
  /** Items for the game. */
  readonly items?: Maybe<GameItemPagination>;
  /** Obtain a single map for the game. */
  readonly map?: Maybe<GameMap>;
  /** Maps for the game. */
  readonly maps?: Maybe<GameMapPagination>;
};


/** The game object contains collections of data such as NPCs, classes, abilities, items, maps, etc. Game data only changes when major game patches are released, so you should cache results for as long as possible and only update when new content is released for the game. */
export type GameDataAbilitiesArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  page?: InputMaybe<Scalars['Int']['input']>;
};


/** The game object contains collections of data such as NPCs, classes, abilities, items, maps, etc. Game data only changes when major game patches are released, so you should cache results for as long as possible and only update when new content is released for the game. */
export type GameDataAbilityArgs = {
  id?: InputMaybe<Scalars['Int']['input']>;
};


/** The game object contains collections of data such as NPCs, classes, abilities, items, maps, etc. Game data only changes when major game patches are released, so you should cache results for as long as possible and only update when new content is released for the game. */
export type GameDataClassArgs = {
  faction_id?: InputMaybe<Scalars['Int']['input']>;
  id?: InputMaybe<Scalars['Int']['input']>;
  zone_id?: InputMaybe<Scalars['Int']['input']>;
};


/** The game object contains collections of data such as NPCs, classes, abilities, items, maps, etc. Game data only changes when major game patches are released, so you should cache results for as long as possible and only update when new content is released for the game. */
export type GameDataClassesArgs = {
  faction_id?: InputMaybe<Scalars['Int']['input']>;
  zone_id?: InputMaybe<Scalars['Int']['input']>;
};


/** The game object contains collections of data such as NPCs, classes, abilities, items, maps, etc. Game data only changes when major game patches are released, so you should cache results for as long as possible and only update when new content is released for the game. */
export type GameDataItemArgs = {
  id?: InputMaybe<Scalars['Int']['input']>;
};


/** The game object contains collections of data such as NPCs, classes, abilities, items, maps, etc. Game data only changes when major game patches are released, so you should cache results for as long as possible and only update when new content is released for the game. */
export type GameDataItemsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  page?: InputMaybe<Scalars['Int']['input']>;
};


/** The game object contains collections of data such as NPCs, classes, abilities, items, maps, etc. Game data only changes when major game patches are released, so you should cache results for as long as possible and only update when new content is released for the game. */
export type GameDataMapArgs = {
  id?: InputMaybe<Scalars['Int']['input']>;
};


/** The game object contains collections of data such as NPCs, classes, abilities, items, maps, etc. Game data only changes when major game patches are released, so you should cache results for as long as possible and only update when new content is released for the game. */
export type GameDataMapsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  page?: InputMaybe<Scalars['Int']['input']>;
};

/** A single enchant for the game. */
export type GameEnchant = {
  readonly __typename?: 'GameEnchant';
  /** The ID of the enchant. */
  readonly id: Scalars['Int']['output'];
  /** The localized name of the enchant. Will be null if no localization information exists for the enchant. */
  readonly name?: Maybe<Scalars['String']['output']>;
};

/** A faction that a player or guild can belong to. Factions have an integer id used to identify them throughout the API and a localized name describing the faction. */
export type GameFaction = {
  readonly __typename?: 'GameFaction';
  /** An integer representing the faction id. */
  readonly id: Scalars['Int']['output'];
  /** The localized name of the faction. */
  readonly name: Scalars['String']['output'];
};

/** A single item for the game. */
export type GameItem = {
  readonly __typename?: 'GameItem';
  /** The icon for the item. */
  readonly icon?: Maybe<Scalars['String']['output']>;
  /** The ID of the item. */
  readonly id: Scalars['Int']['output'];
  /** The localized name of the item. Will be null if no localization information exists for the item. */
  readonly name?: Maybe<Scalars['String']['output']>;
};

export type GameItemPagination = {
  readonly __typename?: 'GameItemPagination';
  /** Current page of the cursor */
  readonly current_page: Scalars['Int']['output'];
  /** List of items on the current page */
  readonly data?: Maybe<ReadonlyArray<Maybe<GameItem>>>;
  /** Number of the first item returned */
  readonly from?: Maybe<Scalars['Int']['output']>;
  /** Determines if cursor has more pages after the current page */
  readonly has_more_pages: Scalars['Boolean']['output'];
  /** The last page (number of pages) */
  readonly last_page: Scalars['Int']['output'];
  /** Number of items returned per page */
  readonly per_page: Scalars['Int']['output'];
  /** Number of the last item returned */
  readonly to?: Maybe<Scalars['Int']['output']>;
  /** Number of total items selected by the query */
  readonly total: Scalars['Int']['output'];
};

/** A single item set for the game. */
export type GameItemSet = {
  readonly __typename?: 'GameItemSet';
  /** The ID of the item set. */
  readonly id: Scalars['Int']['output'];
  /** The localized name of the item set. Will be null if no localization information exists for the item set. */
  readonly name?: Maybe<Scalars['String']['output']>;
};

/** A single map for the game. */
export type GameMap = {
  readonly __typename?: 'GameMap';
  /** The image for the map. Will be null if no file information exists for the map. */
  readonly filename?: Maybe<Scalars['String']['output']>;
  /** The ID of the map. */
  readonly id: Scalars['Int']['output'];
  /** The localized name of the map. Will be null if no localization information exists for the map. */
  readonly name?: Maybe<Scalars['String']['output']>;
  /** The x offset for the map. */
  readonly offsetX?: Maybe<Scalars['Int']['output']>;
  /** The y offset for the map. */
  readonly offsetY?: Maybe<Scalars['Int']['output']>;
  /** The scale factor for the map. */
  readonly sizeFactor?: Maybe<Scalars['Int']['output']>;
};

export type GameMapPagination = {
  readonly __typename?: 'GameMapPagination';
  /** Current page of the cursor */
  readonly current_page: Scalars['Int']['output'];
  /** List of items on the current page */
  readonly data?: Maybe<ReadonlyArray<Maybe<GameMap>>>;
  /** Number of the first item returned */
  readonly from?: Maybe<Scalars['Int']['output']>;
  /** Determines if cursor has more pages after the current page */
  readonly has_more_pages: Scalars['Boolean']['output'];
  /** The last page (number of pages) */
  readonly last_page: Scalars['Int']['output'];
  /** Number of items returned per page */
  readonly per_page: Scalars['Int']['output'];
  /** Number of the last item returned */
  readonly to?: Maybe<Scalars['Int']['output']>;
  /** Number of total items selected by the query */
  readonly total: Scalars['Int']['output'];
};

/** A single NPC for the game. */
export type GameNpc = {
  readonly __typename?: 'GameNPC';
  /** The ID of the NPC. */
  readonly id: Scalars['Int']['output'];
  /** The localized name of the NPC. Will be null if no localization information exists for the NPC. */
  readonly name?: Maybe<Scalars['String']['output']>;
};

/** A spec for a given player class. */
export type GameSpec = {
  readonly __typename?: 'GameSpec';
  /** The player class that the spec belongs to. */
  readonly class?: Maybe<GameClass>;
  /** An integer used to identify the spec. */
  readonly id: Scalars['Int']['output'];
  /** The localized name of the class. */
  readonly name: Scalars['String']['output'];
  /** A slug used to identify the spec. */
  readonly slug: Scalars['String']['output'];
};

/** A single zone for the game. */
export type GameZone = {
  readonly __typename?: 'GameZone';
  /** The ID of the zone. */
  readonly id: Scalars['Float']['output'];
  /** The localized name of the zone. Will be null if no localization information exists for the zone. */
  readonly name?: Maybe<Scalars['String']['output']>;
};

/** The type of graph to examine. */
export const GraphDataType = {
  /** Buffs. */
  Buffs: 'Buffs',
  /** Casts. */
  Casts: 'Casts',
  /** Damage done. */
  DamageDone: 'DamageDone',
  /** Damage taken. */
  DamageTaken: 'DamageTaken',
  /** Deaths. */
  Deaths: 'Deaths',
  /** Debuffs. */
  Debuffs: 'Debuffs',
  /** Dispels. */
  Dispels: 'Dispels',
  /** Healing done. */
  Healing: 'Healing',
  /** Interrupts. */
  Interrupts: 'Interrupts',
  /** Resources. */
  Resources: 'Resources',
  /** Summary Overview */
  Summary: 'Summary',
  /** Summons */
  Summons: 'Summons',
  /** Survivability (death info across multiple pulls). */
  Survivability: 'Survivability',
  /** Threat. */
  Threat: 'Threat'
} as const;

export type GraphDataType = typeof GraphDataType[keyof typeof GraphDataType];
/** A single guild. Guilds earn their own rankings and contain characters. They may correspond to a guild in-game or be a custom guild created just to hold reports and rankings. */
export type Guild = {
  readonly __typename?: 'Guild';
  readonly attendance: GuildAttendancePagination;
  /** Whether or not the guild has competition mode enabled. */
  readonly competitionMode: Scalars['Boolean']['output'];
  /** The current user's rank within the guild. Only accessible via user authentication with the "view-user-profile" scope. */
  readonly currentUserRank?: Maybe<GuildRank>;
  /** The description for the guild that is displayed with the guild name on the site. */
  readonly description: Scalars['String']['output'];
  /** The faction of the guild. */
  readonly faction: GameFaction;
  /** The ID of the guild. */
  readonly id: Scalars['Int']['output'];
  /** The member roster for a specific guild. The result of this query is a paginated list of characters. This query only works for games where the guild roster is verifiable, e.g., it does not work for Classic Warcraft. */
  readonly members: CharacterPagination;
  /** The name of the guild. */
  readonly name: Scalars['String']['output'];
  /** The server that the guild belongs to. */
  readonly server: Server;
  /** Whether or not the guild has stealth mode enabled. */
  readonly stealthMode: Scalars['Boolean']['output'];
  /** The tags used to label reports. In the site UI, these are called raid teams. */
  readonly tags?: Maybe<ReadonlyArray<Maybe<GuildTag>>>;
  /** The type of the guild. A value of 0 means the guild is a Free Company. A value of 1 indicates that the guild is a Static. */
  readonly type: Scalars['String']['output'];
  /** The guild's ranking for a zone. If `zoneId` is unset or null, uses the latest zone. */
  readonly zoneRanking: GuildZoneRankings;
};


/** A single guild. Guilds earn their own rankings and contain characters. They may correspond to a guild in-game or be a custom guild created just to hold reports and rankings. */
export type GuildAttendanceArgs = {
  guildTagID?: InputMaybe<Scalars['Int']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  page?: InputMaybe<Scalars['Int']['input']>;
  zoneID?: InputMaybe<Scalars['Int']['input']>;
};


/** A single guild. Guilds earn their own rankings and contain characters. They may correspond to a guild in-game or be a custom guild created just to hold reports and rankings. */
export type GuildMembersArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  page?: InputMaybe<Scalars['Int']['input']>;
};


/** A single guild. Guilds earn their own rankings and contain characters. They may correspond to a guild in-game or be a custom guild created just to hold reports and rankings. */
export type GuildZoneRankingArgs = {
  zoneId?: InputMaybe<Scalars['Int']['input']>;
};

/** Attendance for a specific report within a guild. */
export type GuildAttendance = {
  readonly __typename?: 'GuildAttendance';
  /** The code of the report for the raid night. */
  readonly code: Scalars['String']['output'];
  /** The players that attended that raid night. */
  readonly players?: Maybe<ReadonlyArray<Maybe<PlayerAttendance>>>;
  /** The start time of the raid night. */
  readonly startTime?: Maybe<Scalars['Float']['output']>;
  /** The principal zone of the raid night. */
  readonly zone?: Maybe<Zone>;
};

export type GuildAttendancePagination = {
  readonly __typename?: 'GuildAttendancePagination';
  /** Current page of the cursor */
  readonly current_page: Scalars['Int']['output'];
  /** List of items on the current page */
  readonly data?: Maybe<ReadonlyArray<Maybe<GuildAttendance>>>;
  /** Number of the first item returned */
  readonly from?: Maybe<Scalars['Int']['output']>;
  /** Determines if cursor has more pages after the current page */
  readonly has_more_pages: Scalars['Boolean']['output'];
  /** The last page (number of pages) */
  readonly last_page: Scalars['Int']['output'];
  /** Number of items returned per page */
  readonly per_page: Scalars['Int']['output'];
  /** Number of the last item returned */
  readonly to?: Maybe<Scalars['Int']['output']>;
  /** Number of total items selected by the query */
  readonly total: Scalars['Int']['output'];
};

/** The GuildData object enables the retrieval of single guilds or filtered collections of guilds. */
export type GuildData = {
  readonly __typename?: 'GuildData';
  /** Obtain a specific guild either by id or by name/serverSlug/serverRegion. */
  readonly guild?: Maybe<Guild>;
  /** The set of all guilds supported by the site. Can be optionally filtered to a specific server id. */
  readonly guilds?: Maybe<GuildPagination>;
};


/** The GuildData object enables the retrieval of single guilds or filtered collections of guilds. */
export type GuildDataGuildArgs = {
  id?: InputMaybe<Scalars['Int']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  serverRegion?: InputMaybe<Scalars['String']['input']>;
  serverSlug?: InputMaybe<Scalars['String']['input']>;
};


/** The GuildData object enables the retrieval of single guilds or filtered collections of guilds. */
export type GuildDataGuildsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  page?: InputMaybe<Scalars['Int']['input']>;
  serverID?: InputMaybe<Scalars['Int']['input']>;
  serverRegion?: InputMaybe<Scalars['String']['input']>;
  serverSlug?: InputMaybe<Scalars['String']['input']>;
};

export type GuildPagination = {
  readonly __typename?: 'GuildPagination';
  /** Current page of the cursor */
  readonly current_page: Scalars['Int']['output'];
  /** List of items on the current page */
  readonly data?: Maybe<ReadonlyArray<Maybe<Guild>>>;
  /** Number of the first item returned */
  readonly from?: Maybe<Scalars['Int']['output']>;
  /** Determines if cursor has more pages after the current page */
  readonly has_more_pages: Scalars['Boolean']['output'];
  /** The last page (number of pages) */
  readonly last_page: Scalars['Int']['output'];
  /** Number of items returned per page */
  readonly per_page: Scalars['Int']['output'];
  /** Number of the last item returned */
  readonly to?: Maybe<Scalars['Int']['output']>;
  /** Number of total items selected by the query */
  readonly total: Scalars['Int']['output'];
};

/** Rank within a guild or team on the website. This is separate from in-game ranks and does NOT correspond to the rank of the user or character in-game. */
export const GuildRank = {
  Applicant: 'Applicant',
  GuildMaster: 'GuildMaster',
  Member: 'Member',
  /** The user is not a member of this guild or team. */
  NonMember: 'NonMember',
  Officer: 'Officer',
  Recruit: 'Recruit'
} as const;

export type GuildRank = typeof GuildRank[keyof typeof GuildRank];
/** The tag for a specific guild. Tags can be used to categorize reports within a guild. In the site UI, they are referred to as report tags. */
export type GuildTag = {
  readonly __typename?: 'GuildTag';
  /** The guild that the tag belongs to. */
  readonly guild: Guild;
  /** The ID of the tag. */
  readonly id: Scalars['Int']['output'];
  /** The name of the tag. */
  readonly name: Scalars['String']['output'];
};

/** A guild's rankings within a zone. */
export type GuildZoneRankings = {
  readonly __typename?: 'GuildZoneRankings';
  /** The complete raid speed ranks for the guild. Most non-Classic WoW zones do not support complete raid ranks. */
  readonly completeRaidSpeed?: Maybe<WorldRegionServerRankPositions>;
  /** The progress ranks for the guild. Always uses the highest difficulty. */
  readonly progress?: Maybe<WorldRegionServerRankPositions>;
  /** The all-star based speed rank for the guild. */
  readonly speed?: Maybe<WorldRegionServerRankPositions>;
};


/** A guild's rankings within a zone. */
export type GuildZoneRankingsCompleteRaidSpeedArgs = {
  difficulty?: InputMaybe<Scalars['Int']['input']>;
  size?: InputMaybe<Scalars['Int']['input']>;
};


/** A guild's rankings within a zone. */
export type GuildZoneRankingsProgressArgs = {
  size?: InputMaybe<Scalars['Int']['input']>;
};


/** A guild's rankings within a zone. */
export type GuildZoneRankingsSpeedArgs = {
  difficulty?: InputMaybe<Scalars['Int']['input']>;
  size?: InputMaybe<Scalars['Int']['input']>;
};

/** Hard mode level filter. Used for WoW Classic Hard Modes. For ESO hard modes, use `difficulty`. Hard mode levels range from 0-4, with 0 being normal mode and 4 being the highest hard mode. */
export const HardModeLevelRankFilter = {
  /** Any hard mode level (including normal mode). */
  Any: 'Any',
  /** The highest hard mode level. Convenience alias for hard mode level 4. */
  Highest: 'Highest',
  /** Hard mode level 0. */
  Level0: 'Level0',
  /** Hard mode level 1. */
  Level1: 'Level1',
  /** Hard mode level 2. */
  Level2: 'Level2',
  /** Hard mode level 3. */
  Level3: 'Level3',
  /** Hard mode level 4. */
  Level4: 'Level4',
  /** The normal (non-hard) mode level. Convenience alias for hard mode level 0. */
  NormalMode: 'NormalMode'
} as const;

export type HardModeLevelRankFilter = typeof HardModeLevelRankFilter[keyof typeof HardModeLevelRankFilter];
/** Whether or not to fetch information for friendlies or enemies. */
export const HostilityType = {
  /** Fetch information for enemies. */
  Enemies: 'Enemies',
  /** Fetch information for friendlies. */
  Friendlies: 'Friendlies'
} as const;

export type HostilityType = typeof HostilityType[keyof typeof HostilityType];
/** A filter for kills vs wipes and encounters vs trash. */
export const KillType = {
  /** Include trash and encounters. */
  All: 'All',
  /** Only include encounters (kills and wipes). */
  Encounters: 'Encounters',
  /** Only include encounters that end in a kill. */
  Kills: 'Kills',
  /** Only include trash. */
  Trash: 'Trash',
  /** Only include encounters that end in a wipe. */
  Wipes: 'Wipes'
} as const;

export type KillType = typeof KillType[keyof typeof KillType];
/** Source of the rank. Most ranks only support log ranks, but some games (ESO) and content types (Retail WoW M+) support leaderboard ranks with no backing log. */
export const LeaderboardRank = {
  /** All ranks are included. */
  Any: 'Any',
  /** Only include ranks with a backing log. */
  LogsOnly: 'LogsOnly'
} as const;

export type LeaderboardRank = typeof LeaderboardRank[keyof typeof LeaderboardRank];
/** A single partition for a given raid zone. Partitions have an integer value representing the actual partition and a localized name that describes what the partition represents. Partitions contain their own rankings, statistics and all stars. */
export type Partition = {
  readonly __typename?: 'Partition';
  /** The compact localized name for the partition. Typically an abbreviation to conserve space. */
  readonly compactName: Scalars['String']['output'];
  /** Whether or not the partition is the current default when viewing rankings or statistics for the zone. */
  readonly default: Scalars['Boolean']['output'];
  /** An integer representing a specific partition within a zone. */
  readonly id: Scalars['Int']['output'];
  /** The localized name for partition. */
  readonly name: Scalars['String']['output'];
};

/** Information about a phase from a boss encounter. */
export type PhaseMetadata = {
  readonly __typename?: 'PhaseMetadata';
  /** Phase ID. 1-indexed */
  readonly id: Scalars['Int']['output'];
  /** Whether this phase represents an intermission. */
  readonly isIntermission?: Maybe<Scalars['Boolean']['output']>;
  readonly name: Scalars['String']['output'];
};

/** A spartan representation of phase transitions during a fight. */
export type PhaseTransition = {
  readonly __typename?: 'PhaseTransition';
  /** The 1-indexed id of the phase. Phase IDs are absolute within a fight: phases with the same ID correspond to the same semantic phase. */
  readonly id: Scalars['Int']['output'];
  /** The report-relative timestamp of the transition into the phase. The phase ends at the beginning of the next phase, or at the end of the fight. */
  readonly startTime: Scalars['Int']['output'];
};

/** Attendance for a specific player on a specific raid night. */
export type PlayerAttendance = {
  readonly __typename?: 'PlayerAttendance';
  /** The name of the player. */
  readonly name?: Maybe<Scalars['String']['output']>;
  /** Presence info for the player. A value of 1 means the player was present. A value of 2 indicates present but on the bench. */
  readonly presence?: Maybe<Scalars['Int']['output']>;
  /** The class of the player. */
  readonly type?: Maybe<Scalars['String']['output']>;
};

/** A way to obtain data for the top guilds involved in an ongoing world first or realm first progress race. */
export type ProgressRaceData = {
  readonly __typename?: 'ProgressRaceData';
  /** Detailed composition data for a given guild and encounter. */
  readonly detailedComposition?: Maybe<Scalars['JSON']['output']>;
  /** Progress race information including best percentages, pull counts and streams for top guilds. This API is only active when there is an ongoing race. The format of this JSON may change without notice and is not considered frozen. */
  readonly progressRace?: Maybe<Scalars['JSON']['output']>;
};


/** A way to obtain data for the top guilds involved in an ongoing world first or realm first progress race. */
export type ProgressRaceDataDetailedCompositionArgs = {
  competitionID?: InputMaybe<Scalars['Int']['input']>;
  difficulty?: InputMaybe<Scalars['Int']['input']>;
  encounterID?: InputMaybe<Scalars['Int']['input']>;
  guildID?: InputMaybe<Scalars['Int']['input']>;
  guildName?: InputMaybe<Scalars['String']['input']>;
  serverRegion?: InputMaybe<Scalars['String']['input']>;
  serverSlug?: InputMaybe<Scalars['String']['input']>;
  size?: InputMaybe<Scalars['Int']['input']>;
};


/** A way to obtain data for the top guilds involved in an ongoing world first or realm first progress race. */
export type ProgressRaceDataProgressRaceArgs = {
  competitionID?: InputMaybe<Scalars['Int']['input']>;
  difficulty?: InputMaybe<Scalars['Int']['input']>;
  guildID?: InputMaybe<Scalars['Int']['input']>;
  guildName?: InputMaybe<Scalars['String']['input']>;
  serverRegion?: InputMaybe<Scalars['String']['input']>;
  serverSlug?: InputMaybe<Scalars['String']['input']>;
  serverSubregion?: InputMaybe<Scalars['String']['input']>;
  size?: InputMaybe<Scalars['Int']['input']>;
  zoneID?: InputMaybe<Scalars['Int']['input']>;
};

export type Query = {
  readonly __typename?: 'Query';
  /** Obtain the character data object that allows the retrieval of individual characters or filtered collections of characters. */
  readonly characterData?: Maybe<CharacterData>;
  /** Obtain the game data object that holds collections of static data such as abilities, achievements, classes, items, NPCs, etc.. */
  readonly gameData?: Maybe<GameData>;
  /** Obtain the guild data object that allows the retrieval of individual guilds or filtered collections of guilds. */
  readonly guildData?: Maybe<GuildData>;
  /** Obtain information about an ongoing world first or realm first race. Inactive when no race is occurring. This data only updates once every 30 seconds, so you do not need to fetch this information more often than that. */
  readonly progressRaceData?: Maybe<ProgressRaceData>;
  /** Obtain the rate limit data object to see how many points have been spent by this key. */
  readonly rateLimitData?: Maybe<RateLimitData>;
  /** Obtain the report data object that allows the retrieval of individual reports or filtered collections of reports by guild or by user. */
  readonly reportData?: Maybe<ReportData>;
  /** Obtain the user object that allows the retrieval of the authorized user's id and username. */
  readonly userData?: Maybe<UserData>;
  /** Obtain the world data object that holds collections of data such as all expansions, regions, subregions, servers, dungeon/raid zones, and encounters. */
  readonly worldData?: Maybe<WorldData>;
};

export type Rank = {
  readonly __typename?: 'Rank';
  /** The color class used by the site for this rank. */
  readonly color: Scalars['String']['output'];
  /** The ordinal rank (usually written "Rank N"). Rank 1 = highest. */
  readonly number: Scalars['Int']['output'];
  /** The percentile of the rank as an integer in [0, 100]. Always null for guild ranks. */
  readonly percentile?: Maybe<Scalars['Int']['output']>;
};

/** Whether or not rankings are compared against best scores for the entire tier or against all parses in a two week window. */
export const RankingCompareType = {
  /** Compare against all parses in a two week window. */
  Parses: 'Parses',
  /** Compare against rankings. */
  Rankings: 'Rankings'
} as const;

export type RankingCompareType = typeof RankingCompareType[keyof typeof RankingCompareType];
/** Whether or not rankings are today or historical. */
export const RankingTimeframeType = {
  /** Compare against historical rankings. */
  Historical: 'Historical',
  /** Compare against today's rankings. */
  Today: 'Today'
} as const;

export type RankingTimeframeType = typeof RankingTimeframeType[keyof typeof RankingTimeframeType];
/** A way to obtain your current rate limit usage. */
export type RateLimitData = {
  readonly __typename?: 'RateLimitData';
  /** The total amount of points this API key can spend per hour. */
  readonly limitPerHour: Scalars['Int']['output'];
  /** The number of seconds remaining until the points reset. */
  readonly pointsResetIn: Scalars['Int']['output'];
  /** The total amount of points spent during this hour. */
  readonly pointsSpentThisHour: Scalars['Float']['output'];
};

/** A single region for the game. */
export type Region = {
  readonly __typename?: 'Region';
  /** The localized compact name of the region, e.g., US for United States. */
  readonly compactName: Scalars['String']['output'];
  /** The ID of the region. */
  readonly id: Scalars['Int']['output'];
  /** The localized name of the region. */
  readonly name: Scalars['String']['output'];
  /** The servers found within this region. */
  readonly servers?: Maybe<ServerPagination>;
  /** The slug for the region, usable when looking up characters and guilds by server. */
  readonly slug: Scalars['String']['output'];
  /** The subregions found within this region. */
  readonly subregions?: Maybe<ReadonlyArray<Maybe<Subregion>>>;
};


/** A single region for the game. */
export type RegionServersArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  page?: InputMaybe<Scalars['Int']['input']>;
};

/** A single report uploaded by a player to a guild or personal logs. */
export type Report = {
  readonly __typename?: 'Report';
  /** Whether this report has been archived. Events, tables, and graphs for archived reports are inaccessible unless the retrieving user has a subscription including archive access. */
  readonly archiveStatus?: Maybe<ReportArchiveStatus>;
  /** The report code, a unique value used to identify the report. */
  readonly code: Scalars['String']['output'];
  /** The end time of the report. This is a UNIX timestamp representing the timestamp of the last event contained in the report. */
  readonly endTime: Scalars['Float']['output'];
  /** A set of paginated report events, filterable via arguments like type, source, target, ability, etc. This data is not considered frozen, and it can change without notice. Use at your own risk. */
  readonly events?: Maybe<ReportEventPaginator>;
  /** The number of exported segments in the report. This is how many segments have been processed for rankings. */
  readonly exportedSegments: Scalars['Int']['output'];
  /** A set of fights with details about participating players. */
  readonly fights?: Maybe<ReadonlyArray<Maybe<ReportFight>>>;
  /** A graph of information for a report, filterable via arguments like type, source, target, ability, etc. This data is not considered frozen, and it can change without notice. Use at your own risk. */
  readonly graph?: Maybe<Scalars['JSON']['output']>;
  /** The guild that the report belongs to. If this is null, then the report was uploaded to the user's personal logs. */
  readonly guild?: Maybe<Guild>;
  /** The guild tag that the report belongs to. If this is null, then the report was not tagged. */
  readonly guildTag?: Maybe<GuildTag>;
  /** Data from the report's master file. This includes version info, all of the players, NPCs and pets that occur in the report, and all the game abilities used in the report. */
  readonly masterData?: Maybe<ReportMasterData>;
  /** The user that uploaded the report. */
  readonly owner?: Maybe<User>;
  /** Phase information for all boss encounters observed in this report. This requires loading fight data, but does not double-charge API points if you load fights and phases. */
  readonly phases?: Maybe<ReadonlyArray<EncounterPhases>>;
  /** A table of information for the players of a report, including their specs, talents, gear, etc. This data is not considered frozen, and it can change without notice. Use at your own risk. */
  readonly playerDetails?: Maybe<Scalars['JSON']['output']>;
  /** A list of all characters that ranked on kills in the report. */
  readonly rankedCharacters?: Maybe<ReadonlyArray<Maybe<Character>>>;
  /** Rankings information for a report, filterable to specific fights, bosses, metrics, etc. This data is not considered frozen, and it can change without notice. Use at your own risk. */
  readonly rankings?: Maybe<Scalars['JSON']['output']>;
  /** The region of the report. */
  readonly region?: Maybe<Region>;
  /** The revision of the report. This number is increased when reports get re-exported. */
  readonly revision: Scalars['Int']['output'];
  /** The number of uploaded segments in the report. */
  readonly segments: Scalars['Int']['output'];
  /** The start time of the report. This is a UNIX timestamp representing the timestamp of the first event contained in the report. */
  readonly startTime: Scalars['Float']['output'];
  /** A table of information for a report, filterable via arguments like type, source, target, ability, etc. This data is not considered frozen, and it can change without notice. Use at your own risk. */
  readonly table?: Maybe<Scalars['JSON']['output']>;
  /** A title for the report. */
  readonly title: Scalars['String']['output'];
  /** The visibility level of the report. The possible values are 'public', 'private', and 'unlisted'. */
  readonly visibility: Scalars['String']['output'];
  /** The principal zone that the report contains fights for. Null if no supported zone exists. */
  readonly zone?: Maybe<Zone>;
};


/** A single report uploaded by a player to a guild or personal logs. */
export type ReportEventsArgs = {
  abilityID?: InputMaybe<Scalars['Float']['input']>;
  dataType?: InputMaybe<EventDataType>;
  death?: InputMaybe<Scalars['Int']['input']>;
  difficulty?: InputMaybe<Scalars['Int']['input']>;
  encounterID?: InputMaybe<Scalars['Int']['input']>;
  endTime?: InputMaybe<Scalars['Float']['input']>;
  fightIDs?: InputMaybe<ReadonlyArray<InputMaybe<Scalars['Int']['input']>>>;
  filterExpression?: InputMaybe<Scalars['String']['input']>;
  hostilityType?: InputMaybe<HostilityType>;
  includeResources?: InputMaybe<Scalars['Boolean']['input']>;
  killType?: InputMaybe<KillType>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  sourceAurasAbsent?: InputMaybe<Scalars['String']['input']>;
  sourceAurasPresent?: InputMaybe<Scalars['String']['input']>;
  sourceClass?: InputMaybe<Scalars['String']['input']>;
  sourceID?: InputMaybe<Scalars['Int']['input']>;
  sourceInstanceID?: InputMaybe<Scalars['Int']['input']>;
  startTime?: InputMaybe<Scalars['Float']['input']>;
  targetAurasAbsent?: InputMaybe<Scalars['String']['input']>;
  targetAurasPresent?: InputMaybe<Scalars['String']['input']>;
  targetClass?: InputMaybe<Scalars['String']['input']>;
  targetID?: InputMaybe<Scalars['Int']['input']>;
  targetInstanceID?: InputMaybe<Scalars['Int']['input']>;
  translate?: InputMaybe<Scalars['Boolean']['input']>;
  useAbilityIDs?: InputMaybe<Scalars['Boolean']['input']>;
  useActorIDs?: InputMaybe<Scalars['Boolean']['input']>;
  viewOptions?: InputMaybe<Scalars['Int']['input']>;
  wipeCutoff?: InputMaybe<Scalars['Int']['input']>;
};


/** A single report uploaded by a player to a guild or personal logs. */
export type ReportFightsArgs = {
  difficulty?: InputMaybe<Scalars['Int']['input']>;
  encounterID?: InputMaybe<Scalars['Int']['input']>;
  fightIDs?: InputMaybe<ReadonlyArray<InputMaybe<Scalars['Int']['input']>>>;
  killType?: InputMaybe<KillType>;
  translate?: InputMaybe<Scalars['Boolean']['input']>;
};


/** A single report uploaded by a player to a guild or personal logs. */
export type ReportGraphArgs = {
  abilityID?: InputMaybe<Scalars['Float']['input']>;
  dataType?: InputMaybe<GraphDataType>;
  death?: InputMaybe<Scalars['Int']['input']>;
  difficulty?: InputMaybe<Scalars['Int']['input']>;
  encounterID?: InputMaybe<Scalars['Int']['input']>;
  endTime?: InputMaybe<Scalars['Float']['input']>;
  fightIDs?: InputMaybe<ReadonlyArray<InputMaybe<Scalars['Int']['input']>>>;
  filterExpression?: InputMaybe<Scalars['String']['input']>;
  hostilityType?: InputMaybe<HostilityType>;
  killType?: InputMaybe<KillType>;
  sourceAurasAbsent?: InputMaybe<Scalars['String']['input']>;
  sourceAurasPresent?: InputMaybe<Scalars['String']['input']>;
  sourceClass?: InputMaybe<Scalars['String']['input']>;
  sourceID?: InputMaybe<Scalars['Int']['input']>;
  sourceInstanceID?: InputMaybe<Scalars['Int']['input']>;
  startTime?: InputMaybe<Scalars['Float']['input']>;
  targetAurasAbsent?: InputMaybe<Scalars['String']['input']>;
  targetAurasPresent?: InputMaybe<Scalars['String']['input']>;
  targetClass?: InputMaybe<Scalars['String']['input']>;
  targetID?: InputMaybe<Scalars['Int']['input']>;
  targetInstanceID?: InputMaybe<Scalars['Int']['input']>;
  translate?: InputMaybe<Scalars['Boolean']['input']>;
  viewBy?: InputMaybe<ViewType>;
  viewOptions?: InputMaybe<Scalars['Int']['input']>;
  wipeCutoff?: InputMaybe<Scalars['Int']['input']>;
};


/** A single report uploaded by a player to a guild or personal logs. */
export type ReportMasterDataArgs = {
  translate?: InputMaybe<Scalars['Boolean']['input']>;
};


/** A single report uploaded by a player to a guild or personal logs. */
export type ReportPlayerDetailsArgs = {
  difficulty?: InputMaybe<Scalars['Int']['input']>;
  encounterID?: InputMaybe<Scalars['Int']['input']>;
  endTime?: InputMaybe<Scalars['Float']['input']>;
  fightIDs?: InputMaybe<ReadonlyArray<InputMaybe<Scalars['Int']['input']>>>;
  includeCombatantInfo?: InputMaybe<Scalars['Boolean']['input']>;
  killType?: InputMaybe<KillType>;
  startTime?: InputMaybe<Scalars['Float']['input']>;
  translate?: InputMaybe<Scalars['Boolean']['input']>;
};


/** A single report uploaded by a player to a guild or personal logs. */
export type ReportRankingsArgs = {
  compare?: InputMaybe<RankingCompareType>;
  difficulty?: InputMaybe<Scalars['Int']['input']>;
  encounterID?: InputMaybe<Scalars['Int']['input']>;
  fightIDs?: InputMaybe<ReadonlyArray<InputMaybe<Scalars['Int']['input']>>>;
  playerMetric?: InputMaybe<ReportRankingMetricType>;
  timeframe?: InputMaybe<RankingTimeframeType>;
};


/** A single report uploaded by a player to a guild or personal logs. */
export type ReportTableArgs = {
  abilityID?: InputMaybe<Scalars['Float']['input']>;
  dataType?: InputMaybe<TableDataType>;
  death?: InputMaybe<Scalars['Int']['input']>;
  difficulty?: InputMaybe<Scalars['Int']['input']>;
  encounterID?: InputMaybe<Scalars['Int']['input']>;
  endTime?: InputMaybe<Scalars['Float']['input']>;
  fightIDs?: InputMaybe<ReadonlyArray<InputMaybe<Scalars['Int']['input']>>>;
  filterExpression?: InputMaybe<Scalars['String']['input']>;
  hostilityType?: InputMaybe<HostilityType>;
  killType?: InputMaybe<KillType>;
  sourceAurasAbsent?: InputMaybe<Scalars['String']['input']>;
  sourceAurasPresent?: InputMaybe<Scalars['String']['input']>;
  sourceClass?: InputMaybe<Scalars['String']['input']>;
  sourceID?: InputMaybe<Scalars['Int']['input']>;
  sourceInstanceID?: InputMaybe<Scalars['Int']['input']>;
  startTime?: InputMaybe<Scalars['Float']['input']>;
  targetAurasAbsent?: InputMaybe<Scalars['String']['input']>;
  targetAurasPresent?: InputMaybe<Scalars['String']['input']>;
  targetClass?: InputMaybe<Scalars['String']['input']>;
  targetID?: InputMaybe<Scalars['Int']['input']>;
  targetInstanceID?: InputMaybe<Scalars['Int']['input']>;
  translate?: InputMaybe<Scalars['Boolean']['input']>;
  viewBy?: InputMaybe<ViewType>;
  viewOptions?: InputMaybe<Scalars['Int']['input']>;
  wipeCutoff?: InputMaybe<Scalars['Int']['input']>;
};

/** The ReportAbility represents a single ability that occurs in the report. */
export type ReportAbility = {
  readonly __typename?: 'ReportAbility';
  /** The game ID of the ability. */
  readonly gameID?: Maybe<Scalars['Float']['output']>;
  /** An icon to use for the ability. */
  readonly icon?: Maybe<Scalars['String']['output']>;
  /** The name of the actor. */
  readonly name?: Maybe<Scalars['String']['output']>;
  /** The type of the ability. This represents the type of damage (e.g., the spell school in WoW). */
  readonly type?: Maybe<Scalars['String']['output']>;
};

/** The ReportActor represents a single player, pet or NPC that occurs in the report. */
export type ReportActor = {
  readonly __typename?: 'ReportActor';
  /** The game ID of the actor. */
  readonly gameID?: Maybe<Scalars['Float']['output']>;
  /** An icon to use for the actor. For pets and NPCs, this will be the icon the site chose to represent that actor. */
  readonly icon?: Maybe<Scalars['String']['output']>;
  /** The report ID of the actor. This ID is used in events to identify sources and targets. */
  readonly id?: Maybe<Scalars['Int']['output']>;
  /** The name of the actor. */
  readonly name?: Maybe<Scalars['String']['output']>;
  /** The report ID of the actor's owner if the actor is a pet. */
  readonly petOwner?: Maybe<Scalars['Int']['output']>;
  /** The normalized server name of the actor. */
  readonly server?: Maybe<Scalars['String']['output']>;
  /** The sub-type of the actor, for players it's their class, and for NPCs, they are further subdivided into normal NPCs and bosses. */
  readonly subType?: Maybe<Scalars['String']['output']>;
  /** The type of the actor, i.e., if it is a player, pet or NPC. */
  readonly type?: Maybe<Scalars['String']['output']>;
};

/** The archival status of a report. */
export type ReportArchiveStatus = {
  readonly __typename?: 'ReportArchiveStatus';
  /** The date on which the report was archived (if it has been archived). */
  readonly archiveDate?: Maybe<Scalars['Int']['output']>;
  /** Whether the current user can access the report. Always true if the report is not archived, and always false if not using user authentication. */
  readonly isAccessible: Scalars['Boolean']['output'];
  /** Whether the report has been archived. */
  readonly isArchived: Scalars['Boolean']['output'];
};

/** The ReportData object enables the retrieval of single reports or filtered collections of reports. */
export type ReportData = {
  readonly __typename?: 'ReportData';
  /** Obtain a specific report by its code. */
  readonly report?: Maybe<Report>;
  /** A set of reports for a specific guild, guild tag, or user. */
  readonly reports?: Maybe<ReportPagination>;
};


/** The ReportData object enables the retrieval of single reports or filtered collections of reports. */
export type ReportDataReportArgs = {
  code?: InputMaybe<Scalars['String']['input']>;
};


/** The ReportData object enables the retrieval of single reports or filtered collections of reports. */
export type ReportDataReportsArgs = {
  endTime?: InputMaybe<Scalars['Float']['input']>;
  gameZoneID?: InputMaybe<Scalars['Int']['input']>;
  guildID?: InputMaybe<Scalars['Int']['input']>;
  guildName?: InputMaybe<Scalars['String']['input']>;
  guildServerRegion?: InputMaybe<Scalars['String']['input']>;
  guildServerSlug?: InputMaybe<Scalars['String']['input']>;
  guildTagID?: InputMaybe<Scalars['Int']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  page?: InputMaybe<Scalars['Int']['input']>;
  startTime?: InputMaybe<Scalars['Float']['input']>;
  userID?: InputMaybe<Scalars['Int']['input']>;
  zoneID?: InputMaybe<Scalars['Int']['input']>;
};

/** The ReportDungeonPull represents a single pull that occurs in a containing dungeon. */
export type ReportDungeonPull = {
  readonly __typename?: 'ReportDungeonPull';
  /** The bounding box that encloses the positions of all players/enemies in the fight. */
  readonly boundingBox?: Maybe<ReportMapBoundingBox>;
  /** The encounter ID of the fight. If the ID is 0, the fight is considered a trash fight. */
  readonly encounterID: Scalars['Int']['output'];
  /** The end time of the fight. This is a timestamp with millisecond precision that is relative to the start of the report, i.e., the start of the report is considered time 0. */
  readonly endTime: Scalars['Float']['output'];
  /** Information about enemies involved in the fight. Includes report IDs, instance counts, and instance group counts for each NPC. */
  readonly enemyNPCs?: Maybe<ReadonlyArray<Maybe<ReportDungeonPullNpc>>>;
  /** The report ID of the fight. This ID can be used to fetch only events, tables or graphs for this fight. */
  readonly id: Scalars['Int']['output'];
  /** Whether or not the fight was a boss kill, i.e., successful. If this field is false, it means the fight was an incomplete run, etc.. */
  readonly kill?: Maybe<Scalars['Boolean']['output']>;
  /** All the maps that were involved in a pull. */
  readonly maps?: Maybe<ReadonlyArray<Maybe<ReportMap>>>;
  /** The name of the fight. */
  readonly name: Scalars['String']['output'];
  /** The start time of the fight. This is a timestamp with millisecond precision that is relative to the start of the report, i.e., the start of the report is considered time 0. */
  readonly startTime: Scalars['Float']['output'];
  /** The x position of the first mob damaged in the pull at the time this damage happens. Used to establish a marker position to represent where the pull took place. */
  readonly x: Scalars['Int']['output'];
  /** The y position of the first mob damaged in the pull at the time this damage happens. Used to establish a marker position to represent where the pull took place. */
  readonly y: Scalars['Int']['output'];
};

/** The ReportDungeonPullNPC represents participation info within a single dungeon pull for an NPC. */
export type ReportDungeonPullNpc = {
  readonly __typename?: 'ReportDungeonPullNPC';
  /** The game ID of the actor, e.g., so it can be looked up on external Web sites. */
  readonly gameID?: Maybe<Scalars['Int']['output']>;
  /** The report ID of the actor. This ID is used in events to identify sources and targets. */
  readonly id?: Maybe<Scalars['Int']['output']>;
  /** The highest instance group ID seen during the pull. */
  readonly maximumInstanceGroupID?: Maybe<Scalars['Int']['output']>;
  /** The highest instance ID seen during the pull. */
  readonly maximumInstanceID?: Maybe<Scalars['Int']['output']>;
  /** The lowest instance group ID seen during the pull. */
  readonly minimumInstanceGroupID?: Maybe<Scalars['Int']['output']>;
  /** The lowest instance ID seen during the pull. */
  readonly minimumInstanceID?: Maybe<Scalars['Int']['output']>;
};

/** The ReportEventPaginator represents a paginated list of report events. */
export type ReportEventPaginator = {
  readonly __typename?: 'ReportEventPaginator';
  /** The list of events obtained. */
  readonly data?: Maybe<Scalars['JSON']['output']>;
  /** A timestamp to pass in as the start time when fetching the next page of data. */
  readonly nextPageTimestamp?: Maybe<Scalars['Float']['output']>;
};

/** The ReportFight represents a single fight that occurs in the report. */
export type ReportFight = {
  readonly __typename?: 'ReportFight';
  /** The average item level of the players in the fight. */
  readonly averageItemLevel?: Maybe<Scalars['Float']['output']>;
  /** The percentage health of the active boss or bosses at the end of a fight. */
  readonly bossPercentage?: Maybe<Scalars['Float']['output']>;
  /** The bounding box that encloses the positions of all players/enemies in the fight. */
  readonly boundingBox?: Maybe<ReportMapBoundingBox>;
  /** The combat time excluding prepull events like prepares events and casts. Only set from patch 6.4 onwards. */
  readonly combatTime?: Maybe<Scalars['Float']['output']>;
  /** Whether or not a fight represents an entire raid from start to finish, e.g., in Classic WoW a complete run of Blackwing Lair. */
  readonly completeRaid: Scalars['Boolean']['output'];
  /** The difficulty setting for the raid, dungeon, or arena. Null for trash. */
  readonly difficulty?: Maybe<Scalars['Int']['output']>;
  /** For a dungeon, a list of pulls that occurred in the dungeon. Pulls have details such as the enemies involved in the pull and map info showing where the pull took place. */
  readonly dungeonPulls?: Maybe<ReadonlyArray<Maybe<ReportDungeonPull>>>;
  /** The encounter ID of the fight. If the ID is 0, the fight is considered a trash fight. */
  readonly encounterID: Scalars['Int']['output'];
  /** The end time of the fight. This is a timestamp with millisecond precision that is relative to the start of the report, i.e., the start of the report is considered time 0. */
  readonly endTime: Scalars['Float']['output'];
  /** Information about enemy NPCs involved in the fight. Includes report IDs, instance counts, and instance group counts for each NPC. */
  readonly enemyNPCs?: Maybe<ReadonlyArray<Maybe<ReportFightNpc>>>;
  /** Information about enemy pets involved in the fight. Includes report IDs, instance counts, and instance group counts for each pet. */
  readonly enemyPets?: Maybe<ReadonlyArray<Maybe<ReportFightNpc>>>;
  /** The IDs of all players involved in a fight. These players can be referenced in the master data actors table to get detailed information about each participant. */
  readonly enemyPlayers?: Maybe<ReadonlyArray<Maybe<Scalars['Int']['output']>>>;
  /** The actual completion percentage of the fight. This is the field used to indicate how far into a fight a wipe was, since fights can be complicated and have multiple bosses, no bosses, bosses that heal, etc. */
  readonly fightPercentage?: Maybe<Scalars['Float']['output']>;
  /** Information about friendly NPCs involved in the fight. Includes report IDs, instance counts, and instance group counts for each NPC. */
  readonly friendlyNPCs?: Maybe<ReadonlyArray<Maybe<ReportFightNpc>>>;
  /** Information about friendly pets involved in the fight. Includes report IDs, instance counts, and instance group counts for each pet. */
  readonly friendlyPets?: Maybe<ReadonlyArray<Maybe<ReportFightNpc>>>;
  /** The IDs of all players involved in a fight. These players can be referenced in the master data actors table to get detailed information about each participant. */
  readonly friendlyPlayers?: Maybe<ReadonlyArray<Maybe<Scalars['Int']['output']>>>;
  /** The game zone the fight takes place in. This should not be confused with the zones used by the sites for rankings. This is the actual in-game zone info. */
  readonly gameZone?: Maybe<GameZone>;
  /** Whether or not the fight had Echo present. */
  readonly hasEcho?: Maybe<Scalars['Boolean']['output']>;
  /** The report ID of the fight. This ID can be used to fetch only events, tables or graphs for this fight. */
  readonly id: Scalars['Int']['output'];
  /** Whether or not the fight is still in progress. If this field is false, it means the entire fight has been uploaded. */
  readonly inProgress?: Maybe<Scalars['Boolean']['output']>;
  /** Whether or not the fight was a boss kill, i.e., successful. If this field is false, it means the fight was a wipe or a failed run, etc.. */
  readonly kill?: Maybe<Scalars['Boolean']['output']>;
  /** The phase that the encounter was in when the fight ended. Counts up from 1 based off the phase type (i.e., normal phase vs intermission). */
  readonly lastPhase?: Maybe<Scalars['Int']['output']>;
  /** The phase that the encounter was in when the fight ended. Always increases from 0, so a fight with three real phases and two intermissions would count up from 0 to 4. */
  readonly lastPhaseAsAbsoluteIndex?: Maybe<Scalars['Int']['output']>;
  /** Whether or not the phase that the encounter was in when the fight ended was an intermission or not. */
  readonly lastPhaseIsIntermission?: Maybe<Scalars['Boolean']['output']>;
  /** All the maps that were involved in a fight. For single bosses this will usually be a single map, but for dungeons it will typically be multiple maps. */
  readonly maps?: Maybe<ReadonlyArray<Maybe<ReportMap>>>;
  /** The name of the fight. */
  readonly name: Scalars['String']['output'];
  /** Some boss fights may be converted to trash fights (encounterID = 0). When this occurs, `originalEncounterID` contains the original ID of the encounter. */
  readonly originalEncounterID?: Maybe<Scalars['Int']['output']>;
  /** List of observed phase transitions during the fight. */
  readonly phaseTransitions?: Maybe<ReadonlyArray<PhaseTransition>>;
  /** The group size for the raid, dungeon, or arena. Null for trash. */
  readonly size?: Maybe<Scalars['Int']['output']>;
  /** Whether or not the fight used a standard composition, which is defined as two tanks, two healers, four damage dealers, and no more than two of any job. */
  readonly standardComposition?: Maybe<Scalars['Boolean']['output']>;
  /** The start time of the fight. This is a timestamp with millisecond precision that is relative to the start of the report, i.e., the start of the report is considered time 0. */
  readonly startTime: Scalars['Float']['output'];
  /** If a wipe was explicitly called using the Companion app, then this field will contain the time. This is a timestamp with millisecond precision that is relative to the start of the report, i.e., the start of the report is considered time 0. */
  readonly wipeCalledTime?: Maybe<Scalars['Float']['output']>;
};

/** The ReportFightNPC represents participation info within a single fight for an NPC. */
export type ReportFightNpc = {
  readonly __typename?: 'ReportFightNPC';
  /** The game ID of the actor. This ID is used in events to identify sources and targets. */
  readonly gameID?: Maybe<Scalars['Int']['output']>;
  /** How many packs of the NPC were seen during the fight. */
  readonly groupCount?: Maybe<Scalars['Int']['output']>;
  /** The report ID of the actor. This ID is used in events to identify sources and targets. */
  readonly id?: Maybe<Scalars['Int']['output']>;
  /** How many instances of the NPC were seen during the fight. */
  readonly instanceCount?: Maybe<Scalars['Int']['output']>;
  /** The report ID of the actor that owns this NPC (if it is a pet). This ID is used in events to identify sources and targets. */
  readonly petOwner?: Maybe<Scalars['Int']['output']>;
};

/** The ReportMap represents a single map that a fight can occur on. */
export type ReportMap = {
  readonly __typename?: 'ReportMap';
  /** The map's game ID. */
  readonly id: Scalars['Int']['output'];
};

/** The ReportMapBoundingBox is a box that encloses the positions of all players and enemies in a fight or dungeon pull. */
export type ReportMapBoundingBox = {
  readonly __typename?: 'ReportMapBoundingBox';
  /** The largest X position. */
  readonly maxX: Scalars['Int']['output'];
  /** The largest Y position. */
  readonly maxY: Scalars['Int']['output'];
  /** The smallest X position. */
  readonly minX: Scalars['Int']['output'];
  /** The smallest Y position. */
  readonly minY: Scalars['Int']['output'];
};

/** The ReporMastertData object contains information about the log version of a report, as well as the actors and abilities used in the report. */
export type ReportMasterData = {
  readonly __typename?: 'ReportMasterData';
  /** A list of every ability that occurs in the report. */
  readonly abilities?: Maybe<ReadonlyArray<Maybe<ReportAbility>>>;
  /** A list of every actor (player, NPC, pet) that occurs in the report. */
  readonly actors?: Maybe<ReadonlyArray<Maybe<ReportActor>>>;
  /** The version of the game that generated the log file. Used to distinguish Classic and Retail Warcraft primarily. */
  readonly gameVersion?: Maybe<Scalars['Int']['output']>;
  /** The auto-detected locale of the report. This is the source language of the original log file. */
  readonly lang?: Maybe<Scalars['String']['output']>;
  /** The version of the client parser that was used to parse and upload this log file. */
  readonly logVersion: Scalars['Int']['output'];
};


/** The ReporMastertData object contains information about the log version of a report, as well as the actors and abilities used in the report. */
export type ReportMasterDataActorsArgs = {
  subType?: InputMaybe<Scalars['String']['input']>;
  type?: InputMaybe<Scalars['String']['input']>;
};

export type ReportPagination = {
  readonly __typename?: 'ReportPagination';
  /** Current page of the cursor */
  readonly current_page: Scalars['Int']['output'];
  /** List of items on the current page */
  readonly data?: Maybe<ReadonlyArray<Maybe<Report>>>;
  /** Number of the first item returned */
  readonly from?: Maybe<Scalars['Int']['output']>;
  /** Determines if cursor has more pages after the current page */
  readonly has_more_pages: Scalars['Boolean']['output'];
  /** The last page (number of pages) */
  readonly last_page: Scalars['Int']['output'];
  /** Number of items returned per page */
  readonly per_page: Scalars['Int']['output'];
  /** Number of the last item returned */
  readonly to?: Maybe<Scalars['Int']['output']>;
  /** Number of total items selected by the query */
  readonly total: Scalars['Int']['output'];
};

/** All the possible metrics. */
export const ReportRankingMetricType = {
  /** Boss damage per second. */
  Bossdps: 'bossdps',
  /** Boss rDPS is unique to FFXIV and is damage done to the boss adjusted for raid-contributing buffs and debuffs. */
  Bossrdps: 'bossrdps',
  /** Choose an appropriate default depending on the other selected parameters. */
  Default: 'default',
  /** Damage per second. */
  Dps: 'dps',
  /** Healing per second. */
  Hps: 'hps',
  /** Survivability ranking for tanks. Deprecated. Only supported for some older WoW zones. */
  Krsi: 'krsi',
  /** Score. Used by WoW Mythic dungeons and by ESO trials. */
  Playerscore: 'playerscore',
  /** Speed. Not supported by every zone. */
  Playerspeed: 'playerspeed',
  /** rDPS is unique to FFXIV and is damage done adjusted for raid-contributing buffs and debuffs. */
  Rdps: 'rdps',
  /** Healing done per second to tanks. */
  Tankhps: 'tankhps',
  /** Weighted damage per second. Unique to WoW currently. Used to remove pad damage and reward damage done to high priority targets. */
  Wdps: 'wdps'
} as const;

export type ReportRankingMetricType = typeof ReportRankingMetricType[keyof typeof ReportRankingMetricType];
/** Used to specify a tank, healer or DPS role. */
export const RoleType = {
  /** Fetch any role.. */
  Any: 'Any',
  /** Fetch the DPS role only. */
  Dps: 'DPS',
  /** Fetch the healer role only. */
  Healer: 'Healer',
  /** Fetch the tanking role only. */
  Tank: 'Tank'
} as const;

export type RoleType = typeof RoleType[keyof typeof RoleType];
/** A single server. Servers correspond to actual game servers that characters and guilds reside on. */
export type Server = {
  readonly __typename?: 'Server';
  /** The characters found on this server (and any servers connected to this one. */
  readonly characters?: Maybe<CharacterPagination>;
  /** The guilds found on this server (and any servers connected to this one. */
  readonly guilds?: Maybe<GuildPagination>;
  /** The ID of the server. */
  readonly id: Scalars['Int']['output'];
  /** The name of the server in the locale of the subregion that the server belongs to. */
  readonly name: Scalars['String']['output'];
  /** The normalized name is a transformation of the name, dropping spaces. It is how the server appears in a World of Warcraft log file. */
  readonly normalizedName: Scalars['String']['output'];
  /** The region that this server belongs to. */
  readonly region: Region;
  /** The server slug, also a transformation of the name following Blizzard rules. For retail World of Warcraft realms, this slug will be in English. For all other games, the slug is just a transformation of the name field. */
  readonly slug: Scalars['String']['output'];
  /** The subregion that this server belongs to. */
  readonly subregion: Subregion;
};


/** A single server. Servers correspond to actual game servers that characters and guilds reside on. */
export type ServerCharactersArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  page?: InputMaybe<Scalars['Int']['input']>;
};


/** A single server. Servers correspond to actual game servers that characters and guilds reside on. */
export type ServerGuildsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  page?: InputMaybe<Scalars['Int']['input']>;
};

export type ServerPagination = {
  readonly __typename?: 'ServerPagination';
  /** Current page of the cursor */
  readonly current_page: Scalars['Int']['output'];
  /** List of items on the current page */
  readonly data?: Maybe<ReadonlyArray<Maybe<Server>>>;
  /** Number of the first item returned */
  readonly from?: Maybe<Scalars['Int']['output']>;
  /** Determines if cursor has more pages after the current page */
  readonly has_more_pages: Scalars['Boolean']['output'];
  /** The last page (number of pages) */
  readonly last_page: Scalars['Int']['output'];
  /** Number of items returned per page */
  readonly per_page: Scalars['Int']['output'];
  /** Number of the last item returned */
  readonly to?: Maybe<Scalars['Int']['output']>;
  /** Number of total items selected by the query */
  readonly total: Scalars['Int']['output'];
};

/** A single subregion. Subregions are used to divide a region into sub-categories, such as French or German subregions of a Europe region. */
export type Subregion = {
  readonly __typename?: 'Subregion';
  /** The ID of the subregion. */
  readonly id: Scalars['Int']['output'];
  /** The localized name of the subregion. */
  readonly name: Scalars['String']['output'];
  /** The region that this subregion is found in. */
  readonly region: Region;
  /** The servers found within this region. */
  readonly servers?: Maybe<ServerPagination>;
};


/** A single subregion. Subregions are used to divide a region into sub-categories, such as French or German subregions of a Europe region. */
export type SubregionServersArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  page?: InputMaybe<Scalars['Int']['input']>;
};

/** The type of Subscription. */
export const SubscriptionStatus = {
  /** Alchemical Society Tier subscription */
  AlchemicalSociety: 'AlchemicalSociety',
  /** Gold Tier subscription */
  Gold: 'Gold',
  /** Legacy Gold Tier subscription */
  LegacyGold: 'LegacyGold',
  /** Legacy Platinum Tier subscription */
  LegacyPlatinum: 'LegacyPlatinum',
  /** Legacy Silver Tier subscription */
  LegacySilver: 'LegacySilver',
  /** Platinum Tier subscription */
  Platinum: 'Platinum',
  /** Silver Tier subscription */
  Silver: 'Silver'
} as const;

export type SubscriptionStatus = typeof SubscriptionStatus[keyof typeof SubscriptionStatus];
/** The type of table to examine. */
export const TableDataType = {
  /** Buffs. */
  Buffs: 'Buffs',
  /** Casts. */
  Casts: 'Casts',
  /** Damage done. */
  DamageDone: 'DamageDone',
  /** Damage taken. */
  DamageTaken: 'DamageTaken',
  /** Deaths. */
  Deaths: 'Deaths',
  /** Debuffs. */
  Debuffs: 'Debuffs',
  /** Dispels. */
  Dispels: 'Dispels',
  /** Healing done. */
  Healing: 'Healing',
  /** Interrupts. */
  Interrupts: 'Interrupts',
  /** Resources. */
  Resources: 'Resources',
  /** Summary Overview */
  Summary: 'Summary',
  /** Summons */
  Summons: 'Summons',
  /** Survivability (death info across multiple pulls). */
  Survivability: 'Survivability',
  /** Threat. */
  Threat: 'Threat'
} as const;

export type TableDataType = typeof TableDataType[keyof typeof TableDataType];
/** A single user of the site. Most fields can only be accessed when authenticated as that user with the "view-user-profile" scope. */
export type User = {
  readonly __typename?: 'User';
  /** The characters claimed by this user. Only accessible via user authentication when you have the "view-user-profile" scope. */
  readonly characters?: Maybe<ReadonlyArray<Maybe<Character>>>;
  /** The list of guilds to which the user belongs. Only accessible via user authentication when you have the "view-user-profile" scope. */
  readonly guilds?: Maybe<ReadonlyArray<Maybe<Guild>>>;
  /** The ID of the user. */
  readonly id: Scalars['Int']['output'];
  /** The name of the user. */
  readonly name: Scalars['String']['output'];
};

/** The user data object contains basic information about users and lets you retrieve specific users (or the current user if using the user endpoint). */
export type UserData = {
  readonly __typename?: 'UserData';
  /** Obtain the current user (only works with user endpoint). */
  readonly currentUser?: Maybe<User>;
  /** Obtain a specific user by id. */
  readonly user?: Maybe<User>;
};


/** The user data object contains basic information about users and lets you retrieve specific users (or the current user if using the user endpoint). */
export type UserDataUserArgs = {
  id?: InputMaybe<Scalars['Int']['input']>;
};

/** Whether the view is by source, target, or ability. */
export const ViewType = {
  /** View by ability. */
  Ability: 'Ability',
  /** Use the same default that the web site picks based off the other selected parameters. */
  Default: 'Default',
  /** View. by source. */
  Source: 'Source',
  /** View by target. */
  Target: 'Target'
} as const;

export type ViewType = typeof ViewType[keyof typeof ViewType];
/** The world data object contains collections of data such as expansions, zones, encounters, regions, subregions, etc. */
export type WorldData = {
  readonly __typename?: 'WorldData';
  /** Obtain a specific encounter by id. */
  readonly encounter?: Maybe<Encounter>;
  /** A single expansion obtained by ID. */
  readonly expansion?: Maybe<Expansion>;
  /** The set of all expansions supported by the site. */
  readonly expansions?: Maybe<ReadonlyArray<Maybe<Expansion>>>;
  /** Obtain a specific region by its ID. */
  readonly region?: Maybe<Region>;
  /** The set of all regions supported by the site. */
  readonly regions?: Maybe<ReadonlyArray<Maybe<Region>>>;
  /** Obtain a specific server either by id or by slug and region. */
  readonly server?: Maybe<Server>;
  /** Obtain a specific subregion by its ID. */
  readonly subregion?: Maybe<Subregion>;
  /** Obtain a specific zone by its ID. */
  readonly zone?: Maybe<Zone>;
  /** Obtain a set of all zones supported by the site. */
  readonly zones?: Maybe<ReadonlyArray<Maybe<Zone>>>;
};


/** The world data object contains collections of data such as expansions, zones, encounters, regions, subregions, etc. */
export type WorldDataEncounterArgs = {
  id?: InputMaybe<Scalars['Int']['input']>;
};


/** The world data object contains collections of data such as expansions, zones, encounters, regions, subregions, etc. */
export type WorldDataExpansionArgs = {
  id?: InputMaybe<Scalars['Int']['input']>;
};


/** The world data object contains collections of data such as expansions, zones, encounters, regions, subregions, etc. */
export type WorldDataRegionArgs = {
  id?: InputMaybe<Scalars['Int']['input']>;
};


/** The world data object contains collections of data such as expansions, zones, encounters, regions, subregions, etc. */
export type WorldDataServerArgs = {
  id?: InputMaybe<Scalars['Int']['input']>;
  region?: InputMaybe<Scalars['String']['input']>;
  slug?: InputMaybe<Scalars['String']['input']>;
};


/** The world data object contains collections of data such as expansions, zones, encounters, regions, subregions, etc. */
export type WorldDataSubregionArgs = {
  id?: InputMaybe<Scalars['Int']['input']>;
};


/** The world data object contains collections of data such as expansions, zones, encounters, regions, subregions, etc. */
export type WorldDataZoneArgs = {
  id?: InputMaybe<Scalars['Int']['input']>;
};


/** The world data object contains collections of data such as expansions, zones, encounters, regions, subregions, etc. */
export type WorldDataZonesArgs = {
  expansion_id?: InputMaybe<Scalars['Int']['input']>;
};

/** A collection containing some combination of world, region, and server ranks. */
export type WorldRegionServerRankPositions = {
  readonly __typename?: 'WorldRegionServerRankPositions';
  readonly regionRank?: Maybe<Rank>;
  readonly serverRank?: Maybe<Rank>;
  readonly worldRank?: Maybe<Rank>;
};

/** A single zone from an expansion that represents a raid, dungeon, arena, etc. */
export type Zone = {
  readonly __typename?: 'Zone';
  /** The bracket information for this zone. This field will be null if the zone does not support brackets. */
  readonly brackets?: Maybe<Bracket>;
  /** A list of all the difficulties supported for this zone. */
  readonly difficulties?: Maybe<ReadonlyArray<Maybe<Difficulty>>>;
  /** The encounters found within this zone. */
  readonly encounters?: Maybe<ReadonlyArray<Maybe<Encounter>>>;
  /** The expansion that this zone belongs to. */
  readonly expansion: Expansion;
  /** Whether or not the entire zone (including all its partitions) is permanently frozen. When a zone is frozen, data involving that zone will never change and can be cached forever. */
  readonly frozen: Scalars['Boolean']['output'];
  /** The ID of the zone. */
  readonly id: Scalars['Int']['output'];
  /** The name of the zone. */
  readonly name: Scalars['String']['output'];
  /** A list of all the partitions supported for this zone. */
  readonly partitions?: Maybe<ReadonlyArray<Maybe<Partition>>>;
};

export type CharacterDataQueryVariables = Exact<{
  name?: InputMaybe<Scalars['String']['input']>;
  server?: InputMaybe<Scalars['String']['input']>;
  region?: InputMaybe<Scalars['String']['input']>;
}>;


export type CharacterDataQuery = { readonly __typename?: 'Query', readonly characterData?: { readonly __typename?: 'CharacterData', readonly character?: { readonly __typename?: 'Character', readonly hidden: boolean, readonly id: number, readonly lodestoneID: number, readonly name: string, readonly zoneRankings?: any | null } | null } | null };

export type EncounterRankingsQueryVariables = Exact<{
  name?: InputMaybe<Scalars['String']['input']>;
  server?: InputMaybe<Scalars['String']['input']>;
  region?: InputMaybe<Scalars['String']['input']>;
  encounterID?: InputMaybe<Scalars['Int']['input']>;
}>;


export type EncounterRankingsQuery = { readonly __typename?: 'Query', readonly characterData?: { readonly __typename?: 'CharacterData', readonly character?: { readonly __typename?: 'Character', readonly id: number, readonly name: string, readonly encounterRankings?: any | null } | null } | null };

export type ReportDataQueryVariables = Exact<{
  code: Scalars['String']['input'];
}>;


export type ReportDataQuery = { readonly __typename?: 'Query', readonly reportData?: { readonly __typename?: 'ReportData', readonly report?: { readonly __typename?: 'Report', readonly code: string, readonly startTime: number, readonly endTime: number, readonly title: string } | null } | null };


export const CharacterDataDocument = `
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
export const EncounterRankingsDocument = `
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
}
    `;
export const ReportDataDocument = `
    query reportData($code: String!) {
  reportData {
    report(code: $code) {
      code
      startTime
      endTime
      title
    }
  }
}
    `;

export type SdkFunctionWrapper = <T>(action: (requestHeaders?:Record<string, string>) => Promise<T>, operationName: string, operationType?: string, variables?: any) => Promise<T>;


const defaultWrapper: SdkFunctionWrapper = (action, _operationName, _operationType, _variables) => action();

export function getSdk(client: GraphQLClient, withWrapper: SdkFunctionWrapper = defaultWrapper) {
  return {
    characterData(variables?: CharacterDataQueryVariables, requestHeaders?: GraphQLClientRequestHeaders): Promise<CharacterDataQuery> {
      return withWrapper((wrappedRequestHeaders) => client.request<CharacterDataQuery>(CharacterDataDocument, variables, {...requestHeaders, ...wrappedRequestHeaders}), 'characterData', 'query', variables);
    },
    encounterRankings(variables?: EncounterRankingsQueryVariables, requestHeaders?: GraphQLClientRequestHeaders): Promise<EncounterRankingsQuery> {
      return withWrapper((wrappedRequestHeaders) => client.request<EncounterRankingsQuery>(EncounterRankingsDocument, variables, {...requestHeaders, ...wrappedRequestHeaders}), 'encounterRankings', 'query', variables);
    },
    reportData(variables: ReportDataQueryVariables, requestHeaders?: GraphQLClientRequestHeaders): Promise<ReportDataQuery> {
      return withWrapper((wrappedRequestHeaders) => client.request<ReportDataQuery>(ReportDataDocument, variables, {...requestHeaders, ...wrappedRequestHeaders}), 'reportData', 'query', variables);
    }
  };
}
export type Sdk = ReturnType<typeof getSdk>;