import { inspect } from 'node:util';
import type { sheets_v4 } from '@googleapis/sheets';
import type { LoggerService, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DISCORD_CLIENT } from '../discord/discord.decorators.js';
import { DiscordService } from '../discord/discord.service.js';
import { getFflogsSdkToken } from '../fflogs/fflogs.consts.js';
import { FIRESTORE } from '../firebase/firebase.consts.js';
import { SHEETS_CLIENT } from '../sheets/sheets.consts.js';
import { SheetsService } from '../sheets/sheets.service.js';
import { BlacklistModule } from '../slash-commands/blacklist/blacklist.module.js';
import { SignupModule } from '../slash-commands/signup/signup.module.js';
import { TurboProgModule } from '../slash-commands/turboprog/turbo-prog.module.js';
import { DiscordMock } from './discord/discord-mock.js';
import { FFLogsMock } from './fflogs/fflogs-mock.js';
import { InMemoryFirestore } from './firestore/in-memory-firestore.js';
import {
  type ActivityTracker,
  createActivityTracker,
  waitUntilIdle,
} from './idle.js';
import { startSheetsRecording } from './sheets/recorded-sheets.js';

/**
 * The feature modules flow specs boot. Signup's sagas dispatch into the
 * blacklist and turbo-prog command handlers, so those modules are included.
 * Add a feature's module here when its flow spec is written.
 */
const FLOW_MODULES = [SignupModule, BlacklistModule, TurboProgModule];

/**
 * The shared Google test spreadsheet flow specs record against (also used for
 * manual testing). Tests must only touch rows they create, keyed by a
 * per-test character name, and remove them afterwards.
 */
const TEST_SPREADSHEET_ID = '1D8OOrbeKyJWUIIR87ornoW6x2sqzVmGFc8pCvoiGPWY';

interface TestSheet {
  readonly spreadsheetId: string;
  /** Cell values in an A1 range of the test spreadsheet, e.g. `DSR!I9:L`. */
  read(range: string): Promise<string[][]>;
}

export interface FlowApp {
  readonly db: InMemoryFirestore;
  readonly discord: DiscordMock;
  /** The Google test spreadsheet (recorded, then replayed), read through the app's own client. */
  readonly sheets: TestSheet;
  readonly fflogs: FFLogsMock;
  /** Resolves a real provider, e.g. the command handler a test invokes. */
  get<T>(token: Type<T>): T;
  /**
   * Waits until the app is idle: fire-and-forget work (event handlers, sagas,
   * collectors) has run and no HTTP request (e.g. to Google Sheets) is in flight.
   */
  settle(): Promise<void>;
  /**
   * Marks a logged error as part of the scenario (e.g. a DM that fails on
   * purpose). Throws if no logged error matches.
   */
  expectLoggedError(pattern: RegExp): void;
  /**
   * Closes the app; fails if it logged an error the test didn't expect or
   * left a pressed component unacknowledged.
   */
  close(): Promise<void>;
}

function describeLogged(value: unknown): string {
  if (value instanceof Error) return value.stack ?? value.message;
  return typeof value === 'string' ? value : inspect(value);
}

/**
 * Nest logger that records error-level calls. Event handlers, sagas and
 * reaction handling catch their own exceptions and only log them, so without
 * this a fake throwing "does not support …" on a background path would leave
 * no trace and negative assertions would pass vacuously.
 */
class RecordingLogger implements LoggerService {
  readonly errors: string[] = [];

  log(): void {
    // info-level output is noise in tests
  }

  warn(): void {
    // warnings are expected (e.g. "No blacklist channels set")
  }

  error(message: unknown, ...params: unknown[]): void {
    this.errors.push([message, ...params].map(describeLogged).join(' '));
  }
}

/**
 * Boots the real feature modules with Firestore, Discord and the FFLogs API
 * replaced by fakes. Google Sheets traffic is replayed from recordings of the
 * real test spreadsheet (see recorded-sheets.ts). Call once per test.
 */
export async function createFlowApp(): Promise<FlowApp> {
  const db = new InMemoryFirestore();
  const discord = new DiscordMock();
  const fflogs = new FFLogsMock();
  const logger = new RecordingLogger();
  const activity = createActivityTracker();
  let recording: Awaited<ReturnType<typeof startSheetsRecording>>;
  try {
    recording = await startSheetsRecording();
  } catch (error) {
    activity.dispose();
    throw error;
  }

  try {
    return await startApp({ db, discord, fflogs, logger, activity, recording });
  } catch (error) {
    // don't leave nock intercepting or listeners subscribed for later spec files
    activity.dispose();
    recording.abandon();
    throw error;
  }
}

async function startApp({
  db,
  discord,
  fflogs,
  logger,
  activity,
  recording,
}: {
  db: InMemoryFirestore;
  discord: DiscordMock;
  fflogs: FFLogsMock;
  logger: RecordingLogger;
  activity: ActivityTracker;
  recording: Awaited<ReturnType<typeof startSheetsRecording>>;
}): Promise<FlowApp> {
  const moduleRef = await Test.createTestingModule({ imports: FLOW_MODULES })
    .overrideProvider(FIRESTORE)
    .useValue(db)
    .overrideProvider(DISCORD_CLIENT)
    .useValue(discord.client)
    .overrideProvider(DiscordService)
    .useValue(discord)
    .overrideProvider(getFflogsSdkToken())
    .useValue(fflogs)
    .setLogger(logger)
    .compile();

  // runs onApplicationBootstrap: CQRS handler registration, SignupService's reaction listener
  await moduleRef.init();

  activity.trackCalls(moduleRef.get(SheetsService));
  const sheetsClient = moduleRef.get<sheets_v4.Sheets>(SHEETS_CLIENT);
  const sheets: TestSheet = {
    spreadsheetId: TEST_SPREADSHEET_ID,
    read: async (range) => {
      const response = await sheetsClient.spreadsheets.values.get({
        spreadsheetId: TEST_SPREADSHEET_ID,
        range,
      });
      return response.data.values ?? [];
    },
  };

  return {
    db,
    discord,
    sheets,
    fflogs,
    get: (token) => moduleRef.get(token),
    settle: () => waitUntilIdle(activity),
    expectLoggedError: (pattern) => {
      const index = logger.errors.findIndex((entry) => pattern.test(entry));
      if (index === -1) {
        throw new Error(
          `No logged error matches ${pattern}. Logged errors:\n${logger.errors.join('\n---\n') || '(none)'}`,
        );
      }
      logger.errors.splice(index, 1);
    },
    close: async () => {
      const failures: string[] = [];
      try {
        // time out anything still waiting on a click so it can't leak into the next test
        discord.expireAll();
        await waitUntilIdle(activity);
        await moduleRef.close();
      } finally {
        activity.dispose();
        try {
          recording.finish();
        } catch (error) {
          failures.push(describeLogged(error));
        }
      }
      // logged errors usually explain any other failure, so they come first
      if (logger.errors.length > 0) {
        failures.unshift(
          `The app logged errors this test did not expect (declare intended ones with flow.expectLoggedError):\n${logger.errors.join('\n---\n')}`,
        );
      }
      const unacknowledged = discord.unacknowledged();
      if (unacknowledged.length > 0) {
        failures.push(
          `The bot never acknowledged these pressed components, so Discord would show "This interaction failed": ${unacknowledged.join(', ')}`,
        );
      }
      if (failures.length > 0) {
        throw new Error(failures.join('\n\n'));
      }
    },
  };
}
