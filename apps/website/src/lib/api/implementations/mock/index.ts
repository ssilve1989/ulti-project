import type { ISchedulingApi } from '../../factory.js';
import type { IApiContext } from '../../interfaces/index.js';
import { MockEventsApi } from './EventsApi.js';
import { MockHelpersApi } from './HelpersApi.js';
import { MockLocksApi } from './LocksApi.js';
import { MockRosterApi } from './RosterApi.js';

export class MockSchedulingApi implements ISchedulingApi {
  public readonly events: MockEventsApi;
  public readonly helpers: MockHelpersApi;
  public readonly roster: MockRosterApi;
  public readonly locks: MockLocksApi;

  constructor(context: IApiContext) {
    this.events = new MockEventsApi(context);
    this.helpers = new MockHelpersApi(context);
    this.roster = new MockRosterApi(context);
    this.locks = new MockLocksApi(context);
  }
}

export function createMockSchedulingApi(context: IApiContext): ISchedulingApi {
  return new MockSchedulingApi(context);
}
