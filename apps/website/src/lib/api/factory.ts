import { MOCK_CONFIG } from '../mock/config.js';
import { HttpSchedulingApi } from './implementations/http/index.js';
import { createMockSchedulingApi } from './implementations/mock/index.js';
import type {
  IApiConfig,
  IApiContext,
  ISchedulingApi,
} from './interfaces/index.js';

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

  private createMockApi(context: IApiContext): ISchedulingApi {
    return createMockSchedulingApi(context);
  }

  private createHttpApi(context: IApiContext): ISchedulingApi {
    if (!this.config.apiBaseUrl) {
      throw new Error('API base URL required for HTTP implementation');
    }
    return new HttpSchedulingApi(this.config.apiBaseUrl, context);
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

export const createDefaultConfig = (): IApiConfig => ({
  useMockData: import.meta.env.VITE_USE_MOCK_API !== 'false',
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000',
  defaultGuildId:
    import.meta.env.VITE_DEFAULT_GUILD_ID || MOCK_CONFIG.guild.defaultGuildId,
});
