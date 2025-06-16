import type { EventsApi } from './interfaces/EventsApi.js';
import type { HelpersApi } from './interfaces/HelpersApi.js';
import type { LocksApi } from './interfaces/LocksApi.js';
import type { RosterApi } from './interfaces/RosterApi.js';
import { EventsApiMock } from './mock/EventsApi.js';
import { HelpersApiMock } from './mock/HelpersApi.js';
import { LocksApiMock } from './mock/LocksApi.js';
import { RosterApiMock } from './mock/RosterApi.js';
import { EventsApiImpl } from './real/EventsApi.js';
import { HelpersApiImpl } from './real/HelpersApi.js';
import { LocksApiImpl } from './real/LocksApi.js';
import { RosterApiImpl } from './real/RosterApi.js';

const useMockApi = import.meta.env.VITE_USE_MOCK_API === 'true';

export const eventsApi: EventsApi = useMockApi
  ? new EventsApiMock()
  : new EventsApiImpl();

export const helpersApi: HelpersApi = useMockApi
  ? new HelpersApiMock()
  : new HelpersApiImpl();

export const rosterApi: RosterApi = useMockApi
  ? new RosterApiMock()
  : new RosterApiImpl();

export const locksApi: LocksApi = useMockApi
  ? new LocksApiMock()
  : new LocksApiImpl();
