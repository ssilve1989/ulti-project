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
  ISchedulingApi,
} from './interfaces/index.js';
export { ApiFactory, createDefaultConfig } from './factory.js';

export const createSchedulingApi = (guildId?: string) => {
  const config = createDefaultConfig();
  const factory = ApiFactory.getInstance(config);
  return factory.createSchedulingApi(guildId);
};
