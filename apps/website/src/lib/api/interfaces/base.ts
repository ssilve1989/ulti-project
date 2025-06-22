/**
 * Base context interface that all API implementations must support
 * Provides guild-scoped operations for multi-tenant architecture
 */
export interface IApiContext {
  readonly guildId: string;
}

/**
 * Base interface for all API implementations
 * Ensures consistent guild context across all operations
 */
export interface IBaseApi {
  readonly context: IApiContext;
}

/**
 * Configuration for API implementation selection
 */
export interface IApiConfig {
  readonly useMockData: boolean;
  readonly apiBaseUrl?: string;
  readonly defaultGuildId: string;
}

/**
 * Factory function signature for creating API implementations
 */
export type ApiFactory<T extends IBaseApi> = (context: IApiContext) => T;

/**
 * Standard paginated response structure
 */
export interface IPaginatedResponse<T> {
  readonly data: T[];
  readonly total: number;
  readonly hasMore: boolean;
  readonly nextCursor?: string;
}
