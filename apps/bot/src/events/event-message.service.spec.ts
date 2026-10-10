import { Logger } from '@nestjs/common';
import {
  Encounter,
  EncounterFriendlyDescription,
  Job,
} from '@ulti-project/shared';
import type { Message } from 'discord.js';
import { Timestamp } from 'firebase-admin/firestore';
import { test as base, describe, expect, vi } from 'vitest';
import type { DiscordService } from '../discord/discord.service.js';
import type { EventsCollection } from '../firebase/collections/events.collection.js';
import type { SettingsCollection } from '../firebase/collections/settings-collection.js';
import {
  EventStatus,
  type ParticipantDocument,
  type StoredEvent,
} from '../firebase/models/event.model.js';
import type { SettingsDocument } from '../firebase/models/settings.model.js';
import { fresh } from '../test-utils/fixtures.js';
import {
  createAutoMock,
  mockOf,
  partialMock,
} from '../test-utils/mock-factory.js';
import { EventMessageService } from './event-message.service.js';
import { renderEventMessage } from './render/event-message.renderer.js';

const WAR_EMOJI = '111111111111111111';

const EVENT = Object.freeze<StoredEvent>({
  id: 'event-1',
  guildId: 'guild-1',
  title: 'DSR prog night',
  startsAt: Timestamp.fromDate(new Date('2026-10-10T20:00:00Z')),
  signupsCloseAt: Timestamp.fromDate(new Date('2026-10-10T18:00:00Z')),
  signupsCloseDueAt: Timestamp.fromDate(new Date('2026-10-10T18:00:00Z')),
  encounters: [Encounter.DSR],
  channelId: 'channel-1',
  messageId: 'message-1',
  createdBy: 'organizer-1',
  status: EventStatus.Open,
});

const PARTICIPANT = Object.freeze<ParticipantDocument>({
  discordId: 'player-1',
  encounter: Encounter.DSR,
  job: Job.WAR,
  character: 'character 1',
  world: 'jenova',
  phase: { roleId: 'role-p6', label: 'P6', order: 6, bucket: 'prog' },
  signedUpAt: Timestamp.fromDate(new Date('2026-10-08T12:00:00Z')),
});

/** What the service should send for EVENT with PARTICIPANT signed up. */
function expectedMessage() {
  return renderEventMessage({
    event: EVENT,
    participants: [PARTICIPANT],
    jobEmojis: { [Job.WAR]: WAR_EMOJI },
    encounterNames: EncounterFriendlyDescription,
    now: new Date(),
  });
}

function deferred() {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

/** Lets every already-queued promise continuation run. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A server text channel whose `send` resolves the given message. */
function aChannel(send: ReturnType<typeof vi.fn>) {
  return mockOf<
    NonNullable<Awaited<ReturnType<DiscordService['getTextChannel']>>>
  >({
    send,
    isDMBased: () => false,
  });
}

function setup() {
  const events = createAutoMock<EventsCollection>();
  const settings = createAutoMock<SettingsCollection>();
  const discord = createAutoMock<DiscordService>();
  events.get.mockResolvedValue(EVENT);
  events.listParticipants.mockResolvedValue([PARTICIPANT]);
  settings.getSettings.mockResolvedValue(
    partialMock<SettingsDocument>({ jobEmojis: { [Job.WAR]: WAR_EMOJI } }),
  );
  const edit = vi.fn<Message<true>['edit']>();
  const message = mockOf<Message<true>>({ id: 'message-1', edit });
  discord.fetchMessage.mockResolvedValue(message);
  const warn = vi.spyOn(Logger.prototype, 'warn').mockReturnValue(undefined);
  const service = new EventMessageService(events, settings, discord);
  return { service, events, discord, edit, message, warn };
}

const test = base.extend<{ subject: ReturnType<typeof setup> }>({
  subject: fresh(setup, ({ warn }) => warn.mockRestore()),
});

describe('EventMessageService', () => {
  describe('when an event is posted', () => {
    test('sends the rendered event to its channel and returns the message', async ({
      subject: { service, discord, message },
    }) => {
      const send = vi.fn().mockResolvedValue(message);
      discord.getTextChannel.mockResolvedValue(aChannel(send));

      const posted = await service.post(EVENT);

      expect(posted).toBe(message);
      expect(send.mock.calls).toEqual([[expectedMessage()]]);
    });

    test('stores the message id on the event', async ({
      subject: { service, discord, events, message },
    }) => {
      discord.getTextChannel.mockResolvedValue(
        aChannel(vi.fn().mockResolvedValue(message)),
      );

      await service.post(EVENT);

      expect(events.setMessage.mock.calls).toEqual([
        ['event-1', 'channel-1', 'message-1'],
      ]);
    });
  });

  describe("when an event's channel can't be found", () => {
    test('rejects the post', async ({ subject: { service, discord } }) => {
      discord.getTextChannel.mockResolvedValue(null);

      await expect(service.post(EVENT)).rejects.toThrow('channel-1');
    });
  });

  describe('when an event is moved to another channel', () => {
    test('posts it there, stores it, and deletes the old message', async ({
      subject: { service, discord, events, message },
    }) => {
      const send = vi.fn().mockResolvedValue(message);
      discord.getTextChannel.mockResolvedValue(aChannel(send));

      await service.move(EVENT, 'channel-2');

      expect({
        channels: discord.getTextChannel.mock.calls,
        sent: send.mock.calls,
        stored: events.setMessage.mock.calls,
        deleted: discord.deleteMessage.mock.calls,
      }).toEqual({
        channels: [[{ guildId: 'guild-1', channelId: 'channel-2' }]],
        sent: [[expectedMessage()]],
        stored: [['event-1', 'channel-2', 'message-1']],
        deleted: [['guild-1', 'channel-1', 'message-1']],
      });
    });
  });

  describe("when an event is moved and its old message can't be deleted", () => {
    test('warns and still resolves, with the event stored in its new channel', async ({
      subject: { service, discord, events, message, warn },
    }) => {
      discord.getTextChannel.mockResolvedValue(
        aChannel(vi.fn().mockResolvedValue(message)),
      );
      discord.deleteMessage.mockRejectedValue(new Error('Discord is down'));

      await service.move(EVENT, 'channel-2');

      expect({
        stored: events.setMessage.mock.calls,
        warnings: warn.mock.calls,
      }).toEqual({
        stored: [['event-1', 'channel-2', 'message-1']],
        warnings: [
          [
            'The old message message-1 for event event-1 could not be deleted: Error: Discord is down',
          ],
        ],
      });
    });
  });

  describe('when an event is moved while a refresh of it is in progress', () => {
    test('moves it only after that refresh, and runs a later refresh after the move', async ({
      subject: { service, discord, edit, message },
    }) => {
      const log: string[] = [];
      const firstEdit = deferred();
      edit.mockImplementation(async () => {
        log.push('edit started');
        await firstEdit.promise;
        log.push('edit finished');
        return mockOf<Message<true>>({});
      });
      const send = vi.fn().mockImplementation(() => {
        log.push('move sent');
        return Promise.resolve(message);
      });
      discord.getTextChannel.mockResolvedValue(aChannel(send));

      const refreshed = service.refresh('event-1');
      const moved = service.move(EVENT, 'channel-2');
      const refreshedAgain = service.refresh('event-1');
      await flush();
      const whileRefreshing = [...log];
      firstEdit.resolve();
      await Promise.all([refreshed, moved, refreshedAgain]);

      expect({ whileRefreshing, log }).toEqual({
        whileRefreshing: ['edit started'],
        log: [
          'edit started',
          'edit finished',
          'move sent',
          'edit started',
          'edit finished',
        ],
      });
    });
  });

  describe('when an event is refreshed', () => {
    test('edits its message with the re-rendered event', async ({
      subject: { service, edit },
    }) => {
      await service.refresh('event-1');

      expect(edit.mock.calls).toEqual([[expectedMessage()]]);
    });
  });

  describe('when an event is refreshed twice in a row', () => {
    test('starts the second edit only after the first finishes', async ({
      subject: { service, edit },
    }) => {
      const log: string[] = [];
      const firstEdit = deferred();
      edit
        .mockImplementationOnce(async () => {
          log.push('first edit started');
          await firstEdit.promise;
          log.push('first edit finished');
          return mockOf<Message<true>>({});
        })
        .mockImplementationOnce(() => {
          log.push('second edit started');
          return Promise.resolve(mockOf<Message<true>>({}));
        });

      const first = service.refresh('event-1');
      await flush();
      const second = service.refresh('event-1');
      await flush();
      const whileFirstPending = [...log];
      firstEdit.resolve();
      await Promise.all([first, second]);

      expect({ whileFirstPending, log }).toEqual({
        whileFirstPending: ['first edit started'],
        log: [
          'first edit started',
          'first edit finished',
          'second edit started',
        ],
      });
    });

    test('resolves the first refresh once its own edit is done', async ({
      subject: { service, edit },
    }) => {
      const firstEdit = deferred();
      const settled: string[] = [];
      edit.mockImplementationOnce(async () => {
        await firstEdit.promise;
        return mockOf<Message<true>>({});
      });

      const first = service.refresh('event-1').then(() => {
        settled.push('first');
      });
      await flush();
      void service.refresh('event-1').then(() => {
        settled.push('second');
      });
      await flush();
      const beforeEdit = [...settled];
      firstEdit.resolve();
      await first;

      expect({ beforeEdit, afterEdit: settled }).toEqual({
        beforeEdit: [],
        afterEdit: ['first'],
      });
    });
  });

  describe('when an event is refreshed again before a queued refresh starts', () => {
    test('edits its message once, after all of them', async ({
      subject: { service, edit },
    }) => {
      await Promise.all([
        service.refresh('event-1'),
        service.refresh('event-1'),
        service.refresh('event-1'),
      ]);

      expect(edit.mock.calls).toEqual([[expectedMessage()]]);
    });
  });

  describe('when a refresh fails', () => {
    test('rejects that refresh and still runs the next one', async ({
      subject: { service, edit },
    }) => {
      const firstEdit = deferred();
      edit.mockImplementationOnce(() =>
        firstEdit.promise.then(() => {
          throw new Error('Discord is down');
        }),
      );

      const first = service.refresh('event-1');
      await flush();
      const second = service.refresh('event-1');
      firstEdit.resolve();

      await expect(first).rejects.toThrow('Discord is down');
      await second;
      expect(edit.mock.calls).toEqual([
        [expectedMessage()],
        [expectedMessage()],
      ]);
    });
  });

  describe("when the event's message was deleted", () => {
    test('warns and resolves without editing', async ({
      subject: { service, discord, edit, warn },
    }) => {
      discord.fetchMessage.mockResolvedValue(undefined);

      await service.refresh('event-1');

      expect({ edits: edit.mock.calls, warnings: warn.mock.calls }).toEqual({
        edits: [],
        warnings: [['The message message-1 for event event-1 was not found']],
      });
    });
  });

  describe('when the event no longer exists', () => {
    test('warns and resolves without editing', async ({
      subject: { service, events, edit, warn },
    }) => {
      events.get.mockResolvedValue(undefined);

      await service.refresh('event-1');

      expect({ edits: edit.mock.calls, warnings: warn.mock.calls }).toEqual({
        edits: [],
        warnings: [['The event event-1 has no message to refresh']],
      });
    });
  });
});
