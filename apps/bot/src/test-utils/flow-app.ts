import { inspect } from 'node:util';
import type { LoggerService, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DISCORD_CLIENT } from '../discord/discord.decorators.js';
import { DiscordService } from '../discord/discord.service.js';
import { FFLogsService } from '../fflogs/fflogs.service.js';
import { FIRESTORE } from '../firebase/firebase.consts.js';
import { SheetsService } from '../sheets/sheets.service.js';
import { BlacklistModule } from '../slash-commands/blacklist/blacklist.module.js';
import { SignupModule } from '../slash-commands/signup/signup.module.js';
import { TurboProgModule } from '../slash-commands/turboprog/turbo-prog.module.js';
import { DiscordMock } from './discord/discord-mock.js';
import { FFLogsMock } from './fflogs/fflogs-mock.js';
import { InMemoryFirestore } from './firestore/in-memory-firestore.js';
import { SheetsMock } from './sheets/sheets-mock.js';

/**
 * The feature modules flow specs boot. Signup's sagas dispatch into the
 * blacklist and turbo-prog command handlers, so those modules are included.
 * Add a feature's module here when its flow spec is written.
 */
const FLOW_MODULES = [SignupModule, BlacklistModule, TurboProgModule];

export interface FlowApp {
  readonly db: InMemoryFirestore;
  readonly discord: DiscordMock;
  readonly sheets: SheetsMock;
  readonly fflogs: FFLogsMock;
  /** Resolves a real provider, e.g. the command handler a test invokes. */
  get<T>(token: Type<T>): T;
  /** Lets fire-and-forget work (event handlers, sagas, collectors) finish. */
  settle(): Promise<void>;
  /**
   * Marks a logged error as part of the scenario (e.g. a DM that fails on
   * purpose). Throws if no logged error matches.
   */
  expectLoggedError(pattern: RegExp): void;
  /** Closes the app; fails if it logged an error the test didn't expect. */
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

async function settle(): Promise<void> {
  // Every fake resolves in-process, and each macrotask turn drains the whole
  // microtask queue, so a few turns let every promise chain finish.
  for (let turn = 0; turn < 10; turn++) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

/**
 * Boots the real feature modules with only external systems replaced:
 * Firestore, Discord, Google Sheets and FFLogs. Call once per test.
 */
export async function createFlowApp(): Promise<FlowApp> {
  const db = new InMemoryFirestore();
  const discord = new DiscordMock();
  const sheets = new SheetsMock();
  const fflogs = new FFLogsMock();
  const logger = new RecordingLogger();

  const moduleRef = await Test.createTestingModule({ imports: FLOW_MODULES })
    .overrideProvider(FIRESTORE)
    .useValue(db)
    .overrideProvider(DISCORD_CLIENT)
    .useValue(discord.client)
    .overrideProvider(DiscordService)
    .useValue(discord)
    .overrideProvider(SheetsService)
    .useValue(sheets)
    .overrideProvider(FFLogsService)
    .useValue(fflogs)
    .setLogger(logger)
    .compile();

  // runs onApplicationBootstrap: CQRS handler registration, SignupService's reaction listener
  await moduleRef.init();

  return {
    db,
    discord,
    sheets,
    fflogs,
    get: (token) => moduleRef.get(token),
    settle,
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
      // time out anything still waiting on a click so it can't leak into the next test
      discord.expireAll();
      await settle();
      await moduleRef.close();
      if (logger.errors.length > 0) {
        throw new Error(
          `The app logged errors this test did not expect (declare intended ones with flow.expectLoggedError):\n${logger.errors.join('\n---\n')}`,
        );
      }
    },
  };
}
