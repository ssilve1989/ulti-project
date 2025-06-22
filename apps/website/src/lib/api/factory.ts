import type {
  IApiConfig,
  IApiContext,
  IEventsApi,
  IHelpersApi,
  ILocksApi,
  IRosterApi,
} from './interfaces/index.js';

/**
 * Combined API interface that includes all domain APIs
 */
export interface ISchedulingApi {
  readonly events: IEventsApi;
  readonly helpers: IHelpersApi;
  readonly roster: IRosterApi;
  readonly locks: ILocksApi;
}

/**
 * API factory that creates the appropriate implementation based on configuration
 */
export class ApiFactory {
  private static instance: ApiFactory | null = null;
  private config: IApiConfig;

  private constructor(config: IApiConfig) {
    this.config = config;
  }

  /**
   * Get or create the singleton factory instance
   */
  static getInstance(config?: IApiConfig): ApiFactory {
    if (!ApiFactory.instance) {
      if (!config) {
        throw new Error('ApiFactory requires initial configuration');
      }
      ApiFactory.instance = new ApiFactory(config);
    }
    return ApiFactory.instance;
  }

  /**
   * Create a scheduling API instance for the specified guild
   */
  createSchedulingApi(guildId?: string): ISchedulingApi {
    const context: IApiContext = {
      guildId: guildId || this.config.defaultGuildId,
    };

    if (this.config.useMockData) {
      return this.createMockApi(context);
    }

    return this.createHttpApi(context);
  }

  /**
   * Create mock implementation (to be implemented in Phase 2)
   */
  private createMockApi(context: IApiContext): ISchedulingApi {
    // Placeholder - will be implemented in Phase 2
    throw new Error(
      'Mock API implementation not yet available - implement in Phase 2',
    );
  }

  /**
   * Create HTTP implementation (to be implemented in Phase 3)
   */
  private createHttpApi(context: IApiContext): ISchedulingApi {
    // Placeholder - will be implemented in Phase 3
    throw new Error(
      'HTTP API implementation not yet available - implement in Phase 3',
    );
  }

  /**
   * Update factory configuration
   */
  updateConfig(config: Partial<IApiConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): IApiConfig {
    return { ...this.config };
  }
}

/**
 * Default configuration based on environment
 */
export const createDefaultConfig = (): IApiConfig => ({
  useMockData:
    process.env.NODE_ENV === 'development' ||
    process.env.USE_MOCK_DATA === 'true',
  apiBaseUrl: process.env.API_BASE_URL || 'http://localhost:3000',
  defaultGuildId: process.env.DEFAULT_GUILD_ID || 'default-guild',
});
