import type * as Sentry from '@sentry/nestjs';
import type { ButtonInteraction, Message } from 'discord.js';
import { test as base, describe, expect, vi } from 'vitest';
import type { ErrorService } from '../error/error.service.js';
import { FakeMessage } from '../test-utils/discord/fake-message.js';
import { fresh } from '../test-utils/fixtures.js';
import { createAutoMock, mockOf } from '../test-utils/mock-factory.js';
import { watchSentryMetrics } from '../test-utils/sentry.js';
import { ComponentSessionService } from './component-session.service.js';

interface Session {
  fake: FakeMessage;
  message: Message<true>;
  /** The metrics recorded since the session started. */
  metrics: Sentry.Metric[];
  stopWatching: () => void;
  end: () => void;
  /** What the session sends Discord to edit the reply. */
  editReply: ReturnType<typeof vi.fn>;
}

/** A session on a message, started from a button. */
function startSession({
  clearEmbedsOnExpiry,
}: {
  clearEmbedsOnExpiry?: boolean;
} = {}): Session {
  const fake = new FakeMessage(
    'message-1',
    { kind: 'channel', guildId: 'guild-1', channelId: 'channel-1' },
    'bot',
    'Pick one',
    () => {},
  );
  const message = fake.toMessage<true>();
  const metrics: Sentry.Metric[] = [];
  const stopWatching = watchSentryMetrics((metric) => metrics.push(metric));
  const editReply = vi.fn().mockResolvedValue(undefined);
  const interaction = mockOf<ButtonInteraction<'cached'>>({
    user: { id: 'user-1' },
    editReply,
    isChatInputCommand: () => false,
  });

  vi.spyOn(message, 'createMessageComponentCollector');
  const end = new ComponentSessionService(createAutoMock<ErrorService>()).run(
    interaction,
    message,
    {
      name: 'test',
      expiredContent: 'Expired',
      onCollect: () => Promise.resolve(),
      ...(clearEmbedsOnExpiry !== undefined && { clearEmbedsOnExpiry }),
    },
  );

  return { fake, message, metrics, stopWatching, end, editReply };
}

const it = base.extend<{ session: Session; clearingSession: Session }>({
  session: fresh(
    () => startSession(),
    ({ stopWatching }) => stopWatching(),
  ),
  clearingSession: fresh(
    () => startSession({ clearEmbedsOnExpiry: true }),
    ({ stopWatching }) => stopWatching(),
  ),
});

const EXPIRED_METRIC = Object.freeze({
  name: 'discord.prompt.expired',
  type: 'counter',
  value: 1,
  attributes: { component: 'test' },
});

describe('when a component session times out', () => {
  it('counts the expired prompt once, under its name', ({ session }) => {
    session.fake.expire();

    expect(session.metrics).toEqual([EXPIRED_METRIC]);
  });

  it('replaces the content and removes the components, keeping the embeds', async ({
    session,
  }) => {
    session.fake.expire();

    await vi.waitFor(() => expect(session.editReply).toHaveBeenCalled());
    expect(session.editReply.mock.calls).toEqual([
      [{ content: 'Expired', components: [] }],
    ]);
  });
});

describe('when a session that clears its embeds on expiry times out', () => {
  it('removes the embeds too', async ({ clearingSession }) => {
    clearingSession.fake.expire();

    await vi.waitFor(() =>
      expect(clearingSession.editReply).toHaveBeenCalled(),
    );
    expect(clearingSession.editReply.mock.calls).toEqual([
      [{ content: 'Expired', embeds: [], components: [] }],
    ]);
  });
});

describe('when a component session ends because its message was deleted', () => {
  it('counts no expired prompt', ({ session }) => {
    const collector = vi
      .mocked(session.message.createMessageComponentCollector)
      .mock.results.at(0);
    if (collector?.type !== 'return') throw new Error('no collector');

    collector.value.stop('messageDelete');

    expect(session.metrics).toEqual([]);
  });
});

describe('when a component session is ended before it times out', () => {
  it('stops collecting and never expires', ({ session }) => {
    session.end();
    session.fake.expire();

    expect({
      collecting: session.fake.isCollected(),
      metrics: session.metrics,
    }).toEqual({ collecting: false, metrics: [] });
  });
});
