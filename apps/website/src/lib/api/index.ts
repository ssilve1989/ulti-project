// Convenience function for creating API instances
import { ApiFactory, createDefaultConfig } from './factory.js';

// Export all interfaces
export type {
  IApiContext,
  IApiConfig,
  IEventsApi,
  IHelpersApi,
  IRosterApi,
  ILocksApi,
  IPaginatedResponse,
  ApiFactory as ApiFactoryType,
} from './interfaces/index.js';

// Export factory and main API interface
export type { ISchedulingApi } from './factory.js';
export { ApiFactory, createDefaultConfig } from './factory.js';

export const createSchedulingApi = (guildId?: string) => {
  const config = createDefaultConfig();
  const factory = ApiFactory.getInstance(config);
  return factory.createSchedulingApi(guildId);
};
