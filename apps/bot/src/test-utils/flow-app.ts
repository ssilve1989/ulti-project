import { inspect } from 'node:util';
import {
  ConsoleLogger,
  Logger,
  type LoggerService,
  type Type,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as Sentry from '@sentry/nestjs';
import { vi } from 'vitest';
import { DISCORD_CLIENT } from '../discord/discord.decorators.js';
import { DiscordService } from '../discord/discord.service.js';
import { getFflogsSdkToken } from '../fflogs/fflogs.consts.js';
import { FIRESTORE } from '../firebase/firebase.consts.js';
import { SheetsService } from '../sheets/sheets.service.js';
import { SlashCommandRegistry } from '../slash-commands/slash-command-registry.service.js';
import { SlashCommandsModule } from '../slash-commands/slash-commands.module.js';
import { DiscordMock } from './discord/discord-mock.js';
import { FFLogsMock } from './fflogs/fflogs-mock.js';
import { InMemoryFirestore } from './firestore/in-memory-firestore.js';
import { createActivityTracker, waitUntilIdle } from './idle.js';
import {
  captureSheetsRequests,
  type SheetsWrite,
  startSheetsRecording,
} from './sheets/recorded-sheets.js';

/**
 * Flow specs boot every slash command feature, as the bot does: commands reach
 * their handlers through the real listener and registry.
 */
const FLOW_MODULES = [SlashCommandsModule];

/**
 * The shared Google test spreadsheet flow specs record against (also used for
 * manual testing). Tests must only touch rows they create, keyed by a
 * per-test character name, and remove them afterwards.
 */
const TEST_SPREADSHEET_ID = '1D8OOrbeKyJWUIIR87ornoW6x2sqzVmGFc8pCvoiGPWY';

interface TestSheet {
  readonly spreadsheetId: string;
  /**
   * Every request the app sent to change the spreadsheet in this test, in
   * order and in full. Assert on these, never by reading the sheet back: in a
   * replay a read returns the recorded sheet, not what this run wrote.
   */
  writes(): SheetsWrite[];
  /**
   * The value grids the spreadsheet returned when the app read `range` (e.g.
   * `DSR!I:L`), in order: the sheet as the app saw it, for working out which
   * row a write should have gone to.
   */
  valuesRead(range: string): unknown[];
}

export interface FlowApp {
  /** When the app was created (epoch ms), for asserting times the app stamps. */
  readonly startedAt: number;
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
   * Marks a reported problem (a logged error or warning, or a report to
   * Sentry) as part of the scenario, e.g. a DM that fails on purpose. Throws
   * if no report matches.
   */
  expectReported(pattern: RegExp): void;
  /**
   * Closes the app (once; later calls do nothing); fails if it logged an error the test didn't expect or
   * left a pressed component unacknowledged.
   */
  close(): Promise<void>;
}

function describeLogged(value: unknown): string {
  if (value instanceof Error) return value.stack ?? value.message;
  return typeof value === 'string' ? value : inspect(value);
}

/**
 * Everything the app reports as a problem: Nest errors and warnings, and
 * reports to Sentry. Event handlers, sagas and reaction handling catch their
 * own exceptions and only log or report them, so without this a fake throwing
 * "does not support …" on a background path would leave no trace and negative
 * assertions would pass vacuously.
 */
class ProblemRecorder implements LoggerService {
  readonly problems: string[] = [];

  log(): void {
    // info-level output is noise in tests
  }

  warn(message: unknown, ...params: unknown[]): void {
    this.record('warning', message, params);
  }

  error(message: unknown, ...params: unknown[]): void {
    this.record('error', message, params);
  }

  record(kind: string, message: unknown, params: unknown[] = []): void {
    this.problems.push(
      `${kind}: ${[message, ...params].map(describeLogged).join(' ')}`,
    );
  }

  /** Records what the app sends Sentry, through every scope, while it runs. */
  watchSentry(): () => void {
    const { captureException, captureMessage } = Sentry.Scope.prototype;
    const recorder = this;
    const exceptions = vi
      .spyOn(Sentry.Scope.prototype, 'captureException')
      .mockImplementation(function (this: Sentry.Scope, ...args) {
        recorder.record('Sentry exception', args[0]);
        return Reflect.apply(captureException, this, args);
      });
    const messages = vi
      .spyOn(Sentry.Scope.prototype, 'captureMessage')
      .mockImplementation(function (this: Sentry.Scope, ...args) {
        recorder.record(`Sentry ${args[1] ?? 'message'}`, args[0]);
        return Reflect.apply(captureMessage, this, args);
      });
    return () => {
      exceptions.mockRestore();
      messages.mockRestore();
    };
  }
}

/**
 * setLogger makes Nest route every Logger through ours, globally. Put back
 * what Nest's testing module uses by default (its TestingLogger, which isn't
 * exported: a ConsoleLogger printing only errors), so nothing logged after
 * this app is gone lands in its ProblemRecorder.
 */
function restoreDefaultLogger(): void {
  Logger.overrideLogger(new ConsoleLogger({ logLevels: ['error'] }));
}

/**
 * Boots the real feature modules with Firestore, Discord and the FFLogs API
 * replaced by fakes. Google Sheets traffic is replayed from recordings of the
 * real test spreadsheet (see recorded-sheets.ts). Call once per test.
 */
export async function createFlowApp(): Promise<FlowApp> {
  const startedAt = Date.now();
  const db = new InMemoryFirestore();
  const discord = new DiscordMock();
  const fflogs = new FFLogsMock();
  const logger = new ProblemRecorder();
  // the tracker starts after recording: a failed start has nothing to dispose
  const recording = await startSheetsRecording();
  const activity = createActivityTracker();
  const sheetsRequests = captureSheetsRequests();
  const stopWatchingSentry = logger.watchSentry();

  try {
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

    // runs onApplicationBootstrap: CQRS handler registration, SignupService's
    // reaction listener, and SlashCommandsService's listener for commands
    await moduleRef.init();
    // what the bot registers with Discord, so the fake only sends commands
    // and options that exist
    discord.registerCommands(
      moduleRef.get(SlashCommandRegistry).getAllBuilders(),
    );

    activity.trackCalls(moduleRef.get(SheetsService));
    let closed = false;
    const sheets: TestSheet = {
      spreadsheetId: TEST_SPREADSHEET_ID,
      writes: () => sheetsRequests.writes(),
      valuesRead: (range) => recording.valuesRead(range),
    };

    return {
      startedAt,
      db,
      discord,
      sheets,
      fflogs,
      get: (token) => moduleRef.get(token),
      settle: () => waitUntilIdle(activity),
      expectReported: (pattern) => {
        const index = logger.problems.findIndex((entry) => pattern.test(entry));
        if (index === -1) {
          throw new Error(
            `No reported problem matches ${pattern}. Reported:\n${logger.problems.join('\n---\n') || '(none)'}`,
          );
        }
        logger.problems.splice(index, 1);
      },
      close: async () => {
        // a test may close the app itself; its fixture's teardown then no-ops
        if (closed) return;
        closed = true;
        const failures: string[] = [];
        try {
          // time out anything still waiting on a click so it can't leak into the next test
          discord.expireAll();
          await waitUntilIdle(activity);
          await moduleRef.close();
        } finally {
          restoreDefaultLogger();
          stopWatchingSentry();
          activity.dispose();
          sheetsRequests.dispose();
          try {
            recording.finish();
          } catch (error) {
            failures.push(describeLogged(error));
          }
        }
        // reported problems usually explain any other failure, so they come first
        if (logger.problems.length > 0) {
          failures.unshift(
            `The app reported problems this test did not expect (declare intended ones with flow.expectReported):\n${logger.problems.join('\n---\n')}`,
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
  } catch (error) {
    // don't leave nock intercepting or listeners subscribed for later spec files
    restoreDefaultLogger();
    stopWatchingSentry();
    activity.dispose();
    sheetsRequests.dispose();
    recording.abandon();
    throw error;
  }
}
