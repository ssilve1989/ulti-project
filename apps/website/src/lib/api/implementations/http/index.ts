import type { IApiContext } from '../../interfaces/index.js';
import type { ISchedulingApi } from '../../interfaces/index.js';
import { HttpEventsApi } from './EventsApi.js';
import { HttpHelpersApi } from './HelpersApi.js';
import { HttpRosterApi } from './RosterApi.js';
import { HttpLocksApi } from './LocksApi.js';

export class HttpSchedulingApi implements ISchedulingApi {
  public readonly events: HttpEventsApi;
  public readonly helpers: HttpHelpersApi;
  public readonly roster: HttpRosterApi;
  public readonly locks: HttpLocksApi;

  constructor(baseUrl: string, context: IApiContext) {
    const config = { baseUrl };
    
    this.events = new HttpEventsApi(config, context);
    this.helpers = new HttpHelpersApi(config, context);
    this.roster = new HttpRosterApi(config, context);
    this.locks = new HttpLocksApi(config, context);
  }
}

